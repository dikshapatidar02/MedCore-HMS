import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole, AuditAction, Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateDoctorDto } from "./dto/create-doctor.dto";
import { UpdateDoctorDto } from "./dto/update-doctor.dto";

@Injectable()
export class DoctorsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(createDto: CreateDoctorDto, user: AuthenticatedUser) {
    const targetHospitalId =
      user.role === UserRole.SUPER_ADMIN && createDto.hospitalId
        ? createDto.hospitalId
        : user.hospitalId;

    if (!targetHospitalId) {
      throw new BadRequestException("Hospital ID is required to create a doctor.");
    }

    // 1. Verify Department belongs to target hospital
    const department = await this.prisma.department.findUnique({
      where: { id: createDto.departmentId },
    });

    if (!department || department.hospitalId !== targetHospitalId) {
      throw new ForbiddenException(
        "Cross-hospital violation: Department does not exist or belongs to another hospital."
      );
    }

    // 2. Check unique license number within hospital
    const existingLicense = await this.prisma.doctor.findUnique({
      where: {
        hospitalId_licenseNumber: {
          hospitalId: targetHospitalId,
          licenseNumber: createDto.licenseNumber.trim(),
        },
      },
    });

    if (existingLicense) {
      throw new ConflictException(
        `Doctor with license number '${createDto.licenseNumber}' already exists in this hospital.`
      );
    }

    let linkedUserId: string;

    if (createDto.userId) {
      // Linking existing user
      const existingUser = await this.prisma.user.findUnique({
        where: { id: createDto.userId },
        include: { doctorProfile: true },
      });

      if (!existingUser) {
        throw new NotFoundException("Specified user account not found.");
      }

      if (existingUser.hospitalId !== targetHospitalId) {
        throw new ForbiddenException(
          "Cross-hospital violation: Cannot link user belonging to another hospital."
        );
      }

      if (existingUser.role !== UserRole.DOCTOR) {
        throw new BadRequestException("User role must be DOCTOR to create a doctor profile.");
      }

      if (existingUser.doctorProfile) {
        throw new ConflictException("User already has an active doctor profile.");
      }

      linkedUserId = existingUser.id;
    } else {
      // Creating new user alongside doctor
      if (!createDto.email || !createDto.password || !createDto.firstName || !createDto.lastName) {
        throw new BadRequestException(
          "Email, password, firstName, and lastName are required when creating a new doctor user account."
        );
      }

      const existingEmail = await this.prisma.user.findUnique({
        where: { email: createDto.email.trim().toLowerCase() },
      });

      if (existingEmail) {
        throw new ConflictException(`Email '${createDto.email}' is already registered.`);
      }

      const passwordHash = await bcrypt.hash(createDto.password, 12);

      const newUser = await this.prisma.user.create({
        data: {
          hospitalId: targetHospitalId,
          role: UserRole.DOCTOR,
          email: createDto.email.trim().toLowerCase(),
          passwordHash,
          firstName: createDto.firstName.trim(),
          lastName: createDto.lastName.trim(),
          phone: createDto.phone?.trim(),
          isActive: true,
        },
      });

      linkedUserId = newUser.id;
    }

    const doctor = await this.prisma.doctor.create({
      data: {
        hospitalId: targetHospitalId,
        userId: linkedUserId,
        departmentId: createDto.departmentId,
        licenseNumber: createDto.licenseNumber.trim(),
        specialization: createDto.specialization.trim(),
        experienceYears: createDto.experienceYears ?? 0,
        consultationFee: new Prisma.Decimal(createDto.consultationFee),
        bio: createDto.bio?.trim(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
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
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: targetHospitalId,
        userId: user.id,
        action: AuditAction.CREATE,
        entityName: "Doctor",
        entityId: doctor.id,
        details: {
          licenseNumber: doctor.licenseNumber,
          specialization: doctor.specialization,
          departmentId: doctor.departmentId,
        },
      },
    });

    return doctor;
  }

