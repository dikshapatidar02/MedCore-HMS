import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole, AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { SetWeeklyAvailabilityDto, AvailabilitySlotDto } from "./dto/set-availability.dto";
import { CreateScheduleExceptionDto } from "./dto/create-exception.dto";

@Injectable()
export class SchedulingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private timeToMinutes(time: string): number {
    const [hours, mins] = time.split(":").map(Number);
    return hours * 60 + mins;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  }

  private async getDoctorAndValidate(doctorId: string, user: AuthenticatedUser) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { user: true },
    });

    if (!doctor || doctor.deletedAt) {
      throw new NotFoundException("Doctor not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && doctor.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Access to doctor schedule from another hospital is forbidden."
      );
    }

    return doctor;
  }

  private validateManagePermission(doctor: { userId: string }, user: AuthenticatedUser) {
    if (user.role === UserRole.DOCTOR && doctor.userId !== user.id) {
      throw new ForbiddenException("Doctors can only manage their own schedule.");
    }
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.DOCTOR
    ) {
      throw new ForbiddenException("Insufficient permissions to manage doctor schedules.");
    }
  }

  async setAvailability(
    doctorId: string,
    dto: SetWeeklyAvailabilityDto,
    user: AuthenticatedUser
  ) {
    const doctor = await this.getDoctorAndValidate(doctorId, user);
    this.validateManagePermission(doctor, user);

    // Validate slots: startTime < endTime and no overlaps on same day
    for (const slot of dto.slots) {
      const startMins = this.timeToMinutes(slot.startTime);
      const endMins = this.timeToMinutes(slot.endTime);
      if (startMins >= endMins) {
        throw new BadRequestException(
          `Invalid slot range on day ${slot.dayOfWeek}: startTime '${slot.startTime}' must be before endTime '${slot.endTime}'.`
        );
      }
    }

    // Check overlaps within the submitted slots for each day
    const slotsByDay = new Map<number, AvailabilitySlotDto[]>();
    for (const slot of dto.slots) {
      const existing = slotsByDay.get(slot.dayOfWeek) || [];
      const currentStart = this.timeToMinutes(slot.startTime);
      const currentEnd = this.timeToMinutes(slot.endTime);

      for (const other of existing) {
        const otherStart = this.timeToMinutes(other.startTime);
        const otherEnd = this.timeToMinutes(other.endTime);

        if (Math.max(currentStart, otherStart) < Math.min(currentEnd, otherEnd)) {
          throw new BadRequestException(
            `Conflicting availability slots detected on day ${slot.dayOfWeek} between '${slot.startTime}-${slot.endTime}' and '${other.startTime}-${other.endTime}'.`
          );
        }
      }
      existing.push(slot);
      slotsByDay.set(slot.dayOfWeek, existing);
    }

    // Replace doctor's weekly availability
    await this.prisma.$transaction(async (tx) => {
      await tx.doctorAvailability.deleteMany({
        where: { doctorId },
      });

      if (dto.slots.length > 0) {
        await tx.doctorAvailability.createMany({
          data: dto.slots.map((slot) => ({
            hospitalId: doctor.hospitalId,
            doctorId,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            slotDurationMinutes: slot.slotDurationMinutes ?? 30,
            isAvailable: slot.isAvailable !== false,
          })),
        });
      }
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: doctor.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "DoctorAvailability",
        entityId: doctorId,
        details: { slotCount: dto.slots.length },
      },
    });

    return this.getAvailability(doctorId, user);
  }

  async getAvailability(doctorId: string, user: AuthenticatedUser) {
    const doctor = await this.getDoctorAndValidate(doctorId, user);

    const availabilities = await this.prisma.doctorAvailability.findMany({
      where: { doctorId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    return {
      doctorId,
      hospitalId: doctor.hospitalId,
      availabilities,
    };
  }

  async createException(
    doctorId: string,
    dto: CreateScheduleExceptionDto,
    user: AuthenticatedUser
  ) {
    const doctor = await this.getDoctorAndValidate(doctorId, user);
    this.validateManagePermission(doctor, user);

    if (dto.startTime && dto.endTime) {
      const startMins = this.timeToMinutes(dto.startTime);
      const endMins = this.timeToMinutes(dto.endTime);
      if (startMins >= endMins) {
        throw new BadRequestException(
          `startTime '${dto.startTime}' must be before endTime '${dto.endTime}'.`
        );
      }
    } else if ((dto.startTime && !dto.endTime) || (!dto.startTime && dto.endTime)) {
      throw new BadRequestException(
        "Both startTime and endTime must be provided for partial-day exceptions, or both omitted for full-day."
      );
    }

    const exceptionDate = new Date(dto.date);

    const exception = await this.prisma.doctorScheduleException.create({
      data: {
        hospitalId: doctor.hospitalId,
        doctorId,
        date: exceptionDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isAvailable: dto.isAvailable ?? false,
        reason: dto.reason?.trim(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: doctor.hospitalId,
        userId: user.id,
        action: AuditAction.CREATE,
        entityName: "DoctorScheduleException",
        entityId: exception.id,
        details: dto as any,
      },
    });

    return exception;
  }

  async getExceptions(
    doctorId: string,
    user: AuthenticatedUser,
    fromDate?: string
  ) {
    await this.getDoctorAndValidate(doctorId, user);

    const where: any = { doctorId };
    if (fromDate) {
      where.date = { gte: new Date(fromDate) };
    }

    return this.prisma.doctorScheduleException.findMany({
      where,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
  }

  async deleteException(
    doctorId: string,
    exceptionId: string,
    user: AuthenticatedUser
  ) {
    const doctor = await this.getDoctorAndValidate(doctorId, user);
    this.validateManagePermission(doctor, user);

    const exception = await this.prisma.doctorScheduleException.findUnique({
      where: { id: exceptionId },
    });

    if (!exception || exception.doctorId !== doctorId) {
      throw new NotFoundException("Schedule exception not found.");
    }

    await this.prisma.doctorScheduleException.delete({
      where: { id: exceptionId },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: doctor.hospitalId,
        userId: user.id,
        action: AuditAction.DELETE,
        entityName: "DoctorScheduleException",
        entityId: exceptionId,
        details: { date: exception.date },
      },
    });

    return { message: "Schedule exception removed successfully." };
  }

  async getAvailableSlots(
    doctorId: string,
    dateStr: string,
    user: AuthenticatedUser
  ) {
    const doctor = await this.getDoctorAndValidate(doctorId, user);

    // Parse date (treat date string YYYY-MM-DD as UTC date)
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException("Invalid date format. Expected YYYY-MM-DD.");
    }

    const dayOfWeek = targetDate.getUTCDay(); // 0 = Sunday ... 6 = Saturday

    // 1. Check for whole-day unavailability exception
    const fullDayException = await this.prisma.doctorScheduleException.findFirst({
      where: {
        doctorId,
        date: targetDate,
        startTime: null,
        isAvailable: false,
      },
    });

    if (fullDayException) {
      return {
        date: dateStr,
        dayOfWeek,
        isAvailable: false,
        reason: fullDayException.reason || "Doctor unavailable on this date.",
        slots: [],
      };
    }

    // 2. Fetch doctor availability rules for this dayOfWeek
    const availabilities = await this.prisma.doctorAvailability.findMany({
      where: {
        doctorId,
        dayOfWeek,
        isAvailable: true,
      },
      orderBy: { startTime: "asc" },
    });

    if (availabilities.length === 0) {
      return {
        date: dateStr,
        dayOfWeek,
        isAvailable: false,
        reason: "Doctor does not have scheduled working hours on this day.",
        slots: [],
      };
    }

    // 3. Fetch partial-day exceptions for targetDate
    const partialExceptions = await this.prisma.doctorScheduleException.findMany({
      where: {
        doctorId,
        date: targetDate,
        startTime: { not: null },
      },
    });

    // 4. Fetch booked appointments for doctor on targetDate (excluding CANCELLED and NO_SHOW)
    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        appointmentDate: targetDate,
        deletedAt: null,
        status: {
          notIn: ["CANCELLED", "NO_SHOW"],
        },
      },
      select: {
        startTime: true,
        endTime: true,
      },
    });

    // 5. Generate slots for each availability window
    const slots: Array<{
      startTime: string;
      endTime: string;
      isAvailable: boolean;
      conflictReason?: string;
    }> = [];

    for (const rule of availabilities) {
      const ruleStart = this.timeToMinutes(rule.startTime);
      const ruleEnd = this.timeToMinutes(rule.endTime);
      const duration = rule.slotDurationMinutes || 30;

      for (let cursor = ruleStart; cursor + duration <= ruleEnd; cursor += duration) {
        const slotStartStr = this.minutesToTime(cursor);
        const slotEndStr = this.minutesToTime(cursor + duration);

        // Check against partial exceptions
        let blockedByException = false;
        let exceptionReason: string | undefined;

        for (const ex of partialExceptions) {
          if (!ex.isAvailable && ex.startTime && ex.endTime) {
            const exStart = this.timeToMinutes(ex.startTime);
            const exEnd = this.timeToMinutes(ex.endTime);
            if (Math.max(cursor, exStart) < Math.min(cursor + duration, exEnd)) {
              blockedByException = true;
              exceptionReason = ex.reason || "Doctor unavailable during this time.";
              break;
            }
          }
        }

        if (blockedByException) {
          continue; // Slot is blocked by exception
        }

        // Check against booked appointments
        const hasBookingConflict = existingAppointments.some((appt) => {
          const apptStart = this.timeToMinutes(appt.startTime);
          const apptEnd = this.timeToMinutes(appt.endTime);
          return Math.max(cursor, apptStart) < Math.min(cursor + duration, apptEnd);
        });

        slots.push({
          startTime: slotStartStr,
          endTime: slotEndStr,
          isAvailable: !hasBookingConflict,
          conflictReason: hasBookingConflict ? "Already booked" : undefined,
        });
      }
    }

    return {
      date: dateStr,
      dayOfWeek,
      isAvailable: slots.some((s) => s.isAvailable),
      slots,
    };
  }
}
