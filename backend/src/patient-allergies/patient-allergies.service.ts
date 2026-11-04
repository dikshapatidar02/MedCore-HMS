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
import { CreatePatientAllergyDto, UpdatePatientAllergyDto } from "./dto/create-allergy.dto";

@Injectable()
export class PatientAllergiesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(patientId: string | undefined, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
    const isPatient = user.role === UserRole.PATIENT;

    const where: Prisma.PatientAllergyWhereInput = {};

    if (!isSuperAdmin) {
      where.hospitalId = user.hospitalId!;
    }

    if (isPatient) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id, deletedAt: null },
      });
      if (!patient) return [];
      if (patientId && patientId !== patient.id) {
        throw new ForbiddenException("Patient privacy restriction: You can only view your own allergies.");
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

    const items = await this.prisma.patientAllergy.findMany({
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

  async create(dto: CreatePatientAllergyDto, user: AuthenticatedUser) {
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

    const created = await this.prisma.patientAllergy.create({
      data: {
        hospitalId: patient.hospitalId,
        patientId: patient.id,
        recordedById: user.id,
        allergen: dto.allergen.trim(),
        reaction: dto.reaction?.trim(),
        severity: dto.severity,
        isActive: true,
        diagnosedDate: dto.diagnosedDate ? new Date(dto.diagnosedDate) : undefined,
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
        entityName: "PatientAllergy",
        entityId: created.id,
        details: {
          patientId: patient.id,
          allergen: dto.allergen.trim(),
          severity: dto.severity,
        },
      },
    });

    return created;
  }

  async update(id: string, dto: UpdatePatientAllergyDto, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    const allergy = await this.prisma.patientAllergy.findUnique({
      where: { id },
    });

    if (!allergy) {
      throw new NotFoundException("Patient allergy record not found.");
    }

    if (!isSuperAdmin && allergy.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation: Record belongs to another hospital.");
    }

    const updated = await this.prisma.patientAllergy.update({
      where: { id },
      data: {
        allergen: dto.allergen !== undefined ? dto.allergen.trim() : undefined,
        reaction: dto.reaction !== undefined ? dto.reaction?.trim() : undefined,
        severity: dto.severity,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
        notes: dto.notes !== undefined ? dto.notes?.trim() : undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: allergy.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "PatientAllergy",
        entityId: id,
        details: { action: "ALLERGY_UPDATE", isActive: dto.isActive },
      },
    });

    return updated;
  }
}