  async findAll(
    user: AuthenticatedUser,
    options: {
      search?: string;
      departmentId?: string;
      specialization?: string;
      page?: number;
      limit?: number;
      hospitalId?: string;
    }
  ) {
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

    const where: Prisma.DoctorWhereInput = {
      deletedAt: null,
    };

    if (targetHospitalId) {
      where.hospitalId = targetHospitalId;
    }

    if (options.departmentId) {
      where.departmentId = options.departmentId;
    }

    if (options.specialization) {
      where.specialization = {
        contains: options.specialization,
        mode: "insensitive",
      };
    }

    if (options.search) {
      where.OR = [
        {
          user: {
            OR: [
              { firstName: { contains: options.search, mode: "insensitive" } },
              { lastName: { contains: options.search, mode: "insensitive" } },
              { email: { contains: options.search, mode: "insensitive" } },
            ],
          },
        },
        { specialization: { contains: options.search, mode: "insensitive" } },
        { licenseNumber: { contains: options.search, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.doctor.count({ where }),
      this.prisma.doctor.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              isActive: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          _count: {
            select: {
              appointments: true,
              availabilities: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
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
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        availabilities: {
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        },
        scheduleExceptions: {
          where: {
            date: { gte: new Date() },
          },
          orderBy: { date: "asc" },
        },
        _count: {
          select: {
            appointments: true,
            medicalRecords: true,
            prescriptions: true,
          },
        },
      },
    });

    if (!doctor || doctor.deletedAt) {
      throw new NotFoundException("Doctor not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && doctor.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Access to doctor from another hospital is strictly forbidden."
      );
    }

    return doctor;
  }

  async update(id: string, updateDto: UpdateDoctorDto, user: AuthenticatedUser) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!doctor || doctor.deletedAt) {
      throw new NotFoundException("Doctor not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && doctor.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Cannot update doctor belonging to another hospital."
      );
    }

    // Role-based editing restrictions
    if (user.role === UserRole.DOCTOR) {
      if (doctor.userId !== user.id) {
        throw new ForbiddenException("Doctors can only update their own profile.");
      }
      // Doctors can only update bio and phone
      if (
        updateDto.departmentId !== undefined ||
        updateDto.licenseNumber !== undefined ||
        updateDto.specialization !== undefined ||
        updateDto.experienceYears !== undefined ||
        updateDto.consultationFee !== undefined ||
        updateDto.firstName !== undefined ||
        updateDto.lastName !== undefined
      ) {
        throw new ForbiddenException(
          "Doctors are only permitted to update their bio and contact phone number."
        );
      }
    }

    // If departmentId updated, validate within same hospital
    if (updateDto.departmentId && updateDto.departmentId !== doctor.departmentId) {
      const dept = await this.prisma.department.findUnique({
        where: { id: updateDto.departmentId },
      });
      if (!dept || dept.hospitalId !== doctor.hospitalId) {
        throw new ForbiddenException(
          "Cross-hospital violation: Assigned department must belong to the doctor's hospital."
        );
      }
    }

    // If licenseNumber updated, check uniqueness within hospital
    if (updateDto.licenseNumber && updateDto.licenseNumber !== doctor.licenseNumber) {
      const existing = await this.prisma.doctor.findUnique({
        where: {
          hospitalId_licenseNumber: {
            hospitalId: doctor.hospitalId,
            licenseNumber: updateDto.licenseNumber.trim(),
          },
        },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Doctor with license number '${updateDto.licenseNumber}' already exists in this hospital.`
        );
      }
    }

    // Update Doctor and User records in transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      if (updateDto.firstName || updateDto.lastName || updateDto.phone) {
        await tx.user.update({
          where: { id: doctor.userId },
          data: {
            firstName: updateDto.firstName ? updateDto.firstName.trim() : undefined,
            lastName: updateDto.lastName ? updateDto.lastName.trim() : undefined,
            phone: updateDto.phone !== undefined ? updateDto.phone?.trim() : undefined,
          },
        });
      }

      return tx.doctor.update({
        where: { id },
        data: {
          departmentId: updateDto.departmentId,
          licenseNumber: updateDto.licenseNumber ? updateDto.licenseNumber.trim() : undefined,
          specialization: updateDto.specialization ? updateDto.specialization.trim() : undefined,
          experienceYears: updateDto.experienceYears,
          consultationFee:
            updateDto.consultationFee !== undefined
              ? new Prisma.Decimal(updateDto.consultationFee)
              : undefined,
          bio: updateDto.bio !== undefined ? updateDto.bio?.trim() : undefined,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              role: true,
              isActive: true,
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
      });
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: doctor.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "Doctor",
        entityId: id,
        details: updateDto as any,
      },
    });

    return updated;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
    });

    if (!doctor || doctor.deletedAt) {
      throw new NotFoundException("Doctor not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && doctor.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Cannot delete doctor belonging to another hospital."
      );
    }

    // Soft delete
    await this.prisma.doctor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: doctor.hospitalId,
        userId: user.id,
        action: AuditAction.DELETE,
        entityName: "Doctor",
        entityId: id,
        details: { licenseNumber: doctor.licenseNumber },
      },
    });

    return { message: "Doctor profile deleted successfully." };
  }

  async getAppointments(
    doctorId: string,
    user: AuthenticatedUser,
    options: { status?: string; date?: string; page?: number; limit?: number }
  ) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
    });

    if (!doctor || doctor.deletedAt) {
      throw new NotFoundException("Doctor not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && doctor.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation.");
    }

    if (user.role === UserRole.DOCTOR && doctor.userId !== user.id) {
      throw new ForbiddenException("Doctors can only view their own appointments.");
    }

    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, options.limit || 50);
    const skip = (page - 1) * limit;

    const where: Prisma.AppointmentWhereInput = {
      doctorId,
      hospitalId: doctor.hospitalId,
      deletedAt: null,
    };

    if (options.status) {
      where.status = options.status as any;
    }

    if (options.date) {
      where.appointmentDate = new Date(options.date);
    }

    const [total, items] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        include: {
          patient: {
            select: {
              id: true,
              mrn: true,
              firstName: true,
              lastName: true,
              phone: true,
              gender: true,
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
}
