import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from "@nestjs/common";
import { Queue, Worker, Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";
import { AppointmentStatus, NotificationType } from "@prisma/client";

export type ReminderType = "24_HOUR" | "1_HOUR";

export interface ReminderJobPayload {
  appointmentId: string;
  reminderType: ReminderType;
  scheduledFor: string;
}

@Injectable()
export class ReminderQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderQueueService.name);
  private reminderQueue: Queue<ReminderJobPayload> | null = null;
  private reminderWorker: Worker<ReminderJobPayload> | null = null;
  private isRedisConnected = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService
  ) {}

  async onModuleInit() {
    const rawRedisHost = process.env.REDIS_HOST;
    // When REDIS_HOST is unconfigured or empty (e.g. ₹0 free-tier deployment), run in direct fallback mode without connecting to localhost
    if (!rawRedisHost || rawRedisHost.trim() === "") {
      this.isRedisConnected = false;
      this.reminderQueue = null;
      this.reminderWorker = null;
      this.logger.log(
        "REDIS_HOST is unconfigured. BullMQ appointment reminder queue disabled (running in direct fallback mode)."
      );
      return;
    }

    const redisHost = rawRedisHost.trim();
    const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
    const redisPassword = process.env.REDIS_PASSWORD || undefined;
    const redisTls = process.env.REDIS_TLS === "true" ? {} : undefined;

    const connectionOptions: any = {
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      tls: redisTls,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };

    try {
      this.reminderQueue = new Queue<ReminderJobPayload>("appointment-reminders", {
        connection: connectionOptions,
      });

      this.reminderWorker = new Worker<ReminderJobPayload>(
        "appointment-reminders",
        async (job: Job<ReminderJobPayload>) => {
          this.logger.log(`Processing reminder job: ${job.id} for appt=${job.data.appointmentId}`);
          return this.processReminder(job.data.appointmentId, job.data.reminderType);
        },
        {
          connection: connectionOptions,
          concurrency: parseInt(process.env.WORKER_CONCURRENCY || "5", 10),
        }
      );

      // Register safe error listeners to prevent uncaught exceptions if Redis disconnects
      this.reminderQueue.on("error", (err) => {
        this.logger.warn(`BullMQ reminder queue error: ${err.message}`);
        this.isRedisConnected = false;
      });

      this.reminderWorker.on("error", (err) => {
        this.logger.warn(`BullMQ reminder worker error: ${err.message}`);
        this.isRedisConnected = false;
      });

      this.reminderWorker.on("completed", (job) => {
        this.logger.log(`Reminder job ${job.id} completed successfully.`);
      });

      this.reminderWorker.on("failed", (job, err) => {
        this.logger.error(`Reminder job ${job?.id} failed: ${err.message}`);
      });

      this.isRedisConnected = true;
      this.logger.log("BullMQ appointment-reminders queue and worker initialized.");
    } catch (err: any) {
      this.isRedisConnected = false;
      this.logger.warn(
        `BullMQ Redis initialization deferred or unconfigured: ${err.message}. Reminders will use direct fallback.`
      );
    }
  }

  async onModuleDestroy() {
    try {
      if (this.reminderWorker) {
        await this.reminderWorker.close();
      }
      if (this.reminderQueue) {
        await this.reminderQueue.close();
      }
    } catch (err: any) {
      this.logger.warn(`Error closing reminder queue/worker: ${err.message}`);
    }
  }

  /**
   * Health probe helper to check whether Redis/BullMQ worker connection is healthy.
   */
  public isConnected(): boolean {
    return this.isRedisConnected;
  }

  /**
   * Schedule 24-hour and 1-hour reminders for an appointment.
   * Jobs are deduplicated via deterministic jobIds.
   */
  async scheduleAppointmentReminders(appointment: {
    id: string;
    hospitalId: string;
    patientId: string;
    doctorId: string;
    appointmentDate: Date | string;
    startTime: string;
  }) {
    const targetDateStr =
      appointment.appointmentDate instanceof Date
        ? appointment.appointmentDate.toISOString().split("T")[0]
        : String(appointment.appointmentDate).split("T")[0];

    const [hours, minutes] = appointment.startTime.split(":").map(Number);
    const appointmentDateTime = new Date(`${targetDateStr}T00:00:00.000Z`);
    appointmentDateTime.setUTCHours(hours, minutes, 0, 0);

    const now = Date.now();
    const apptTime = appointmentDateTime.getTime();

    // 24-hour reminder target
    const target24h = apptTime - 24 * 60 * 60 * 1000;
    // 1-hour reminder target
    const target1h = apptTime - 60 * 60 * 1000;

    const scheduled: string[] = [];

    if (this.reminderQueue && this.isRedisConnected) {
      try {
        if (target24h > now) {
          const delay24h = target24h - now;
          await this.reminderQueue.add(
            "reminder-24h",
            {
              appointmentId: appointment.id,
              reminderType: "24_HOUR",
              scheduledFor: new Date(target24h).toISOString(),
            },
            {
              jobId: `reminder_24h_${appointment.id}`,
              delay: delay24h,
              attempts: 3,
              backoff: { type: "exponential", delay: 5000 },
              removeOnComplete: true,
            }
          );
          scheduled.push("24_HOUR");
        }

        if (target1h > now) {
          const delay1h = target1h - now;
          await this.reminderQueue.add(
            "reminder-1h",
            {
              appointmentId: appointment.id,
              reminderType: "1_HOUR",
              scheduledFor: new Date(target1h).toISOString(),
            },
            {
              jobId: `reminder_1h_${appointment.id}`,
              delay: delay1h,
              attempts: 3,
              backoff: { type: "exponential", delay: 5000 },
              removeOnComplete: true,
            }
          );
          scheduled.push("1_HOUR");
        }
      } catch (err: any) {
        this.logger.warn(`Failed to enqueue reminder jobs to BullMQ: ${err.message}`);
      }
    }

    return {
      appointmentId: appointment.id,
      scheduled,
      appointmentDateTime: appointmentDateTime.toISOString(),
    };
  }

  /**
   * Cancel pending reminders when an appointment is cancelled or deleted.
   */
  async cancelAppointmentReminders(appointmentId: string) {
    if (!this.reminderQueue) return;

    try {
      const job24h = await this.reminderQueue.getJob(`reminder_24h_${appointmentId}`);
      if (job24h) {
        await job24h.remove();
        this.logger.log(`Removed 24h reminder job for appt=${appointmentId}`);
      }

      const job1h = await this.reminderQueue.getJob(`reminder_1h_${appointmentId}`);
      if (job1h) {
        await job1h.remove();
        this.logger.log(`Removed 1h reminder job for appt=${appointmentId}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not cancel reminder jobs from queue: ${err.message}`);
    }
  }

  /**
   * Reschedule reminders when an appointment time or date changes.
   */
  async rescheduleAppointmentReminders(appointment: {
    id: string;
    hospitalId: string;
    patientId: string;
    doctorId: string;
    appointmentDate: Date | string;
    startTime: string;
  }) {
    await this.cancelAppointmentReminders(appointment.id);
    return this.scheduleAppointmentReminders(appointment);
  }

  /**
   * Process a reminder job (can be triggered by BullMQ worker or direct call).
   * Validates:
   * 1. Appointment existence and terminal states (CANCELLED, COMPLETED, NO_SHOW).
   * 2. Deduplication check: Avoid sending duplicate reminders for the same appointment schedule.
   * 3. Patient notification preferences and user presence.
   */
  async processReminder(appointmentId: string, reminderType: ReminderType) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          select: {
            id: true,
            userId: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!appointment || appointment.deletedAt) {
      this.logger.warn(`Reminder skipped: Appointment '${appointmentId}' not found or deleted.`);
      return { status: "SKIPPED", reason: "NOT_FOUND" };
    }

    // Do NOT send reminders for cancelled, completed, or no-show appointments
    if (
      appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.COMPLETED ||
      appointment.status === AppointmentStatus.NO_SHOW
    ) {
      this.logger.log(
        `Reminder skipped: Appointment '${appointmentId}' is in status '${appointment.status}'.`
      );
      return { status: "SKIPPED", reason: `APPOINTMENT_${appointment.status}` };
    }

    if (!appointment.patient.userId) {
      this.logger.log(
        `Reminder skipped: Patient '${appointment.patient.id}' does not have a linked user account.`
      );
      return { status: "SKIPPED", reason: "NO_PORTAL_USER" };
    }

    const patientUserId = appointment.patient.userId;

    // Idempotency: Deduplicate across repeated executions
    const existingNotifs = await this.prisma.notification.findMany({
      where: {
        userId: patientUserId,
        type: NotificationType.APPOINTMENT,
      },
    });

    const isDuplicate = existingNotifs.some((n) => {
      const meta = n.metadata as Record<string, any> | null;
      return meta?.appointmentId === appointment.id && meta?.reminderType === reminderType;
    });

    if (isDuplicate) {
      this.logger.log(
        `Duplicate reminder suppressed for appt=${appointment.id}, reminderType=${reminderType}`
      );
      return { status: "SKIPPED", reason: "DUPLICATE_REMINDER_SUPPRESSED" };
    }

    const doctorName = appointment.doctor?.user
      ? `Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`
      : "your doctor";

    const dateStr =
      appointment.appointmentDate instanceof Date
        ? appointment.appointmentDate.toISOString().split("T")[0]
        : String(appointment.appointmentDate).split("T")[0];

    const timeWindow = reminderType === "24_HOUR" ? "tomorrow" : "in approximately 1 hour";

    const dispatchResult = await this.notificationsService.dispatch({
      userId: patientUserId,
      hospitalId: appointment.hospitalId,
      title: `Upcoming Appointment Reminder (${reminderType === "24_HOUR" ? "24 Hours" : "1 Hour"})`,
      message: `Reminder: You have an appointment with ${doctorName} scheduled for ${dateStr} at ${appointment.startTime} (${timeWindow}).`,
      type: NotificationType.APPOINTMENT,
      channels: ["IN_APP", "EMAIL", "SMS"],
      metadata: {
        appointmentId: appointment.id,
        reminderType,
        appointmentDate: dateStr,
        startTime: appointment.startTime,
        protectedRoute: "/appointments",
      },
    });

    return {
      status: "SENT",
      appointmentId: appointment.id,
      reminderType,
      dispatchResult,
    };
  }

  async getQueueStatus() {
    if (!this.reminderQueue) {
      return {
        configured: false,
        isRedisConnected: false,
        message: "BullMQ queue uninitialized or Redis unavailable.",
      };
    }

    const [waiting, delayed, active, completed, failed] = await Promise.all([
      this.reminderQueue.getWaitingCount(),
      this.reminderQueue.getDelayedCount(),
      this.reminderQueue.getActiveCount(),
      this.reminderQueue.getCompletedCount(),
      this.reminderQueue.getFailedCount(),
    ]);

    return {
      configured: true,
      isRedisConnected: this.isRedisConnected,
      counts: { waiting, delayed, active, completed, failed },
    };
  }
}
