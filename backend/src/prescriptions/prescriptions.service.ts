import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePrescriptionDto } from "./dto/create-prescription.dto";
import { CancelPrescriptionDto } from "./dto/cancel-prescription.dto";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { AuditAction, NotificationType, PrescriptionStatus, UserRole } from "@prisma/client";
import { PrescriptionsPdfService } from "./prescriptions-pdf.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrescriptionsPdfService) private readonly pdfService: PrescriptionsPdfService,
    @Inject(NotificationsService) private readonly notificationsService: NotificationsService
  ) {}

  async create(createDto: CreatePrescriptionDto, user: AuthenticatedUser) {
    if (user.role !== UserRole.DOCTOR) {
      throw new ForbiddenException("Only registered doctors can issue prescriptions.");
    }

    if (!user.hospitalId) {
      throw new BadRequestException("Doctor must be assigned to an active hospital tenant.");
    }

    // Verify doctor record exists
    const doctor = await this.prisma.doctor.findFirst({
      where: { userId: user.id, hospitalId: user.hospitalId },
    });
    if (!doctor) {
      throw new ForbiddenException("Doctor clinical profile not found for this hospital.");
    }

    // Verify patient exists in tenant
    const patient = await this.prisma.patient.findFirst({
      where: { id: createDto.patientId, hospitalId: user.hospitalId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundException(`Patient '${createDto.patientId}' not found in this hospital.`);
    }

    // Verify medical record exists in tenant
    const medicalRecord = await this.prisma.medicalRecord.findFirst({
      where: {
        id: createDto.medicalRecordId,
        hospitalId: user.hospitalId,
        patientId: createDto.patientId,
      },
    });
    if (!medicalRecord) {
      throw new NotFoundException(
        `Medical record '${createDto.medicalRecordId}' not found for this patient in this hospital.`
      );
    }

    if (!createDto.items || createDto.items.length === 0) {
      throw new BadRequestException("Prescription must contain at least one medicine item.");
    }

    // Validate each medicine item clinical parameters and formulary existence
    for (const item of createDto.items) {
      if (!item.dosage || typeof item.dosage !== "string" || item.dosage.trim() === "") {
        throw new BadRequestException("Prescription item dosage is required.");
      }
      if (!item.frequency || typeof item.frequency !== "string" || item.frequency.trim() === "") {
        throw new BadRequestException("Prescription item frequency is required.");
      }
      if (!item.duration || typeof item.duration !== "string" || item.duration.trim() === "") {
        throw new BadRequestException("Prescription item duration is required.");
      }
      if (
        item.quantity === undefined ||
        item.quantity === null ||
        typeof item.quantity !== "number" ||
        item.quantity <= 0 ||
        !Number.isInteger(item.quantity)
      ) {
        throw new BadRequestException("Prescription item quantity must be a positive integer.");
      }

      const med = await this.prisma.medicine.findFirst({
        where: {
          id: item.medicineId,
          OR: [{ hospitalId: user.hospitalId }, { hospitalId: null }],
        },
      });
      if (!med) {
        throw new NotFoundException(`Medicine '${item.medicineId}' not found in hospital formulary.`);
      }
      if (!med.isActive) {
        throw new BadRequestException(`Medicine '${med.name}' is currently inactive in formulary.`);
      }
    }

    // Create prescription with items in a transaction
    const prescription = await this.prisma.$transaction(async (tx) => {
      const rx = await tx.prescription.create({
        data: {
          hospitalId: user.hospitalId!,
          medicalRecordId: createDto.medicalRecordId,
          patientId: createDto.patientId,
          doctorId: doctor.id,
          status: PrescriptionStatus.PENDING,
          notes: createDto.notes,
          items: {
            create: createDto.items.map((i) => ({
              hospitalId: user.hospitalId!,
              medicineId: i.medicineId,
              dosage: i.dosage,
              frequency: i.frequency,
              duration: i.duration,
              quantity: i.quantity,
              instructions: i.instructions,
            })),
          },
        },
        include: {
          items: {
            include: {
              medicine: true,
            },
          },
          doctor: {
            include: {
              user: {
                select: { firstName: true, lastName: true, email: true },
              },
            },
          },
          patient: true,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: user.hospitalId,
          userId: user.id,
          action: AuditAction.CREATE,
          entityName: "Prescription",
          entityId: rx.id,
          details: {
            patientId: rx.patientId,
            doctorId: doctor.id,
            itemsCount: createDto.items.length,
          },
        },
      });

      return rx;
    });

    if (prescription.patient?.userId && this.notificationsService) {
      const doctorName = prescription.doctor?.user
        ? `Dr. ${prescription.doctor.user.firstName} ${prescription.doctor.user.lastName}`
        : "your doctor";

      await this.notificationsService.dispatch({
        userId: prescription.patient.userId,
        hospitalId: prescription.hospitalId,
        title: "New Prescription Issued",
        message: `A new digital prescription has been issued by ${doctorName}. You can view and download it in your patient portal.`,
        type: NotificationType.PRESCRIPTION,
        channels: ["IN_APP", "EMAIL"],
        metadata: {
          prescriptionId: prescription.id,
          protectedRoute: "/prescriptions",
        },
      }).catch((err) => this.logger.warn(`Failed to dispatch prescription notification: ${err.message}`));
    }

    return prescription;
  }

  async findAll(
    filters: { patientId?: string; doctorId?: string; status?: PrescriptionStatus },
    user: AuthenticatedUser
  ) {
    const where: any = {};

    if (user.role !== UserRole.SUPER_ADMIN) {
      where.hospitalId = user.hospitalId;
    }

    if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id },
      });
      if (!patient) {
        throw new NotFoundException("Patient profile not linked to user.");
      }
      where.patientId = patient.id;
    } else if (filters.patientId) {
      where.patientId = filters.patientId;
    }

    if (filters.doctorId) {
      where.doctorId = filters.doctorId;
    }
    if (filters.status) {
      where.status = filters.status;
    }

    return this.prisma.prescription.findMany({
      where,
      include: {
        items: {
          include: {
            medicine: true,
            dispensingRecords: true,
          },
        },
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
            dateOfBirth: true,
            gender: true,
          },
        },
      },
      orderBy: { prescriptionDate: "desc" },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const rx = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        hospital: {
          include: {
            address: true,
          },
        },
        items: {
          include: {
            medicine: true,
            dispensingRecords: true,
          },
        },
        doctor: {
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        },
        patient: true,
      },
    });

    if (!rx) {
      throw new NotFoundException(`Prescription '${id}' not found.`);
    }

    // Tenant check
    if (user.role !== UserRole.SUPER_ADMIN && rx.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Cross-tenant access to prescription is strictly forbidden.");
    }

    // Patient IDOR check
    if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id },
      });
      if (!patient || rx.patientId !== patient.id) {
        throw new ForbiddenException("You can only access your own prescriptions.");
      }
    }

    return rx;
  }

  async generatePdf(id: string, user: AuthenticatedUser): Promise<Buffer> {
    const rx = await this.findOne(id, user);

    const pdfData = {
      id: rx.id,
      prescriptionDate: rx.prescriptionDate,
      status: rx.status,
      notes: rx.notes,
      hospital: {
        name: rx.hospital.name,
        tagline: rx.hospital.tagline,
        email: rx.hospital.email,
        phone: rx.hospital.phone,
        address: rx.hospital.address,
      },
      patient: {
        mrn: rx.patient.mrn,
        firstName: rx.patient.firstName,
        lastName: rx.patient.lastName,
        gender: rx.patient.gender,
        dateOfBirth: rx.patient.dateOfBirth,
      },
      doctor: {
        licenseNumber: rx.doctor.licenseNumber,
        specialization: rx.doctor.specialization,
        user: rx.doctor.user,
      },
      items: rx.items.map((i) => ({
        dosage: i.dosage,
        frequency: i.frequency,
        duration: i.duration,
        quantity: i.quantity,
        instructions: i.instructions,
        medicine: {
          name: i.medicine.name,
          genericName: i.medicine.genericName,
          form: i.medicine.form,
          strength: i.medicine.strength,
        },
      })),
    };

    return this.pdfService.generatePrescriptionPdf(pdfData);
  }

  async cancel(id: string, cancelDto: CancelPrescriptionDto, user: AuthenticatedUser) {
    const rx = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        doctor: true,
      },
    });

    if (!rx) {
      throw new NotFoundException(`Prescription '${id}' not found.`);
    }

    // Tenant check
    if (user.role !== UserRole.SUPER_ADMIN && rx.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Cross-tenant access to prescription is strictly forbidden.");
    }

    // Role-based authorization & doctor ownership
    if (user.role === UserRole.DOCTOR) {
      if (!user.hospitalId) {
        throw new ForbiddenException("Doctor must be assigned to an active hospital tenant.");
      }
      const doctor = await this.prisma.doctor.findFirst({
        where: { userId: user.id, hospitalId: user.hospitalId },
      });
      if (!doctor || rx.doctorId !== doctor.id) {
        throw new ForbiddenException("Doctors can only cancel prescriptions they authored.");
      }
    } else if (user.role !== UserRole.HOSPITAL_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only prescribing doctors or hospital administrators can cancel prescriptions.");
    }

    // Lifecycle transitions
    if (rx.status === PrescriptionStatus.DISPENSED) {
      throw new BadRequestException("Cannot cancel an already dispensed prescription.");
    }

    if (rx.status === PrescriptionStatus.PARTIALLY_DISPENSED) {
      throw new BadRequestException("Cannot cancel a partially dispensed prescription.");
    }

    if (rx.status === PrescriptionStatus.CANCELLED) {
      throw new BadRequestException("Prescription is already cancelled.");
    }

    // Atomically cancel and audit log
    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelledRx = await tx.prescription.update({
        where: { id },
        data: {
          status: PrescriptionStatus.CANCELLED,
          notes: cancelDto?.reason
            ? `${rx.notes ? rx.notes + " | " : ""}Cancellation Reason: ${cancelDto.reason}`
            : rx.notes,
        },
        include: {
          items: {
            include: {
              medicine: true,
            },
          },
          doctor: {
            include: {
              user: {
                select: { firstName: true, lastName: true, email: true },
              },
            },
          },
          patient: true,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: rx.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "Prescription",
          entityId: rx.id,
          details: {
            action: "CANCEL_PRESCRIPTION",
            previousStatus: rx.status,
            newStatus: PrescriptionStatus.CANCELLED,
            reason: cancelDto?.reason || null,
          },
        },
      });

      return cancelledRx;
    });

    return updated;
  }
}
