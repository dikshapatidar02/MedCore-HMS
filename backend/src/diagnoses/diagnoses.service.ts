import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole, RecordStatus, AuditAction, Prisma, DiagnosisType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateDiagnosisDto } from "./dto/create-diagnosis.dto";

@Injectable()
export class DiagnosesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(
    query: { medicalRecordId?: string; patientId?: string },
    user: AuthenticatedUser
  ) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
    const isPatient = user.role === UserRole.PATIENT;

    const where: Prisma.DiagnosisWhereInput = {};

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
        throw new ForbiddenException("Patient privacy restriction: You can only view your own diagnoses.");
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

    const items = await this.prisma.diagnosis.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        recordingDoctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return { items, total: items.length };
  }

  async create(dto: CreateDiagnosisDto, user: AuthenticatedUser) {
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

    // Finalized Record Protection:
    if (record.status === RecordStatus.FINALIZED || record.status === RecordStatus.AMENDED) {
      throw new BadRequestException(
        "Cannot add diagnoses to a finalized medical record. Please record changes via an auditable amendment."
      );
    }

    let recordingDoctorId: string | undefined;
    if (user.role === UserRole.DOCTOR) {
      const doc = await this.prisma.doctor.findUnique({ where: { userId: user.id } });
      if (doc) recordingDoctorId = doc.id;
    }

    const diagName = (
      dto.diagnosisName ||
      dto.description ||
      dto.icdCode ||
      (dto as any).code ||
      "Clinical Diagnosis"
    ).trim();

    const icd = (dto.icdCode || (dto as any).code || "").trim() || undefined;

    const created = await this.prisma.diagnosis.create({
      data: {
        hospitalId: record.hospitalId,
        medicalRecordId: record.id,
        recordingDoctorId,
        diagnosisName: diagName,
        description: dto.description?.trim(),
        type: dto.type || DiagnosisType.PRIMARY,
        icdCode: icd,
        diagnosisDate: dto.diagnosisDate ? new Date(dto.diagnosisDate) : new Date(),
        notes: dto.notes?.trim(),
      },
      include: {
        recordingDoctor: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: record.hospitalId,
        userId: user.id,
        action: AuditAction.CREATE,
        entityName: "Diagnosis",
        entityId: created.id,
        details: {
          medicalRecordId: record.id,
          diagnosisName: diagName,
          type: dto.type,
        },
      },
    });

    return {
      ...created,
      code: created.icdCode,
    };
  }
}
