import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole, HospitalStatus, AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

@Injectable()
export class HospitalsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAllHospitals(page = 1, limit = 20, search?: string, status?: any) {
    const skip = (Math.max(1, page) - 1) * limit;
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.hospital.count({ where }),
      this.prisma.hospital.findMany({
        where,
        skip,
        take: limit,
        include: {
          address: true,
          _count: {
            select: {
              departments: true,
              doctors: true,
              patients: true,
              appointments: true,
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

  async findHospitalById(id: string) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id },
      include: {
        address: true,
        departments: {
          include: {
            _count: { select: { doctors: true, rooms: true } },
          },
        },
        _count: {
          select: {
            departments: true,
            doctors: true,
            patients: true,
            appointments: true,
            rooms: true,
          },
        },
      },
    });

    if (!hospital) {
      throw new NotFoundException("Hospital not found.");
    }

    return hospital;
  }

  async updateHospitalById(id: string, dto: any) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id },
      include: { address: true },
    });

    if (!hospital) {
      throw new NotFoundException("Hospital not found.");
    }

    const { street, city, state, postalCode, country, ...hospitalData } = dto;

    let addressId = hospital.addressId;
    if (street || city || state || postalCode || country) {
      if (addressId) {
        await this.prisma.address.update({
          where: { id: addressId },
          data: {
            street: street || undefined,
            city: city || undefined,
            state: state || undefined,
            postalCode: postalCode || undefined,
            country: country || undefined,
          },
        });
      } else {
        const newAddress = await this.prisma.address.create({
          data: {
            street: street || "N/A",
            city: city || "N/A",
            state: state || "N/A",
            postalCode: postalCode || "000000",
            country: country || "India",
          },
        });
        addressId = newAddress.id;
      }
    }

    return this.prisma.hospital.update({
      where: { id },
      data: {
        ...hospitalData,
        addressId,
      },
      include: {
        address: true,
      },
    });
  }

  async updateMyHospital(user: AuthenticatedUser, dto: any) {
    if (!user.hospitalId) {
      throw new ForbiddenException("Platform Super Administrator must specify a hospital ID.");
    }

    // Hospital Admin is strictly forbidden from changing status or code
    const { status, code, id, ...allowedData } = dto;
    return this.updateHospitalById(user.hospitalId, allowedData);
  }

  async getMyHospital(user: AuthenticatedUser) {
    if (!user.hospitalId) {
      return {
        isPlatformAdmin: true,
        message: "Super Administrator operates platform-wide across all hospitals.",
      };
    }

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: user.hospitalId },
      include: {
        address: true,
        _count: {
          select: {
            departments: true,
            doctors: true,
            patients: true,
            rooms: true,
          },
        },
      },
    });

    if (!hospital) {
      throw new NotFoundException("Hospital not found.");
    }

    return hospital;
  }

  async getDepartments(hospitalId: string, user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN && hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Access to departments from another hospital is forbidden."
      );
    }

    const effectiveHospitalId = user.role === UserRole.SUPER_ADMIN ? hospitalId : user.hospitalId!;
    const departments = await this.prisma.department.findMany({
      where: { hospitalId: effectiveHospitalId },
      include: {
        _count: {
          select: {
            doctors: true,
            rooms: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return departments;
  }

  async getPatients(hospitalId: string, user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN && hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Access to patients from another hospital is forbidden."
      );
    }

    const effectiveHospitalId = user.role === UserRole.SUPER_ADMIN ? hospitalId : user.hospitalId!;
    const patients = await this.prisma.patient.findMany({
      where: { hospitalId: effectiveHospitalId, deletedAt: null },
      select: {
        id: true,
        mrn: true,
        firstName: true,
        lastName: true,
        gender: true,
        bloodGroup: true,
        phone: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return patients;
  }

  async getPlatformOverview() {
    const [totalHospitals, totalDoctors, totalPatients, totalAppointments] =
      await Promise.all([
        this.prisma.hospital.count(),
        this.prisma.doctor.count({ where: { deletedAt: null } }),
        this.prisma.patient.count({ where: { deletedAt: null } }),
        this.prisma.appointment.count({ where: { deletedAt: null } }),
      ]);

    const hospitals = await this.prisma.hospital.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        _count: {
          select: {
            doctors: true,
            patients: true,
            appointments: true,
          },
        },
      },
    });

    return {
      metrics: {
        totalHospitals,
        totalDoctors,
        totalPatients,
        totalAppointments,
      },
      hospitals,
    };
  }

  /**
   * Service-level tenant boundary validation for clinical encounters.
   * Prevents connecting patients and doctors from different hospitals.
   */
  async validateAppointmentTenant(hospitalId: string, patientId: string, doctorId: string) {
    const [patient, doctor] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: patientId } }),
      this.prisma.doctor.findUnique({ where: { id: doctorId } }),
    ]);

    if (!patient || !doctor) {
      throw new NotFoundException("Patient or Doctor not found.");
    }

    if (patient.hospitalId !== hospitalId || doctor.hospitalId !== hospitalId) {
      throw new ForbiddenException(
        "Cross-hospital relationship violation: Patient, Doctor, and Appointment must belong to the exact same hospital tenant."
      );
    }

    return true;
  }

  /**
   * Service-level tenant & patient privacy validation.
   * Ensures patients can only access their own records, and staff can only access records in their hospital.
   */
  async getPatientClinicalRecords(user: AuthenticatedUser, targetPatientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: targetPatientId },
      include: {
        medicalRecords: {
          include: {
            diagnoses: true,
            vitalSigns: true,
            treatmentPlans: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException("Patient not found.");
    }

    // Patient role can strictly access only their own patient profile
    if (user.role === UserRole.PATIENT) {
      if (patient.userId !== user.id) {
        throw new ForbiddenException(
          "Access denied: Patients are strictly restricted to accessing their own clinical records."
        );
      }
    } else if (user.role !== UserRole.SUPER_ADMIN) {
      // Staff roles can only access patients within their own hospital
      if (patient.hospitalId !== user.hospitalId) {
        throw new ForbiddenException(
          "Tenant isolation violation: You cannot access clinical records of a patient from another hospital."
        );
      }
    }

    return patient;
  }

  /**
   * Service-level patient update protection.
   * Ensures patients cannot modify another patient's profile and validates tenant boundaries.
   */
  async updatePatientProfile(user: AuthenticatedUser, targetPatientId: string, updateData: { phone?: string }) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: targetPatientId },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient not found.");
    }

    if (user.role === UserRole.PATIENT && patient.userId !== user.id) {
      throw new ForbiddenException(
        "Access denied: Patients cannot modify profile records belonging to other patients."
      );
    }

    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.PATIENT) {
      if (patient.hospitalId !== user.hospitalId) {
        throw new ForbiddenException(
          "Tenant isolation violation: Cannot modify patient from another hospital."
        );
      }
    }

    return this.prisma.patient.update({
      where: { id: targetPatientId },
      data: updateData,
    });
  }

  /**
   * Service-level appointment access validation.
   * Ensures doctors and staff can only access appointments within their hospital,
   * and patients can only access their own appointments.
   */
  async getAppointment(user: AuthenticatedUser, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: {
          include: { user: true },
        },
        department: true,
      },
    });

    if (!appointment || appointment.deletedAt) {
      throw new NotFoundException("Appointment not found.");
    }

    if (user.role === UserRole.PATIENT) {
      if (appointment.patient.userId !== user.id) {
        throw new ForbiddenException(
          "Access denied: Patients are strictly restricted to accessing their own appointments."
        );
      }
    } else if (user.role !== UserRole.SUPER_ADMIN && appointment.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Access to appointment belonging to another hospital is strictly forbidden."
      );
    }

    return appointment;
  }

  /**
   * Service-level invoice access validation.
   * Ensures accountants/staff only access invoices within their hospital,
   * and patients can only access their own invoices.
   */
  async getInvoice(user: AuthenticatedUser, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, payments: true, patient: true },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found.");
    }

    if (user.role === UserRole.PATIENT) {
      if (!invoice.patient || invoice.patient.userId !== user.id) {
        throw new ForbiddenException(
          "Access denied: Patients are strictly restricted to accessing their own invoices."
        );
      }
    } else if (user.role !== UserRole.SUPER_ADMIN && invoice.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Access to invoice belonging to another hospital is strictly forbidden."
      );
    }

    return invoice;
  }

  /**
   * Retrieves all hospital registration requests in ONBOARDING status.
   * Scoped exclusively to Platform Super Administrators.
   */
  async getPendingRegistrations() {
    return this.prisma.hospital.findMany({
      where: { status: HospitalStatus.ONBOARDING },
      include: {
        address: true,
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            users: true,
            departments: true,
            doctors: true,
            patients: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Approves a pending hospital registration request.
   * Validates status transition from ONBOARDING -> ACTIVE.
   * Activates the initial hospital administrator accounts and writes an audit log.
   */
  async approveHospital(
    id: string,
    approvingUser: AuthenticatedUser,
    ipAddress?: string,
    userAgent?: string
  ) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id },
      include: { address: true },
    });

    if (!hospital) {
      throw new NotFoundException("Hospital not found.");
    }

    if (hospital.status !== HospitalStatus.ONBOARDING) {
      throw new BadRequestException(
        `Invalid status transition: Only hospitals in ONBOARDING status can be approved. Current status is ${hospital.status}.`
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const h = await tx.hospital.update({
        where: { id },
        data: { status: HospitalStatus.ACTIVE },
        include: { address: true },
      });

      // Activate all initial hospital administrator accounts for this hospital
      await tx.user.updateMany({
        where: { hospitalId: id, role: UserRole.HOSPITAL_ADMIN },
        data: { isActive: true },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: id,
          userId: approvingUser.id,
          action: AuditAction.UPDATE,
          entityName: "Hospital",
          entityId: id,
          details: {
            action: "HOSPITAL_APPROVAL",
            previousStatus: hospital.status,
            newStatus: HospitalStatus.ACTIVE,
            approvedBy: approvingUser.email,
            approvedAt: new Date().toISOString(),
          },
          ipAddress,
          userAgent,
        },
      });

      return h;
    });

    return updated;
  }

  /**
   * Rejects a pending hospital registration request.
   * Validates status transition from ONBOARDING -> INACTIVE.
   * Ensures users remain inactive, revokes any tokens, and writes an audit log with reason.
   */
  async rejectHospital(
    id: string,
    reason: string | undefined,
    rejectingUser: AuthenticatedUser,
    ipAddress?: string,
    userAgent?: string
  ) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id },
      include: { address: true },
    });

    if (!hospital) {
      throw new NotFoundException("Hospital not found.");
    }

    if (hospital.status !== HospitalStatus.ONBOARDING) {
      throw new BadRequestException(
        `Invalid status transition: Only hospitals in ONBOARDING status can be rejected. Current status is ${hospital.status}.`
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const h = await tx.hospital.update({
        where: { id },
        data: { status: HospitalStatus.INACTIVE },
        include: { address: true },
      });

      // Ensure users remain inactive and revoke any active refresh tokens
      await tx.user.updateMany({
        where: { hospitalId: id },
        data: { isActive: false },
      });

      const users = await tx.user.findMany({
        where: { hospitalId: id },
        select: { id: true },
      });

      if (users.length > 0) {
        await tx.refreshToken.deleteMany({
          where: { userId: { in: users.map((u) => u.id) } },
        });
      }

      await tx.auditLog.create({
        data: {
          hospitalId: id,
          userId: rejectingUser.id,
          action: AuditAction.UPDATE,
          entityName: "Hospital",
          entityId: id,
          details: {
            action: "HOSPITAL_REJECTION",
            previousStatus: hospital.status,
            newStatus: HospitalStatus.INACTIVE,
            rejectedBy: rejectingUser.email,
            rejectedAt: new Date().toISOString(),
            reason: reason?.trim() || "Registration request rejected by platform administrator",
          },
          ipAddress,
          userAgent,
        },
      });

      return h;
    });

    return updated;
  }
}
