import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole, AuditAction, Prisma, RecordStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateVitalSignsDto } from "./dto/create-vital-signs.dto";

@Injectable()
export class VitalSignsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(
    query: { patientId?: string; medicalRecordId?: string },
    user: AuthenticatedUser
  ) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
    const isPatient = user.role === UserRole.PATIENT;

    const where: Prisma.VitalSignsWhereInput = {};

    if (!isSuperAdmin) {
      where.hospitalId = user.hospitalId!;
    }

    if (isPatient) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id, deletedAt: null },
      });
      if (!patient) return [];
      if (query.patientId && query.patientId !== patient.id) {
        throw new ForbiddenException("Patient privacy restriction: You can only view your own vital signs.");
      }
      where.patientId = patient.id;
    } else if (query.patientId) {
      const patient = await this.prisma.patient.findUnique({
        where: { id: query.patientId },
      });
      if (!patient || (!isSuperAdmin && patient.hospitalId !== user.hospitalId)) {
        throw new ForbiddenException("Tenant isolation violation: Patient belongs to another hospital.");
      }
      where.patientId = query.patientId;
    }

    if (query.medicalRecordId) {
      where.medicalRecordId = query.medicalRecordId;
    }

    const rawItems = await this.prisma.vitalSigns.findMany({
      where,
      orderBy: { recordedAt: "desc" },
      include: {
        recordedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    const items = rawItems.map((item) => ({
      ...item,
      systolicBp: item.bloodPressureSystolic,
      diastolicBp: item.bloodPressureDiastolic,
    }));

    return { items, total: items.length };
  }

  async create(dto: CreateVitalSignsDto, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    let targetPatientId = dto.patientId;
    let targetHospitalId = user.hospitalId;

    if (dto.medicalRecordId) {
      const record = await this.prisma.medicalRecord.findUnique({
        where: { id: dto.medicalRecordId },
      });
      if (!record || record.deletedAt) {
        throw new NotFoundException("Referenced medical record not found.");
      }
      if (!isSuperAdmin && record.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Tenant isolation violation: Medical record belongs to another hospital.");
      }
      if (record.status === RecordStatus.FINALIZED || record.status === RecordStatus.AMENDED) {
        throw new BadRequestException(
          "Cannot attach vital signs directly to a finalized medical record. Vitals must be recorded independently or noted in an auditable amendment."
        );
      }
      targetPatientId = record.patientId;
      targetHospitalId = record.hospitalId;
    }

    if (!targetPatientId) {
      throw new BadRequestException("Either patientId or medicalRecordId must be provided.");
    }

    // Validate patient exists and belongs to hospital
    const patient = await this.prisma.patient.findUnique({
      where: { id: targetPatientId },
    });
    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient not found.");
    }

    if (!isSuperAdmin && patient.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation: Patient belongs to another hospital.");
    }

    targetHospitalId = patient.hospitalId;

    const bpSystolic = dto.bloodPressureSystolic ?? dto.systolicBp;
    const bpDiastolic = dto.bloodPressureDiastolic ?? dto.diastolicBp;

    if (bpSystolic !== undefined) {
      if (bpSystolic < 50 || bpSystolic > 250) {
        throw new BadRequestException(
          `Systolic blood pressure (${bpSystolic} mmHg) is out of physiological range (50-250 mmHg).`
        );
      }
    }

    if (bpDiastolic !== undefined) {
      if (bpDiastolic < 30 || bpDiastolic > 150) {
        throw new BadRequestException(
          `Diastolic blood pressure (${bpDiastolic} mmHg) is out of physiological range (30-150 mmHg).`
        );
      }
    }

    // Validate systolic > diastolic if both provided
    if (bpSystolic !== undefined && bpDiastolic !== undefined) {
      if (bpSystolic <= bpDiastolic) {
        throw new BadRequestException(
          `Systolic blood pressure (${bpSystolic} mmHg) must be greater than diastolic (${bpDiastolic} mmHg).`
        );
      }
    }

    if (dto.heartRate !== undefined) {
      if (dto.heartRate < 30 || dto.heartRate > 250) {
        throw new BadRequestException(
          `Heart rate (${dto.heartRate} bpm) is out of physiological range (30-250 bpm).`
        );
      }
    }

    if (dto.respiratoryRate !== undefined) {
      if (dto.respiratoryRate < 5 || dto.respiratoryRate > 80) {
        throw new BadRequestException(
          `Respiratory rate (${dto.respiratoryRate}/min) is out of physiological range (5-80 breaths/min).`
        );
      }
    }

    if (dto.temperature !== undefined) {
      if (dto.temperature < 30 || dto.temperature > 45) {
        throw new BadRequestException(
          `Body temperature (${dto.temperature} °C) is out of physiological range (30-45 °C).`
        );
      }
    }

    if (dto.oxygenSaturation !== undefined) {
      if (dto.oxygenSaturation < 50 || dto.oxygenSaturation > 100) {
        throw new BadRequestException(
          `Oxygen saturation (${dto.oxygenSaturation}%) is out of physiological range (50-100%).`
        );
      }
    }

    // Calculate BMI if height and weight are provided
    let calculatedBmi: number | undefined;
    if (dto.heightCm && dto.weightKg && dto.heightCm > 0) {
      const heightM = dto.heightCm / 100;
      calculatedBmi = Number((dto.weightKg / (heightM * heightM)).toFixed(2));
    }

    const created = await this.prisma.vitalSigns.create({
      data: {
        hospitalId: targetHospitalId,
        patientId: targetPatientId,
        medicalRecordId: dto.medicalRecordId,
        recordedById: user.id,
        bloodPressureSystolic: bpSystolic,
        bloodPressureDiastolic: bpDiastolic,
        heartRate: dto.heartRate,
        respiratoryRate: dto.respiratoryRate,
        temperature: dto.temperature !== undefined ? new Prisma.Decimal(dto.temperature) : undefined,
        oxygenSaturation: dto.oxygenSaturation,
        heightCm: dto.heightCm !== undefined ? new Prisma.Decimal(dto.heightCm) : undefined,
        weightKg: dto.weightKg !== undefined ? new Prisma.Decimal(dto.weightKg) : undefined,
        bmi: calculatedBmi !== undefined ? new Prisma.Decimal(calculatedBmi) : undefined,
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
        hospitalId: targetHospitalId,
        userId: user.id,
        action: AuditAction.CREATE,
        entityName: "VitalSigns",
        entityId: created.id,
        details: {
          patientId: targetPatientId,
          bmi: calculatedBmi,
        },
      },
    });

    return {
      ...created,
      systolicBp: created.bloodPressureSystolic,
      diastolicBp: created.bloodPressureDiastolic,
    };
  }
}
