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
import { CreateMedicalRecordDto } from "./dto/create-medical-record.dto";
import { UpdateMedicalRecordDto } from "./dto/update-medical-record.dto";
import { AmendMedicalRecordDto } from "./dto/amend-medical-record.dto";
import { QueryMedicalRecordsDto } from "./dto/query-medical-records.dto";

@Injectable()
export class MedicalRecordsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(query: QueryMedicalRecordsDto, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
    const isPatient = user.role === UserRole.PATIENT;

    const where: Prisma.MedicalRecordWhereInput = {
      deletedAt: null,
    };

    if (!isSuperAdmin) {
      where.hospitalId = user.hospitalId!;
    }

    // Role-specific constraints
    if (isPatient) {
      // Patient can ONLY view their own records
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id, deletedAt: null },
      });
      if (!patient) {
        return { items: [], total: 0, page: query.page || 1, limit: query.limit || 20, totalPages: 0 };
      }

      if (query.patientId && query.patientId !== patient.id) {
        throw new ForbiddenException("Patient privacy restriction: You can only view your own medical records.");
      }
      where.patientId = patient.id;
    } else if (query.patientId) {
      // Staff querying a specific patient: ensure patient belongs to same hospital
      const patient = await this.prisma.patient.findUnique({
        where: { id: query.patientId },
      });
      if (!patient || (!isSuperAdmin && patient.hospitalId !== user.hospitalId)) {
        throw new ForbiddenException("Tenant isolation violation: Patient belongs to another hospital.");
      }
      where.patientId = query.patientId;
    }

    if (query.doctorId) {
      where.doctorId = query.doctorId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { chiefComplaint: { contains: term, mode: "insensitive" } },
        { assessment: { contains: term, mode: "insensitive" } },
        { patient: { firstName: { contains: term, mode: "insensitive" } } },
        { patient: { lastName: { contains: term, mode: "insensitive" } } },
        { patient: { mrn: { contains: term, mode: "insensitive" } } },
      ];
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.medicalRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { visitDate: "desc" },
        include: {
          patient: {
            select: {
              id: true,
              mrn: true,
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              gender: true,
              phone: true,
            },
          },
          doctor: {
            select: {
              id: true,
              specialization: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          appointment: {
            select: {
              id: true,
              appointmentDate: true,
              startTime: true,
              endTime: true,
              type: true,
              status: true,
            },
          },
          signedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              vitalSigns: true,
              diagnoses: true,
              treatmentPlans: true,
              amendments: true,
            },
          },
        },
      }),
      this.prisma.medicalRecord.count({ where }),
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
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
      include: {
        patient: {
          include: {
            address: true,
          },
        },
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
        appointment: true,
        signedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        vitalSigns: {
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
        },
        diagnoses: {
          orderBy: { createdAt: "asc" },
          include: {
            recordingDoctor: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        treatmentPlans: {
          orderBy: { createdAt: "asc" },
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
        amendments: {
          orderBy: { createdAt: "asc" },
          include: {
            amendedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!record || record.deletedAt) {
      throw new NotFoundException("Medical record not found.");
    }

    // Tenant check
    if (!isSuperAdmin && record.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation: Record belongs to another hospital.");
    }

    // Patient IDOR check
    if (user.role === UserRole.PATIENT && record.patient.userId !== user.id) {
      throw new ForbiddenException("Patient privacy restriction: You cannot view clinical records for another patient.");
    }

    return record;
  }

  async create(dto: CreateMedicalRecordDto, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    // 1. Fetch Patient and validate tenant boundary
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient not found.");
    }

    const targetHospitalId = patient.hospitalId;

    if (!isSuperAdmin && user.hospitalId !== targetHospitalId) {
      throw new ForbiddenException("Tenant isolation violation: Patient belongs to another hospital.");
    }

    // 2. Identify Doctor
    let doctorId = dto.doctorId;

    if (user.role === UserRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor || doctor.deletedAt) {
        throw new ForbiddenException("Doctor profile not found for authenticated user.");
      }
      if (doctor.hospitalId !== targetHospitalId) {
        throw new ForbiddenException("Cross-hospital violation: Doctor does not belong to patient's hospital.");
      }
      doctorId = doctor.id;
    } else if (doctorId) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { id: doctorId },
      });
      if (!doctor || doctor.deletedAt || (!isSuperAdmin && doctor.hospitalId !== targetHospitalId)) {
        throw new ForbiddenException("Cross-hospital violation: Selected doctor does not belong to patient's hospital.");
      }
    } else {
      throw new BadRequestException("doctorId is required when creating a medical record.");
    }

    // 3. Validate Appointment linkage if provided
    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
      });

      if (!appointment || appointment.deletedAt) {
        throw new NotFoundException("Referenced appointment not found.");
      }

      if (appointment.hospitalId !== targetHospitalId || appointment.patientId !== patient.id) {
        throw new ForbiddenException("Appointment does not match patient or hospital context.");
      }

      // Check 1:1 constraint
      const existingRecord = await this.prisma.medicalRecord.findUnique({
        where: { appointmentId: dto.appointmentId },
      });
      if (existingRecord) {
        throw new BadRequestException("A medical record already exists for this appointment.");
      }
    }

    const visitDate = dto.visitDate ? new Date(dto.visitDate) : new Date();

    const created = await this.prisma.medicalRecord.create({
      data: {
        hospitalId: targetHospitalId,
        patientId: patient.id,
        doctorId,
        appointmentId: dto.appointmentId,
        visitDate,
        chiefComplaint: dto.chiefComplaint.trim(),
        presentIllness: dto.presentIllness?.trim(),
        pastMedicalHistory: dto.pastMedicalHistory?.trim(),
        physicalExamination: dto.physicalExamination?.trim(),
        assessment: dto.assessment?.trim(),
        clinicalNotes: dto.clinicalNotes?.trim(),
        followUpInstructions: dto.followUpInstructions?.trim(),
        status: RecordStatus.DRAFT,
      },
      include: {
        patient: { select: { id: true, mrn: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, specialization: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: targetHospitalId,
        userId: user.id,
        action: AuditAction.CREATE,
        entityName: "MedicalRecord",
        entityId: created.id,
        details: {
          patientId: patient.id,
          doctorId,
          status: RecordStatus.DRAFT,
        },
      },
    });

    return created;
  }

  async update(id: string, dto: UpdateMedicalRecordDto, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
      include: { doctor: true },
    });

    if (!record || record.deletedAt) {
      throw new NotFoundException("Medical record not found.");
    }

    if (!isSuperAdmin && record.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation: Record belongs to another hospital.");
    }

    // Critical Clinical Immutability Check:
    if (record.status !== RecordStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot directly edit a finalized or amended clinical record (current status: ${record.status}). Corrections must be added as an auditable amendment.`
      );
    }

    const updated = await this.prisma.medicalRecord.update({
      where: { id },
      data: {
        chiefComplaint: dto.chiefComplaint !== undefined ? dto.chiefComplaint.trim() : undefined,
        presentIllness: dto.presentIllness !== undefined ? dto.presentIllness?.trim() : undefined,
        pastMedicalHistory: dto.pastMedicalHistory !== undefined ? dto.pastMedicalHistory?.trim() : undefined,
        physicalExamination: dto.physicalExamination !== undefined ? dto.physicalExamination?.trim() : undefined,
        assessment: dto.assessment !== undefined ? dto.assessment?.trim() : undefined,
        clinicalNotes: dto.clinicalNotes !== undefined ? dto.clinicalNotes?.trim() : undefined,
        followUpInstructions: dto.followUpInstructions !== undefined ? dto.followUpInstructions?.trim() : undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: record.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "MedicalRecord",
        entityId: id,
        details: { action: "DRAFT_UPDATE" },
      },
    });

    return updated;
  }

  async signAndFinalize(id: string, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.medicalRecord.findUnique({
        where: { id },
      });

      if (!record || record.deletedAt) {
        throw new NotFoundException("Medical record not found.");
      }

      if (!isSuperAdmin && record.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Tenant isolation violation: Record belongs to another hospital.");
      }

      // Atomic Compare-And-Swap (CAS) to prevent concurrent double-finalization race conditions
      const updateResult = await tx.medicalRecord.updateMany({
        where: { id, status: RecordStatus.DRAFT },
        data: {
          status: RecordStatus.FINALIZED,
          signedAt: new Date(),
          signedById: user.id,
        },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException(
          `Record is already '${record.status}'. Finalized records cannot be signed again.`
        );
      }

      const finalized = await tx.medicalRecord.findUnique({
        where: { id },
        include: {
          signedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: record.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "MedicalRecord",
          entityId: id,
          details: { action: "SIGN_AND_FINALIZE", signedById: user.id },
        },
      });

      return finalized;
    });
  }

  async amend(id: string, dto: AmendMedicalRecordDto, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    // Execute amendment inside transaction with transactional status verification
    return this.prisma.$transaction(async (tx) => {
      const currentRecord = await tx.medicalRecord.findUnique({
        where: { id },
      });

      if (!currentRecord || currentRecord.deletedAt) {
        throw new NotFoundException("Medical record not found.");
      }

      if (!isSuperAdmin && currentRecord.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Tenant isolation violation: Record belongs to another hospital.");
      }

      if (currentRecord.status === RecordStatus.DRAFT) {
        throw new BadRequestException(
          "Draft records can be edited directly. Formal amendments are reserved for finalized records."
        );
      }

      const amendment = await tx.medicalRecordAmendment.create({
        data: {
          hospitalId: currentRecord.hospitalId,
          medicalRecordId: id,
          amendedById: user.id,
          reason: dto.reason.trim(),
          notes: dto.notes.trim(),
        },
        include: {
          amendedBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
        },
      });

      const updatedRecord = await tx.medicalRecord.update({
        where: { id },
        data: {
          status: RecordStatus.AMENDED,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: currentRecord.hospitalId,
          userId: user.id,
          action: AuditAction.CREATE,
          entityName: "MedicalRecordAmendment",
          entityId: amendment.id,
          details: {
            medicalRecordId: id,
            reason: dto.reason.trim(),
          },
        },
      });

      return {
        message: "Clinical amendment recorded successfully.",
        amendment,
        record: updatedRecord,
        status: updatedRecord.status,
      };
    });
  }

  async delete(id: string, _user: AuthenticatedUser) {
    // Healthcare Integrity Rule: Permanent deletion of clinical records is strictly prohibited
    throw new BadRequestException(
      "Medical records cannot be permanently deleted. Clinical entries are immutable by law."
    );
  }
}
