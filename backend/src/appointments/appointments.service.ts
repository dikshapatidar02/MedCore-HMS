import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
  Optional,
  forwardRef,
} from "@nestjs/common";
import { UserRole, AppointmentStatus, AuditAction, Prisma, NotificationType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto";
import { UpdateAppointmentStatusDto } from "./dto/update-status.dto";
import { CancelAppointmentDto } from "./dto/cancel-appointment.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { ReminderQueueService } from "../notifications/reminder-queue.service";

const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.PENDING]: [
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CANCELLED,
  ],
  [AppointmentStatus.CONFIRMED]: [
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
  ],
  [AppointmentStatus.IN_PROGRESS]: [
    AppointmentStatus.COMPLETED,
    AppointmentStatus.CANCELLED,
  ],
  [AppointmentStatus.COMPLETED]: [],
  [AppointmentStatus.CANCELLED]: [],
  [AppointmentStatus.NO_SHOW]: [],
};

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notificationsService: NotificationsService,
    @Inject(ReminderQueueService) private readonly reminderQueueService: ReminderQueueService
  ) {}

  private timeToMinutes(time: string): number {
    const [hours, mins] = time.split(":").map(Number);
    return hours * 60 + mins;
  }

  private validateTimeRange(startTime: string, endTime: string) {
    const startMins = this.timeToMinutes(startTime);
    const endMins = this.timeToMinutes(endTime);
    if (startMins >= endMins) {
      throw new BadRequestException(
        `startTime '${startTime}' must be before endTime '${endTime}'.`
      );
    }
  }

  /**
   * Concurrency-safe advisory lock acquisition with strict deterministic ordering
   * to eliminate deadlocks across concurrent booking and rescheduling operations.
   */
  private async acquireSchedulingLocks(
    tx: Prisma.TransactionClient,
    targets: Array<{ resource: string; date: string }>
  ): Promise<void> {
    const uniqueMap = new Map<string, { resource: string; date: string }>();
    for (const t of targets) {
      uniqueMap.set(`${t.resource}:${t.date}`, t);
    }

    // Sort deterministically by resource identifier then date string to enforce total lock hierarchy
    const sortedTargets = Array.from(uniqueMap.values()).sort((a, b) => {
      const cmp = a.resource.localeCompare(b.resource);
      if (cmp !== 0) return cmp;
      return a.date.localeCompare(b.date);
    });

    for (const target of sortedTargets) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${target.resource}), hashtext(${target.date}))`;
    }
  }


  async create(createDto: CreateAppointmentDto, user: AuthenticatedUser) {
    this.validateTimeRange(createDto.startTime, createDto.endTime);

    // 1. Fetch Patient and validate tenant and self-access
    const patient = await this.prisma.patient.findUnique({
      where: { id: createDto.patientId },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient not found.");
    }

    const targetHospitalId = patient.hospitalId;

    if (user.role !== UserRole.SUPER_ADMIN && user.hospitalId !== targetHospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Patient belongs to another hospital."
      );
    }

    if (user.role === UserRole.PATIENT && patient.userId !== user.id) {
      throw new ForbiddenException(
        "Patient self-booking restriction: You can only book appointments for yourself."
      );
    }

    // 2. Fetch Doctor and validate tenant boundary
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: createDto.doctorId },
      include: { department: true },
    });

    if (!doctor || doctor.deletedAt) {
      throw new NotFoundException("Doctor not found.");
    }

    if (doctor.hospitalId !== targetHospitalId) {
      throw new ForbiddenException(
        "Cross-hospital violation: Selected doctor does not belong to the same hospital as the patient."
      );
    }

    // 3. Department validation (use provided or fallback to doctor's department)
    const departmentId = createDto.departmentId || doctor.departmentId;
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department || department.hospitalId !== targetHospitalId) {
      throw new ForbiddenException(
        "Cross-hospital violation: Department does not belong to the hospital."
      );
    }

    // 4. Validate appointment date is not in the past
    const apptDate = new Date(`${createDto.appointmentDate}T00:00:00.000Z`);
    if (isNaN(apptDate.getTime())) {
      throw new BadRequestException("Invalid appointment date format. Expected YYYY-MM-DD.");
    }

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    if (apptDate < todayUtc && !createDto.isEmergency) {
      throw new BadRequestException("Cannot book appointments for past dates.");
    }

    // 5. Doctor availability check (unless emergency)
    if (!createDto.isEmergency) {
      // Check full-day leave
      const fullDayLeave = await this.prisma.doctorScheduleException.findFirst({
        where: {
          doctorId: doctor.id,
          date: apptDate,
          startTime: null,
          isAvailable: false,
        },
      });

      if (fullDayLeave) {
        throw new BadRequestException(
          `Doctor is on leave on ${createDto.appointmentDate}: ${fullDayLeave.reason || "Unavailable"}`
        );
      }

      // Check partial-day exceptions (time off / leave)
      const startMins = this.timeToMinutes(createDto.startTime);
      const endMins = this.timeToMinutes(createDto.endTime);

      const partialExceptions = await this.prisma.doctorScheduleException.findMany({
        where: {
          doctorId: doctor.id,
          date: apptDate,
          startTime: { not: null },
          isAvailable: false,
        },
      });

      for (const ex of partialExceptions) {
        if (ex.startTime && ex.endTime) {
          const exStart = this.timeToMinutes(ex.startTime);
          const exEnd = this.timeToMinutes(ex.endTime);
          if (Math.max(startMins, exStart) < Math.min(endMins, exEnd)) {
            throw new BadRequestException(
              `Doctor is unavailable during ${ex.startTime}-${ex.endTime}: ${ex.reason || "Leave"}`
            );
          }
        }
      }

      // Check weekly availability
      const dayOfWeek = apptDate.getUTCDay();
      const weeklyAvailabilities = await this.prisma.doctorAvailability.findMany({
        where: {
          doctorId: doctor.id,
          dayOfWeek,
          isAvailable: true,
        },
      });

      const withinWorkingHours = weeklyAvailabilities.some((avail) => {
        const availStart = this.timeToMinutes(avail.startTime);
        const availEnd = this.timeToMinutes(avail.endTime);
        return startMins >= availStart && endMins <= availEnd;
      });

      if (!withinWorkingHours && weeklyAvailabilities.length > 0) {
        throw new BadRequestException(
          `Requested time ${createDto.startTime}-${createDto.endTime} is outside doctor's working hours.`
        );
      }
    }

    // 6. Concurrency-safe double-booking prevention using PostgreSQL advisory transaction locks
    const created = await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent booking attempts for this doctor and patient on this date in deterministic order
      await this.acquireSchedulingLocks(tx, [
        { resource: `doctor_${doctor.id}`, date: createDto.appointmentDate },
        { resource: `patient_${patient.id}`, date: createDto.appointmentDate },
      ]);

      const startMins = this.timeToMinutes(createDto.startTime);
      const endMins = this.timeToMinutes(createDto.endTime);

      // Check doctor conflicts
      const doctorActiveAppts = await tx.appointment.findMany({
        where: {
          doctorId: doctor.id,
          appointmentDate: apptDate,
          deletedAt: null,
          status: {
            notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
          },
        },
        select: { id: true, startTime: true, endTime: true },
      });

      const doctorHasConflict = doctorActiveAppts.some((appt) => {
        const apptStart = this.timeToMinutes(appt.startTime);
        const apptEnd = this.timeToMinutes(appt.endTime);
        return Math.max(startMins, apptStart) < Math.min(endMins, apptEnd);
      });

      if (doctorHasConflict) {
        throw new ConflictException(
          `Double-booking conflict: Doctor already has an active appointment between ${createDto.startTime} and ${createDto.endTime}.`
        );
      }

      // Check patient conflicts
      const patientActiveAppts = await tx.appointment.findMany({
        where: {
          patientId: patient.id,
          appointmentDate: apptDate,
          deletedAt: null,
          status: {
            notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
          },
        },
        select: { id: true, startTime: true, endTime: true },
      });

      const patientHasConflict = patientActiveAppts.some((appt) => {
        const apptStart = this.timeToMinutes(appt.startTime);
        const apptEnd = this.timeToMinutes(appt.endTime);
        return Math.max(startMins, apptStart) < Math.min(endMins, apptEnd);
      });

      if (patientHasConflict) {
        throw new ConflictException(
          `Patient conflict: Patient already has an active appointment booked during this time window.`
        );
      }

      const appointment = await tx.appointment.create({
        data: {
          hospitalId: targetHospitalId,
          patientId: patient.id,
          doctorId: doctor.id,
          departmentId,
          appointmentDate: apptDate,
          startTime: createDto.startTime,
          endTime: createDto.endTime,
          type: createDto.type || "CONSULTATION",
          status: AppointmentStatus.PENDING,
          reason: createDto.reason.trim(),
          notes: createDto.notes?.trim(),
          isEmergency: createDto.isEmergency ?? false,
        },
        include: {
          doctor: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          patient: {
            select: {
              id: true,
              userId: true,
              mrn: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
          department: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: targetHospitalId,
          userId: user.id,
          action: AuditAction.CREATE,
          entityName: "Appointment",
          entityId: appointment.id,
          details: {
            patientId: patient.id,
            doctorId: doctor.id,
            date: createDto.appointmentDate,
            time: `${createDto.startTime}-${createDto.endTime}`,
          },
        },
      });

      return appointment;
    });

    // Phase 12 Notification and Queue Triggering
    if (this.notificationsService) {
      if (created.patient?.userId) {
        const doctorName = created.doctor?.user
          ? `Dr. ${created.doctor.user.firstName} ${created.doctor.user.lastName}`
          : "your doctor";
        await this.notificationsService.dispatch({
          userId: created.patient.userId,
          hospitalId: targetHospitalId,
          title: "Appointment Booked",
          message: `Your appointment with ${doctorName} has been booked for ${createDto.appointmentDate} at ${createDto.startTime}.`,
          type: NotificationType.APPOINTMENT,
          channels: ["IN_APP", "EMAIL", "SMS"],
          metadata: {
            appointmentId: created.id,
            appointmentDate: createDto.appointmentDate,
            startTime: createDto.startTime,
            protectedRoute: "/appointments",
          },
        }).catch((err) => this.logger.warn(`Failed to dispatch patient booking notification: ${err.message}`));
      }

      if (created.doctor?.user?.id) {
        await this.notificationsService.dispatch({
          userId: created.doctor.user.id,
          hospitalId: targetHospitalId,
          title: "New Appointment Scheduled",
          message: `New appointment scheduled with patient ${created.patient.firstName} ${created.patient.lastName} on ${createDto.appointmentDate} at ${createDto.startTime}.`,
          type: NotificationType.APPOINTMENT,
          channels: ["IN_APP"],
          metadata: {
            appointmentId: created.id,
            protectedRoute: "/appointments",
          },
        }).catch((err) => this.logger.warn(`Failed to dispatch doctor booking notification: ${err.message}`));
      }

      if (createDto.isEmergency) {
        await this.notificationsService.notifyEmergencyAdmission(
          targetHospitalId,
          created.id,
          created.department?.name || "Emergency Department",
          createDto.startTime
        ).catch((err) => this.logger.warn(`Failed to dispatch emergency alert: ${err.message}`));
      }
    }

    if (this.reminderQueueService) {
      this.reminderQueueService.scheduleAppointmentReminders({
        id: created.id,
        hospitalId: targetHospitalId,
        patientId: created.patientId,
        doctorId: created.doctorId,
        appointmentDate: createDto.appointmentDate,
        startTime: createDto.startTime,
      }).catch((err) => this.logger.warn(`Failed to schedule appointment reminders: ${err.message}`));
    }

    return created;
  }

  async findAll(
    user: AuthenticatedUser,
    options: {
      search?: string;
      doctorId?: string;
      patientId?: string;
      departmentId?: string;
      status?: AppointmentStatus;
      date?: string;
      page?: number;
      limit?: number;
      hospitalId?: string;
    }
  ) {
    const targetHospitalId =
      user.role === UserRole.SUPER_ADMIN && options.hospitalId
        ? options.hospitalId
        : user.hospitalId;

    if (!targetHospitalId && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Tenant context required.");
    }

    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, options.limit || 50);
    const skip = (page - 1) * limit;

    const where: Prisma.AppointmentWhereInput = {
      deletedAt: null,
    };

    if (targetHospitalId) {
      where.hospitalId = targetHospitalId;
    }

    // Role-based scoping
    if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findUnique({
        where: { userId: user.id },
      });
      if (!patient) {
        return { items: [], total: 0, page, limit, totalPages: 0 };
      }
      where.patientId = patient.id;
    } else if (user.role === UserRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) {
        return { items: [], total: 0, page, limit, totalPages: 0 };
      }
      where.doctorId = doctor.id;
    } else {
      // Staff can filter by doctor or patient
      if (options.doctorId) where.doctorId = options.doctorId;
      if (options.patientId) where.patientId = options.patientId;
    }

    if (options.departmentId) where.departmentId = options.departmentId;
    if (options.status) where.status = options.status;
    if (options.date) {
      where.appointmentDate = new Date(`${options.date}T00:00:00.000Z`);
    }

    if (options.search) {
      where.OR = [
        { reason: { contains: options.search, mode: "insensitive" } },
        { patient: { firstName: { contains: options.search, mode: "insensitive" } } },
        { patient: { lastName: { contains: options.search, mode: "insensitive" } } },
        { patient: { mrn: { contains: options.search, mode: "insensitive" } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        include: {
          doctor: {
            include: {
              user: {
                select: { firstName: true, lastName: true, email: true },
              },
            },
          },
          patient: {
            select: {
              id: true,
              mrn: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
          department: {
            select: { id: true, name: true, code: true },
          },
        },
        orderBy: [{ appointmentDate: "desc" }, { startTime: "asc" }],
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        doctor: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            department: true,
          },
        },
        patient: {
          include: {
            address: true,
          },
        },
        department: true,
        medicalRecord: true,
        invoice: true,
      },
    });

    if (!appointment || appointment.deletedAt) {
      throw new NotFoundException("Appointment not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && appointment.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Access to appointment from another hospital is strictly forbidden."
      );
    }

    if (user.role === UserRole.PATIENT && appointment.patient.userId !== user.id) {
      throw new ForbiddenException("Patients can only view their own appointments.");
    }

    if (user.role === UserRole.DOCTOR && appointment.doctor.userId !== user.id) {
      throw new ForbiddenException("Doctors can only view their own appointments.");
    }

    return appointment;
  }

  async reschedule(
    id: string,
    dto: RescheduleAppointmentDto,
    user: AuthenticatedUser
  ) {
    this.validateTimeRange(dto.startTime, dto.endTime);

    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { patient: true, doctor: true },
    });

    if (!appointment || appointment.deletedAt) {
      throw new NotFoundException("Appointment not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && appointment.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation.");
    }

    if (user.role === UserRole.PATIENT && appointment.patient.userId !== user.id) {
      throw new ForbiddenException("Patients can only reschedule their own appointments.");
    }

    // Terminal statuses cannot be rescheduled
    if (
      (
        [
          AppointmentStatus.COMPLETED,
          AppointmentStatus.CANCELLED,
          AppointmentStatus.NO_SHOW,
        ] as AppointmentStatus[]
      ).includes(appointment.status)
    ) {
      throw new BadRequestException(
        `Cannot reschedule appointment with terminal status '${appointment.status}'.`
      );
    }

    const newApptDate = new Date(`${dto.appointmentDate}T00:00:00.000Z`);
    if (isNaN(newApptDate.getTime())) {
      throw new BadRequestException("Invalid appointment date format.");
    }

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    if (newApptDate < todayUtc) {
      throw new BadRequestException("Cannot reschedule to a past date.");
    }

    // Check full-day leave on new date
    const fullDayLeave = await this.prisma.doctorScheduleException.findFirst({
      where: {
        doctorId: appointment.doctorId,
        date: newApptDate,
        startTime: null,
        isAvailable: false,
      },
    });

    if (fullDayLeave) {
      throw new BadRequestException(
        `Doctor is on leave on ${dto.appointmentDate}: ${fullDayLeave.reason || "Unavailable"}`
      );
    }

    // Check partial-day exceptions on new date
    const startMins = this.timeToMinutes(dto.startTime);
    const endMins = this.timeToMinutes(dto.endTime);

    const partialExceptions = await this.prisma.doctorScheduleException.findMany({
      where: {
        doctorId: appointment.doctorId,
        date: newApptDate,
        startTime: { not: null },
        isAvailable: false,
      },
    });

    for (const ex of partialExceptions) {
      if (ex.startTime && ex.endTime) {
        const exStart = this.timeToMinutes(ex.startTime);
        const exEnd = this.timeToMinutes(ex.endTime);
        if (Math.max(startMins, exStart) < Math.min(endMins, exEnd)) {
          throw new BadRequestException(
            `Doctor is unavailable during ${ex.startTime}-${ex.endTime}: ${ex.reason || "Leave"}`
          );
        }
      }
    }

    // Check weekly working hours on new date
    const dayOfWeek = newApptDate.getUTCDay();
    const weeklyAvailabilities = await this.prisma.doctorAvailability.findMany({
      where: {
        doctorId: appointment.doctorId,
        dayOfWeek,
        isAvailable: true,
      },
    });

    const withinWorkingHours = weeklyAvailabilities.some((avail) => {
      const availStart = this.timeToMinutes(avail.startTime);
      const availEnd = this.timeToMinutes(avail.endTime);
      return startMins >= availStart && endMins <= availEnd;
    });

    if (!withinWorkingHours && weeklyAvailabilities.length > 0) {
      throw new BadRequestException(
        `Requested time ${dto.startTime}-${dto.endTime} is outside doctor's working hours.`
      );
    }

    const rescheduled = await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent rescheduling/booking attempts on the new date and old date in deterministic order
      const targets = [
        { resource: `doctor_${appointment.doctorId}`, date: dto.appointmentDate },
        { resource: `patient_${appointment.patientId}`, date: dto.appointmentDate },
      ];
      const oldDateStr = appointment.appointmentDate.toISOString().split("T")[0];
      if (oldDateStr !== dto.appointmentDate) {
        targets.push({ resource: `doctor_${appointment.doctorId}`, date: oldDateStr });
        targets.push({ resource: `patient_${appointment.patientId}`, date: oldDateStr });
      }
      await this.acquireSchedulingLocks(tx, targets);

      // Check doctor conflicts (excluding this appointment)
      const doctorActiveAppts = await tx.appointment.findMany({
        where: {
          id: { not: id },
          doctorId: appointment.doctorId,
          appointmentDate: newApptDate,
          deletedAt: null,
          status: {
            notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
          },
        },
        select: { id: true, startTime: true, endTime: true },
      });

      const doctorHasConflict = doctorActiveAppts.some((appt) => {
        const apptStart = this.timeToMinutes(appt.startTime);
        const apptEnd = this.timeToMinutes(appt.endTime);
        return Math.max(startMins, apptStart) < Math.min(endMins, apptEnd);
      });

      if (doctorHasConflict) {
        throw new ConflictException(
          `Doctor already has an active appointment booked during ${dto.startTime}-${dto.endTime}.`
        );
      }

      // Check patient conflicts (excluding this appointment)
      const patientActiveAppts = await tx.appointment.findMany({
        where: {
          id: { not: id },
          patientId: appointment.patientId,
          appointmentDate: newApptDate,
          deletedAt: null,
          status: {
            notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
          },
        },
        select: { id: true, startTime: true, endTime: true },
      });

      const patientHasConflict = patientActiveAppts.some((appt) => {
        const apptStart = this.timeToMinutes(appt.startTime);
        const apptEnd = this.timeToMinutes(appt.endTime);
        return Math.max(startMins, apptStart) < Math.min(endMins, apptEnd);
      });

      if (patientHasConflict) {
        throw new ConflictException(
          `Patient already has an active appointment booked during this time window.`
        );
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          appointmentDate: newApptDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          notes: dto.reason
            ? `${appointment.notes || ""}\n[Rescheduled: ${dto.reason}]`.trim()
            : appointment.notes,
        },
        include: {
          doctor: {
            include: {
              user: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          patient: true,
          department: true,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: appointment.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "Appointment",
          entityId: id,
          details: {
            action: "RESCHEDULE",
            oldDate: appointment.appointmentDate,
            oldTime: `${appointment.startTime}-${appointment.endTime}`,
            newDate: dto.appointmentDate,
            newTime: `${dto.startTime}-${dto.endTime}`,
            reason: dto.reason,
          },
        },
      });

      return updated;
    });

    if (this.notificationsService && rescheduled.patient?.userId) {
      const doctorName = rescheduled.doctor?.user
        ? `Dr. ${rescheduled.doctor.user.firstName} ${rescheduled.doctor.user.lastName}`
        : "your doctor";
      await this.notificationsService.dispatch({
        userId: rescheduled.patient.userId,
        hospitalId: rescheduled.hospitalId,
        title: "Appointment Rescheduled",
        message: `Your appointment with ${doctorName} has been rescheduled to ${dto.appointmentDate} at ${dto.startTime}.`,
        type: NotificationType.APPOINTMENT,
        channels: ["IN_APP", "EMAIL", "SMS"],
        metadata: {
          appointmentId: rescheduled.id,
          appointmentDate: dto.appointmentDate,
          startTime: dto.startTime,
          protectedRoute: "/appointments",
        },
      }).catch((err) => this.logger.warn(`Failed to dispatch reschedule notification: ${err.message}`));
    }

    if (this.reminderQueueService) {
      this.reminderQueueService.rescheduleAppointmentReminders({
        id: rescheduled.id,
        hospitalId: rescheduled.hospitalId,
        patientId: rescheduled.patientId,
        doctorId: rescheduled.doctorId,
        appointmentDate: dto.appointmentDate,
        startTime: dto.startTime,
      }).catch((err) => this.logger.warn(`Failed to reschedule appointment reminders: ${err.message}`));
    }

    return rescheduled;
  }

  async updateStatus(
    id: string,
    dto: UpdateAppointmentStatusDto,
    user: AuthenticatedUser
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { doctor: true },
    });

    if (!appointment || appointment.deletedAt) {
      throw new NotFoundException("Appointment not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && appointment.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation.");
    }

    // Role checks: Doctor can update own, Staff can update, Patient CANNOT update status directly (only cancel)
    if (user.role === UserRole.PATIENT) {
      throw new ForbiddenException(
        "Patients cannot modify appointment status directly. Use the cancellation endpoint instead."
      );
    }

    if (user.role === UserRole.DOCTOR && appointment.doctor.userId !== user.id) {
      throw new ForbiddenException("Doctors can only update status for their own appointments.");
    }

    // Enforce status state machine
    const allowedTransitions = VALID_TRANSITIONS[appointment.status] || [];
    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition from '${appointment.status}' to '${dto.status}'. Allowed transitions: [${allowedTransitions.join(", ")}].`
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes
          ? `${appointment.notes || ""}\n[Status Change to ${dto.status}: ${dto.notes}]`.trim()
          : appointment.notes,
      },
      include: {
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        patient: true,
        department: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: appointment.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "Appointment",
        entityId: id,
        details: {
          action: "STATUS_CHANGE",
          from: appointment.status,
          to: dto.status,
          notes: dto.notes,
        },
      },
    });

    return updated;
  }

  async cancel(id: string, dto: CancelAppointmentDto, user: AuthenticatedUser) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { patient: true, doctor: true },
    });

    if (!appointment || appointment.deletedAt) {
      throw new NotFoundException("Appointment not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && appointment.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation.");
    }

    if (user.role === UserRole.PATIENT && appointment.patient.userId !== user.id) {
      throw new ForbiddenException("Patients can only cancel their own appointments.");
    }

    if (user.role === UserRole.DOCTOR && appointment.doctor.userId !== user.id) {
      throw new ForbiddenException("Doctors can only cancel their own appointments.");
    }

    if (
      (
        [
          AppointmentStatus.COMPLETED,
          AppointmentStatus.CANCELLED,
          AppointmentStatus.NO_SHOW,
        ] as AppointmentStatus[]
      ).includes(appointment.status)
    ) {
      throw new BadRequestException(
        `Cannot cancel appointment that is already '${appointment.status}'.`
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
        notes: `${appointment.notes || ""}\n[Cancelled: ${dto.reason.trim()}]`.trim(),
      },
      include: {
        doctor: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        patient: true,
        department: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: appointment.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "Appointment",
        entityId: id,
        details: {
          action: "CANCEL",
          reason: dto.reason.trim(),
        },
      },
    });

    if (this.notificationsService && updated.patient?.userId) {
      const doctorName = updated.doctor?.user
        ? `Dr. ${updated.doctor.user.firstName} ${updated.doctor.user.lastName}`
        : "your doctor";
      const dateStr =
        updated.appointmentDate instanceof Date
          ? updated.appointmentDate.toISOString().split("T")[0]
          : String(updated.appointmentDate).split("T")[0];
      await this.notificationsService.dispatch({
        userId: updated.patient.userId,
        hospitalId: updated.hospitalId,
        title: "Appointment Cancelled",
        message: `Your appointment with ${doctorName} on ${dateStr} at ${updated.startTime} has been cancelled.`,
        type: NotificationType.APPOINTMENT,
        channels: ["IN_APP", "EMAIL", "SMS"],
        metadata: {
          appointmentId: updated.id,
          reason: dto.reason.trim(),
          protectedRoute: "/appointments",
        },
      }).catch((err) => this.logger.warn(`Failed to dispatch cancel notification: ${err.message}`));
    }

    if (this.reminderQueueService) {
      this.reminderQueueService.cancelAppointmentReminders(updated.id)
        .catch((err) => this.logger.warn(`Failed to cancel appointment reminders: ${err.message}`));
    }

    return updated;
  }
}
