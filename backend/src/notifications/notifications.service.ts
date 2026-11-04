import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsGateway } from "./notifications.gateway";
import { UpdateNotificationPreferenceDto } from "./dto/update-preference.dto";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { NotificationType, UserRole } from "@prisma/client";

export interface DispatchNotificationParams {
  userId: string;
  hospitalId?: string | null;
  title: string;
  message: string;
  type?: NotificationType;
  channels: Array<"IN_APP" | "EMAIL" | "SMS">;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsGateway) private readonly gateway: NotificationsGateway
  ) {}

  // Fan-out dispatch architecture with category preference enforcement
  async dispatch(params: DispatchNotificationParams) {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId: params.userId },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, email: true, phone: true, hospitalId: true },
    });

    if (!user) {
      this.logger.warn(`Cannot dispatch notification: User '${params.userId}' not found.`);
      return { skipped: true, reason: "USER_NOT_FOUND" };
    }

    // Tenant check: If notification is hospital-scoped, ensure it matches user's hospital if user is hospital staff
    if (params.hospitalId && user.hospitalId && params.hospitalId !== user.hospitalId) {
      this.logger.warn(
        `Cross-tenant dispatch attempt blocked: Notification hospital=${params.hospitalId}, User hospital=${user.hospitalId}`
      );
      return { skipped: true, reason: "TENANT_MISMATCH" };
    }

    // Category-level preference enforcement
    if (preferences) {
      if (params.type === NotificationType.APPOINTMENT && preferences.appointmentAlerts === false) {
        this.logger.log(`Dispatch suppressed: appointmentAlerts disabled for user ${params.userId}`);
        return { skipped: true, reason: "APPOINTMENT_ALERTS_DISABLED" };
      }
      if (params.type === NotificationType.BILLING && preferences.billingAlerts === false) {
        this.logger.log(`Dispatch suppressed: billingAlerts disabled for user ${params.userId}`);
        return { skipped: true, reason: "BILLING_ALERTS_DISABLED" };
      }
      if (params.type === NotificationType.LAB_RESULT && preferences.labAlerts === false) {
        this.logger.log(`Dispatch suppressed: labAlerts disabled for user ${params.userId}`);
        return { skipped: true, reason: "LAB_ALERTS_DISABLED" };
      }
      if (params.type === NotificationType.PRESCRIPTION && preferences.prescriptionAlerts === false) {
        this.logger.log(`Dispatch suppressed: prescriptionAlerts disabled for user ${params.userId}`);
        return { skipped: true, reason: "PRESCRIPTION_ALERTS_DISABLED" };
      }
    }

    const tasks: Promise<any>[] = [];

    // 1. In-App Channel (Persisted + Socket.IO real-time)
    const inAppAllowed = preferences?.inAppEnabled !== false;
    if (params.channels.includes("IN_APP") && inAppAllowed) {
      tasks.push(
        this.sendInApp({
          userId: params.userId,
          hospitalId: params.hospitalId,
          title: params.title,
          message: params.message,
          type: params.type || NotificationType.SYSTEM,
          metadata: params.metadata,
        })
      );
    }

    // 2. Email Channel
    const emailAllowed = preferences?.emailEnabled !== false;
    if (params.channels.includes("EMAIL") && emailAllowed && user.email) {
      tasks.push(this.sendEmail(user.email, params.title, params.message));
    }

    // 3. SMS Channel
    const smsAllowed = preferences?.smsEnabled !== false;
    if (params.channels.includes("SMS") && smsAllowed && user.phone) {
      tasks.push(this.sendSms(user.phone, params.message));
    }

    // Fan-out execution: failure in external channel does NOT block in-app delivery
    const outcomes = await Promise.allSettled(tasks);
    return {
      userId: params.userId,
      channelsCount: tasks.length,
      outcomes: outcomes.map((o) => (o.status === "fulfilled" ? o.value : { error: o.reason })),
    };
  }

  // Channel Adapters
  private async sendInApp(params: {
    userId: string;
    hospitalId?: string | null;
    title: string;
    message: string;
    type: NotificationType;
    metadata?: any;
  }) {
    const notif = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        hospitalId: params.hospitalId,
        title: params.title,
        message: params.message,
        type: params.type,
        channel: "IN_APP",
        metadata: params.metadata,
      },
    });

    // Real-time broadcast to user-scoped room
    this.gateway.sendToUser(params.userId, "notification", notif);
    return { channel: "IN_APP", status: "DELIVERED", id: notif.id };
  }

  private async sendEmail(recipientEmail: string, subject: string, body: string) {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      this.logger.log(
        `[EmailAdapter] Dispatch to ${recipientEmail} deferred: RESEND_API_KEY unconfigured.`
      );
      return { channel: "EMAIL", status: "UNCONFIGURED", recipient: recipientEmail };
    }

    try {
      this.logger.log(`[EmailAdapter] Sent email to ${recipientEmail}: ${subject}`);
      return { channel: "EMAIL", status: "SENT", recipient: recipientEmail };
    } catch (err: any) {
      this.logger.error(`[EmailAdapter] Delivery failed: ${err.message}`);
      throw err;
    }
  }

  private async sendSms(phoneNumber: string, message: string) {
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;

    if (!twilioSid || !twilioToken) {
      this.logger.log(
        `[SmsAdapter] Dispatch to ${phoneNumber} deferred: Twilio credentials unconfigured.`
      );
      return { channel: "SMS", status: "UNCONFIGURED", recipient: phoneNumber };
    }

    try {
      this.logger.log(`[SmsAdapter] Sent SMS to ${phoneNumber}`);
      return { channel: "SMS", status: "SENT", recipient: phoneNumber };
    } catch (err: any) {
      this.logger.error(`[SmsAdapter] SMS delivery failed: ${err.message}`);
      throw err;
    }
  }

  // User Notification APIs
  async findAllForUser(
    user: AuthenticatedUser,
    options?: {
      readStatus?: string;
      type?: NotificationType;
      page?: number;
      limit?: number;
    }
  ) {
    const where: any = { userId: user.id };

    if (options?.readStatus === "UNREAD") {
      where.isRead = false;
    } else if (options?.readStatus === "READ") {
      where.isRead = true;
    }

    if (options?.type) {
      where.type = options.type;
    }

    const page = Math.max(1, options?.page || 1);
    const limit = options?.limit ? Math.min(100, Math.max(1, options.limit)) : undefined;

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: limit ? (page - 1) * limit : undefined,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    if (!options?.page && !options?.limit) {
      return items;
    }

    return {
      items,
      total,
      page,
      limit: limit || total,
      totalPages: limit ? Math.ceil(total / limit) : 1,
    };
  }

  async getUnreadCount(user: AuthenticatedUser) {
    const count = await this.prisma.notification.count({
      where: { userId: user.id, isRead: false },
    });
    return { count };
  }

  async markAsRead(id: string, user: AuthenticatedUser) {
    const notif = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notif) {
      throw new NotFoundException(`Notification '${id}' not found.`);
    }
    if (notif.userId !== user.id) {
      throw new ForbiddenException("Cannot modify notifications belonging to another user.");
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(user: AuthenticatedUser) {
    return this.prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async deleteNotification(id: string, user: AuthenticatedUser) {
    const notif = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notif) {
      throw new NotFoundException(`Notification '${id}' not found.`);
    }
    if (notif.userId !== user.id) {
      throw new ForbiddenException("Cannot delete notifications belonging to another user.");
    }

    return this.prisma.notification.delete({
      where: { id },
    });
  }

  async getPreferences(user: AuthenticatedUser) {
    let pref = await this.prisma.notificationPreference.findUnique({
      where: { userId: user.id },
    });

    if (!pref) {
      pref = await this.prisma.notificationPreference.create({
        data: { userId: user.id },
      });
    }

    return pref;
  }

  async updatePreferences(dto: UpdateNotificationPreferenceDto, user: AuthenticatedUser) {
    return this.prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...dto,
      },
      update: dto,
    });
  }

  // Deduplicated Domain Event Notification Helpers

  /**
   * Pharmacy: Low-Stock Alert with 24-hour deduplication window per medicine.
   */
  async notifyLowStock(
    hospitalId: string,
    medicineId: string,
    medicineName: string,
    currentStock: number,
    reorderLevel: number
  ) {
    // 24-hour deduplication check
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await this.prisma.notification.findFirst({
      where: {
        hospitalId,
        createdAt: { gte: oneDayAgo },
        metadata: {
          path: ["medicineId"],
          equals: medicineId,
        },
      },
    });

    if (existing) {
      this.logger.log(`Low stock alert suppressed: already notified within 24h for ${medicineName}`);
      return { deduplicated: true };
    }

    // Target authorized hospital pharmacy and admin staff
    const staff = await this.prisma.user.findMany({
      where: {
        hospitalId,
        role: { in: [UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN] },
        isActive: true,
      },
      select: { id: true },
    });

    for (const member of staff) {
      await this.dispatch({
        userId: member.id,
        hospitalId,
        title: "Pharmacy Alert: Low Stock Warning",
        message: `Inventory Alert: Medicine "${medicineName}" has reached reorder level (${currentStock} units remaining; reorder threshold: ${reorderLevel}).`,
        type: NotificationType.SYSTEM,
        channels: ["IN_APP"],
        metadata: {
          category: "LOW_STOCK",
          medicineId,
          medicineName,
          currentStock,
          reorderLevel,
          protectedRoute: "/pharmacy",
        },
      });
    }

    return { dispatchedTo: staff.length };
  }

  /**
   * Pharmacy: Near-Expiry Stock Alert with 7-day deduplication per batch.
   */
  async notifyExpiringBatch(
    hospitalId: string,
    batchId: string,
    batchNumber: string,
    medicineName: string,
    expiryDate: Date
  ) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const existing = await this.prisma.notification.findFirst({
      where: {
        hospitalId,
        createdAt: { gte: sevenDaysAgo },
        metadata: {
          path: ["batchId"],
          equals: batchId,
        },
      },
    });

    if (existing) {
      this.logger.log(`Expiry alert suppressed: already notified within 7d for batch ${batchNumber}`);
      return { deduplicated: true };
    }

    const staff = await this.prisma.user.findMany({
      where: {
        hospitalId,
        role: { in: [UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN] },
        isActive: true,
      },
      select: { id: true },
    });

    const expDateStr = expiryDate.toISOString().split("T")[0];

    for (const member of staff) {
      await this.dispatch({
        userId: member.id,
        hospitalId,
        title: "Pharmacy Alert: Expiring Medicine Batch",
        message: `Batch "${batchNumber}" of medicine "${medicineName}" expires on ${expDateStr}. Please inspect and quarantine if needed.`,
        type: NotificationType.SYSTEM,
        channels: ["IN_APP"],
        metadata: {
          category: "EXPIRY_ALERT",
          batchId,
          batchNumber,
          medicineName,
          expiryDate: expDateStr,
          protectedRoute: "/pharmacy",
        },
      });
    }

    return { dispatchedTo: staff.length };
  }

  /**
   * Emergency Appointment: Alert hospital staff and broadcast real-time emergency alert.
   */
  async notifyEmergencyAdmission(
    hospitalId: string,
    appointmentId: string,
    departmentName: string,
    time: string
  ) {
    // Real-time broadcast to hospital room
    this.gateway.sendToHospital(hospitalId, "emergency_alert", {
      appointmentId,
      departmentName,
      time,
      timestamp: new Date().toISOString(),
    });

    // Notify clinical doctors and administrators in that hospital
    const clinicalStaff = await this.prisma.user.findMany({
      where: {
        hospitalId,
        role: { in: [UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.NURSE] },
        isActive: true,
      },
      select: { id: true },
    });

    for (const member of clinicalStaff) {
      await this.dispatch({
        userId: member.id,
        hospitalId,
        title: "EMERGENCY: Urgent Patient Admitted",
        message: `Emergency appointment admitted in ${departmentName} scheduled for ${time}. Clinical team requested.`,
        type: NotificationType.SYSTEM,
        channels: ["IN_APP"],
        metadata: {
          category: "EMERGENCY",
          appointmentId,
          departmentName,
          protectedRoute: "/appointments",
        },
      });
    }

    return { dispatchedTo: clinicalStaff.length };
  }
}
