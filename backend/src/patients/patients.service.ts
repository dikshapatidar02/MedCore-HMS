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
import { CreatePatientDto } from "./dto/create-patient.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";

@Injectable()
export class PatientsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async generateUniqueMrn(hospitalId: string): Promise<string> {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { code: true },
    });

    const prefix = hospital?.code ? hospital.code.toUpperCase() : "HOSP";
    const count = await this.prisma.patient.count({
      where: { hospitalId },
    });

    let mrn = `${prefix}-${(count + 1).toString().padStart(6, "0")}`;

    // Ensure uniqueness
    let exists = await this.prisma.patient.findUnique({
      where: { hospitalId_mrn: { hospitalId, mrn } },
    });

    while (exists) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      mrn = `${prefix}-${count + 1}-${randomSuffix}`;
      exists = await this.prisma.patient.findUnique({
        where: { hospitalId_mrn: { hospitalId, mrn } },
      });
    }

    return mrn;
  }

  async create(createDto: CreatePatientDto, user: AuthenticatedUser) {
    const targetHospitalId =
      user.role === UserRole.SUPER_ADMIN && createDto.hospitalId
        ? createDto.hospitalId
        : user.hospitalId;

    if (!targetHospitalId) {
      throw new BadRequestException("Hospital ID is required to register a patient.");
    }

    // If linking an existing user account
    if (createDto.userId) {
      const linkedUser = await this.prisma.user.findUnique({
        where: { id: createDto.userId },
        include: { patientProfile: true },
      });

      if (!linkedUser) {
        throw new NotFoundException("User account for patient not found.");
      }

      if (linkedUser.hospitalId !== targetHospitalId) {
        throw new ForbiddenException(
          "Cross-hospital violation: User account belongs to another hospital."
        );
      }

      if (linkedUser.role !== UserRole.PATIENT) {
        throw new BadRequestException("User role must be PATIENT to link as patient profile.");
      }

      if (linkedUser.patientProfile) {
        throw new BadRequestException("User account is already linked to a patient profile.");
      }
    }

    const mrn = await this.generateUniqueMrn(targetHospitalId);

    const patient = await this.prisma.$transaction(async (tx) => {
      let addressId: string | undefined;

      if (createDto.address) {
        const address = await tx.address.create({
          data: {
            street: createDto.address.street.trim(),
            city: createDto.address.city.trim(),
            state: createDto.address.state.trim(),
            postalCode: createDto.address.postalCode.trim(),
            country: createDto.address.country?.trim() || "India",
          },
        });
        addressId = address.id;
      }

      return tx.patient.create({
        data: {
          hospitalId: targetHospitalId,
          userId: createDto.userId,
          mrn,
          firstName: createDto.firstName.trim(),
          lastName: createDto.lastName.trim(),
          dateOfBirth: new Date(createDto.dateOfBirth),
          gender: createDto.gender,
          bloodGroup: createDto.bloodGroup?.trim(),
          phone: createDto.phone.trim(),
          email: createDto.email?.trim().toLowerCase(),
          emergencyContactName: createDto.emergencyContactName.trim(),
          emergencyContactPhone: createDto.emergencyContactPhone.trim(),
          addressId,
        },
        include: {
          address: true,
          hospital: {
            select: { id: true, name: true, code: true },
          },
        },
      });
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: targetHospitalId,
        userId: user.id,
        action: AuditAction.CREATE,
        entityName: "Patient",
        entityId: patient.id,
        details: { mrn: patient.mrn, name: `${patient.firstName} ${patient.lastName}` },
      },
    });

    return patient;
  }

  async findAll(
    user: AuthenticatedUser,
    options: {
      search?: string;
      page?: number;
      limit?: number;
      hospitalId?: string;
    }
  ) {
    if (user.role === UserRole.PATIENT) {
      throw new ForbiddenException("Patients cannot access the patient directory.");
    }

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

    const where: Prisma.PatientWhereInput = {
      deletedAt: null,
    };

    if (targetHospitalId) {
      where.hospitalId = targetHospitalId;
    }

    if (options.search) {
      where.OR = [
        { mrn: { contains: options.search, mode: "insensitive" } },
        { firstName: { contains: options.search, mode: "insensitive" } },
        { lastName: { contains: options.search, mode: "insensitive" } },
        { phone: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        include: {
          address: true,
          _count: {
            select: {
              appointments: true,
              medicalRecords: true,
              prescriptions: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
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
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        address: true,
        hospital: {
          select: { id: true, name: true, code: true },
        },
        allergies: true,
        medicationHistories: true,
        _count: {
          select: {
            appointments: true,
            medicalRecords: true,
            prescriptions: true,
            invoices: true,
          },
        },
      },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && patient.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Access to patient from another hospital is strictly forbidden."
      );
    }

    // Patient role self-access enforcement
    if (user.role === UserRole.PATIENT && patient.userId !== user.id) {
      throw new ForbiddenException(
        "Patient self-access restriction: You can only view your own patient profile."
      );
    }

    return patient;
  }

  async findMyProfile(user: AuthenticatedUser) {
    if (user.role !== UserRole.PATIENT) {
      throw new BadRequestException("User is not a patient.");
    }

    const patient = await this.prisma.patient.findUnique({
      where: { userId: user.id },
      include: {
        address: true,
        hospital: {
          select: { id: true, name: true, code: true },
        },
        allergies: true,
        medicationHistories: true,
        _count: {
          select: {
            appointments: true,
            prescriptions: true,
            invoices: true,
          },
        },
      },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient profile not found.");
    }

    return patient;
  }

  async update(id: string, updateDto: UpdatePatientDto, user: AuthenticatedUser) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: { address: true },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && patient.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Cannot update patient belonging to another hospital."
      );
    }

    // Role-based restrictions
    if (user.role === UserRole.PATIENT) {
      if (patient.userId !== user.id) {
        throw new ForbiddenException("Patients can only update their own profile.");
      }
      if (
        updateDto.firstName !== undefined ||
        updateDto.lastName !== undefined ||
        updateDto.dateOfBirth !== undefined ||
        updateDto.gender !== undefined ||
        updateDto.bloodGroup !== undefined
      ) {
        throw new ForbiddenException(
          "Patients can only update their contact phone number, emergency contact, and address."
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let addressId = patient.addressId;

      if (updateDto.address) {
        if (addressId) {
          await tx.address.update({
            where: { id: addressId },
            data: {
              street: updateDto.address.street.trim(),
              city: updateDto.address.city.trim(),
              state: updateDto.address.state.trim(),
              postalCode: updateDto.address.postalCode.trim(),
              country: updateDto.address.country?.trim() || "India",
            },
          });
        } else {
          const newAddress = await tx.address.create({
            data: {
              street: updateDto.address.street.trim(),
              city: updateDto.address.city.trim(),
              state: updateDto.address.state.trim(),
              postalCode: updateDto.address.postalCode.trim(),
              country: updateDto.address.country?.trim() || "India",
            },
          });
          addressId = newAddress.id;
        }
      }

      return tx.patient.update({
        where: { id },
        data: {
          firstName: updateDto.firstName ? updateDto.firstName.trim() : undefined,
          lastName: updateDto.lastName ? updateDto.lastName.trim() : undefined,
          dateOfBirth: updateDto.dateOfBirth ? new Date(updateDto.dateOfBirth) : undefined,
          gender: updateDto.gender,
          bloodGroup: updateDto.bloodGroup?.trim(),
          phone: updateDto.phone ? updateDto.phone.trim() : undefined,
          email: updateDto.email !== undefined ? updateDto.email?.trim().toLowerCase() : undefined,
          emergencyContactName: updateDto.emergencyContactName
            ? updateDto.emergencyContactName.trim()
            : undefined,
          emergencyContactPhone: updateDto.emergencyContactPhone
            ? updateDto.emergencyContactPhone.trim()
            : undefined,
          addressId,
        },
        include: {
          address: true,
        },
      });
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: patient.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "Patient",
        entityId: id,
        details: updateDto as any,
      },
    });

    return updated;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && patient.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Cannot delete patient belonging to another hospital."
      );
    }

    // Soft delete
    await this.prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: patient.hospitalId,
        userId: user.id,
        action: AuditAction.DELETE,
        entityName: "Patient",
        entityId: id,
        details: { mrn: patient.mrn },
      },
    });

    return { message: "Patient record soft-deleted successfully." };
  }

  async getAppointments(
    patientId: string,
    user: AuthenticatedUser,
    options: { status?: string; page?: number; limit?: number }
  ) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && patient.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation.");
    }

    if (user.role === UserRole.PATIENT && patient.userId !== user.id) {
      throw new ForbiddenException("Patients can only view their own appointments.");
    }

    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, options.limit || 50);
    const skip = (page - 1) * limit;

    const where: Prisma.AppointmentWhereInput = {
      patientId,
      hospitalId: patient.hospitalId,
      deletedAt: null,
    };

    if (options.status) {
      where.status = options.status as any;
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
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
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

  async getClinicalOverview(id: string, user: AuthenticatedUser) {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        address: true,
        hospital: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient not found.");
    }

    if (!isSuperAdmin && patient.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation: Patient belongs to another hospital.");
    }

    if (user.role === UserRole.PATIENT && patient.userId !== user.id) {
      throw new ForbiddenException("Patient privacy restriction: You can only view your own clinical overview.");
    }

    const [recentEncounters, latestVitalSigns, activeAllergies, activeMedications, recentDiagnoses] =
      await Promise.all([
        this.prisma.medicalRecord.findMany({
          where: { patientId: id, deletedAt: null },
          orderBy: { visitDate: "desc" },
          take: 5,
          include: {
            doctor: {
              include: { user: { select: { firstName: true, lastName: true } } },
            },
            diagnoses: true,
            signedBy: { select: { firstName: true, lastName: true } },
          },
        }),
        this.prisma.vitalSigns.findFirst({
          where: { patientId: id },
          orderBy: { recordedAt: "desc" },
          include: {
            recordedBy: { select: { firstName: true, lastName: true, role: true } },
          },
        }),
        this.prisma.patientAllergy.findMany({
          where: { patientId: id, isActive: true },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.patientMedicationHistory.findMany({
          where: { patientId: id, isActive: true },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.diagnosis.findMany({
          where: { medicalRecord: { patientId: id } },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

    const formattedVitals = latestVitalSigns
      ? {
          ...latestVitalSigns,
          systolicBp: latestVitalSigns.bloodPressureSystolic,
          diastolicBp: latestVitalSigns.bloodPressureDiastolic,
        }
      : null;

    return {
      patient,
      recentEncounters,
      latestVitalSigns: formattedVitals,
      activeAllergies,
      activeMedications,
      recentDiagnoses,
      latestVitals: formattedVitals,
      allergies: activeAllergies,
      medications: activeMedications,
      diagnoses: recentDiagnoses,
      recentRecords: recentEncounters,
    };
  }

  // Phase 6: Patient Portal Self-Service
  async getMyPrescriptions(user: AuthenticatedUser) {
    const patient = await this.prisma.patient.findFirst({
      where: { userId: user.id },
    });
    if (!patient) {
      throw new NotFoundException("Patient profile not linked to authenticated user.");
    }

    return this.prisma.prescription.findMany({
      where: { patientId: patient.id },
      include: {
        items: {
          include: {
            medicine: true,
            dispensingRecords: true,
          },
        },
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        hospital: { select: { name: true, phone: true } },
      },
      orderBy: { prescriptionDate: "desc" },
    });
  }

  async getMyLabReports(user: AuthenticatedUser) {
    const patient = await this.prisma.patient.findFirst({
      where: { userId: user.id },
    });
    if (!patient) {
      throw new NotFoundException("Patient profile not linked to authenticated user.");
    }

    // PRD: Patients must only see APPROVED lab reports
    return this.prisma.labOrder.findMany({
      where: {
        patientId: patient.id,
        status: "APPROVED",
      },
      include: {
        results: {
          where: { isApproved: true },
          include: {
            labTest: true,
            approvedBy: { select: { firstName: true, lastName: true } },
          },
        },
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        hospital: { select: { name: true, phone: true } },
      },
      orderBy: { orderDate: "desc" },
    });
  }

  async getMyInvoices(user: AuthenticatedUser) {
    const patient = await this.prisma.patient.findFirst({
      where: { userId: user.id },
    });
    if (!patient) {
      throw new NotFoundException("Patient profile not linked to authenticated user.");
    }

    return this.prisma.invoice.findMany({
      where: { patientId: patient.id },
      include: {
        items: true,
        payments: true,
        hospital: { select: { name: true, phone: true } },
      },
      orderBy: { issueDate: "desc" },
    });
  }

  async getMyNotifications(user: AuthenticatedUser) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async getMyPayments(user: AuthenticatedUser) {
    const patient = await this.prisma.patient.findFirst({
      where: { userId: user.id },
    });
    if (!patient) {
      throw new NotFoundException("Patient profile not linked to authenticated user.");
    }

    return this.prisma.payment.findMany({
      where: {
        invoice: { patientId: patient.id },
      },
      include: {
        invoice: {
          select: { id: true, invoiceNumber: true, totalAmount: true, status: true },
        },
      },
      orderBy: { paymentDate: "desc" },
    });
  }
}


