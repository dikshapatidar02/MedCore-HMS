import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole, AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import {
  CreatePatientMedicationHistoryDto,
  UpdatePatientMedicationHistoryDto,
} from "./dto/create-medication-history.dto";

@Injectable()
export class PatientMedicationHistoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(patientId: string | undefined, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
    const isPatient = user.role === UserRole.PATIENT;

    const where: Prisma.PatientMedicationHistoryWhereInput = {};

    if (!isSuperAdmin) {
      where.hospitalId = user.hospitalId!;
    }

    if (isPatient) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id, deletedAt: null },
      });
      if (!patient) return [];
      if (patientId && patientId !== patient.id) {
        throw new ForbiddenException("Patient privacy restriction: You can only view your own medication history.");
      }
      where.patientId = patient.id;
    } else if (patientId) {
      const patient = await this.prisma.patient.findUnique({
        where: { id: patientId },
      });
      if (!patient || (!isSuperAdmin && patient.hospitalId !== user.hospitalId)) {
        throw new ForbiddenException("Tenant isolation violation: Patient belongs to another hospital.");
      }
      where.patientId = patientId;
    } else {
      throw new BadRequestException("patientId query parameter is required.");
    }

    const items = await this.prisma.patientMedicationHistory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        recordedBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });

    return { items, total: items.length };
  }

  async create(dto: CreatePatientMedicationHistoryDto, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient not found.");
    }

    if (!isSuperAdmin && patient.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation: Patient belongs to another hospital.");
    }

    const start = (dto.startDate || dto.prescribedDate) ? new Date(dto.startDate || dto.prescribedDate!) : undefined;
    const end = (dto.endDate || dto.discontinuedDate) ? new Date(dto.endDate || dto.discontinuedDate!) : undefined;
    if (start && end && end < start) {
      throw new BadRequestException("Medication discontinuation/end date cannot precede start date.");
    }

    const created = await this.prisma.patientMedicationHistory.create({
      data: {
        hospitalId: patient.hospitalId,
        patientId: patient.id,
        recordedById: user.id,
        medicationName: dto.medicationName.trim(),
        dosage: dto.dosage?.trim(),
        frequency: dto.frequency?.trim(),
        route: dto.route?.trim(),
        prescribingDoctor: dto.prescribingDoctor?.trim(),
        startDate: start,
        endDate: end,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        notes: dto.notes?.trim(),
      },
      include: {
        recordedBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: patient.hospitalId,
        userId: user.id,
        action: AuditAction.CREATE,
        entityName: "PatientMedicationHistory",
        entityId: created.id,
        details: {
          patientId: patient.id,
          medicationName: dto.medicationName.trim(),
        },
      },
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdatePatientMedicationHistoryDto,
    user: AuthenticatedUser
  ) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    const medHistory = await this.prisma.patientMedicationHistory.findUnique({
      where: { id },
    });

    if (!medHistory) {
      throw new NotFoundException("Patient medication history record not found.");
    }

    if (!isSuperAdmin && medHistory.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation: Record belongs to another hospital.");
    }

    const end = dto.endDate || dto.discontinuedDate;
    const start = dto.startDate ? new Date(dto.startDate) : medHistory.startDate ? new Date(medHistory.startDate) : undefined;
    const resolvedEnd = end !== undefined ? new Date(end) : medHistory.endDate ? new Date(medHistory.endDate) : undefined;
    if (start && resolvedEnd && resolvedEnd < start) {
      throw new BadRequestException("Medication discontinuation/end date cannot precede start date.");
    }

    const updated = await this.prisma.patientMedicationHistory.update({
      where: { id },
      data: {
        dosage: dto.dosage !== undefined ? dto.dosage?.trim() : undefined,
        frequency: dto.frequency !== undefined ? dto.frequency?.trim() : undefined,
        route: dto.route !== undefined ? dto.route?.trim() : undefined,
        startDate: dto.startDate !== undefined ? new Date(dto.startDate) : undefined,
        endDate: end !== undefined ? new Date(end) : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
        notes: dto.notes !== undefined ? dto.notes?.trim() : undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: medHistory.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "PatientMedicationHistory",
        entityId: id,
        details: { action: "MEDICATION_UPDATE", isActive: dto.isActive },
      },
    });

    return updated;
  }
}
