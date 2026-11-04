import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole, RecordStatus, AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateTreatmentPlanDto, UpdateTreatmentPlanDto } from "./dto/create-treatment-plan.dto";

@Injectable()
export class TreatmentPlansService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(
    query: { medicalRecordId?: string; patientId?: string },
    user: AuthenticatedUser
  ) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
    const isPatient = user.role === UserRole.PATIENT;

    const where: Prisma.TreatmentPlanWhereInput = {};

    if (!isSuperAdmin) {
      where.hospitalId = user.hospitalId!;
    }

    if (query.medicalRecordId) {
      const rec = await this.prisma.medicalRecord.findUnique({
        where: { id: query.medicalRecordId },
      });
      if (!rec || rec.deletedAt) {
        throw new NotFoundException("Medical record not found.");
      }
      if (!isSuperAdmin && rec.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Tenant isolation violation: Medical record belongs to another hospital.");
      }
      where.medicalRecordId = query.medicalRecordId;
    }

    if (isPatient) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id, deletedAt: null },
      });
      if (!patient) return { items: [], total: 0 };
      if (query.patientId && query.patientId !== patient.id) {
        throw new ForbiddenException("Patient privacy restriction: You can only view your own treatment plans.");
      }
      where.medicalRecord = { patientId: patient.id };
    } else if (query.patientId) {
      const pat = await this.prisma.patient.findUnique({
        where: { id: query.patientId },
      });
      if (!pat || (!isSuperAdmin && pat.hospitalId !== user.hospitalId)) {
        throw new ForbiddenException("Tenant isolation violation: Patient belongs to another hospital.");
      }
      where.medicalRecord = { patientId: query.patientId };
    }

    const items = await this.prisma.treatmentPlan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });

    return { items, total: items.length };
  }

  async create(dto: CreateTreatmentPlanDto, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    const record = await this.prisma.medicalRecord.findUnique({
      where: { id: dto.medicalRecordId },
    });

    if (!record || record.deletedAt) {
      throw new NotFoundException("Referenced medical record not found.");
    }

    if (!isSuperAdmin && record.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation: Record belongs to another hospital.");
    }

    if (record.status === RecordStatus.FINALIZED || record.status === RecordStatus.AMENDED) {
      throw new BadRequestException(
        "Cannot add treatment plans to a finalized medical record. Please record changes via an auditable amendment."
      );
    }

    const desc = (
      dto.title ||
      dto.planDescription ||
      dto.description ||
      "Clinical Treatment Plan"
    ).trim();

    const instrs = (dto.instructions || dto.goals || dto.description || "").trim() || undefined;

    const startDate = dto.startDate ? new Date(dto.startDate) : undefined;
    const endDate = dto.endDate ? new Date(dto.endDate) : undefined;
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException("Treatment plan endDate cannot precede startDate.");
    }

    const created = await this.prisma.treatmentPlan.create({
      data: {
        hospitalId: record.hospitalId,
        medicalRecordId: record.id,
        createdById: user.id,
        planDescription: desc,
        instructions: instrs,
        startDate,
        endDate,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: record.hospitalId,
        userId: user.id,
        action: AuditAction.CREATE,
        entityName: "TreatmentPlan",
        entityId: created.id,
        details: {
          medicalRecordId: record.id,
          followUpDate: dto.followUpDate,
        },
      },
    });

    return {
      ...created,
      title: created.planDescription,
      goals: created.instructions,
    };
  }

  async update(id: string, dto: UpdateTreatmentPlanDto, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      include: { medicalRecord: true },
    });

    if (!plan) {
      throw new NotFoundException("Treatment plan not found.");
    }

    if (!isSuperAdmin && plan.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation: Plan belongs to another hospital.");
    }

    if (plan.medicalRecord.status === RecordStatus.FINALIZED || plan.medicalRecord.status === RecordStatus.AMENDED) {
      throw new BadRequestException(
        "Cannot directly edit treatment plans of a finalized medical record. Please record changes via an auditable amendment."
      );
    }

    const updatedDesc = dto.title !== undefined
      ? dto.title.trim()
      : dto.planDescription !== undefined 
      ? dto.planDescription.trim() 
      : dto.description !== undefined 
      ? dto.description.trim() 
      : undefined;

    const updatedInstrs = dto.instructions !== undefined 
      ? dto.instructions.trim() 
      : dto.goals !== undefined 
      ? dto.goals.trim() 
      : undefined;

    const updatedStartDate = dto.startDate !== undefined ? new Date(dto.startDate) : plan.startDate ? new Date(plan.startDate) : undefined;
    const updatedEndDate = dto.endDate !== undefined ? new Date(dto.endDate) : plan.endDate ? new Date(plan.endDate) : undefined;
    if (updatedStartDate && updatedEndDate && updatedEndDate < updatedStartDate) {
      throw new BadRequestException("Treatment plan endDate cannot precede startDate.");
    }

    const updated = await this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        planDescription: updatedDesc,
        instructions: updatedInstrs,
        startDate: dto.startDate !== undefined ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate !== undefined ? new Date(dto.endDate) : undefined,
        followUpDate: dto.followUpDate !== undefined ? new Date(dto.followUpDate) : undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: plan.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "TreatmentPlan",
        entityId: id,
        details: { action: "PLAN_UPDATE" },
      },
    });

    return {
      ...updated,
      title: updated.planDescription,
      goals: updated.instructions,
    };
  }
}
