import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole, AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";

@Injectable()
export class DepartmentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(createDto: CreateDepartmentDto, user: AuthenticatedUser) {
    const targetHospitalId =
      user.role === UserRole.SUPER_ADMIN && createDto.hospitalId
        ? createDto.hospitalId
        : user.hospitalId;

    if (!targetHospitalId) {
      throw new BadRequestException("Hospital ID is required to create a department.");
    }

    const code = createDto.code.trim().toUpperCase();

    // Check unique code within hospital
    const existing = await this.prisma.department.findUnique({
      where: {
        hospitalId_code: {
          hospitalId: targetHospitalId,
          code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Department with code '${code}' already exists in this hospital.`
      );
    }

    // If head of department specified, validate tenant ownership
    if (createDto.headOfDepartmentId) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { id: createDto.headOfDepartmentId },
      });
      if (!doctor || doctor.hospitalId !== targetHospitalId) {
        throw new ForbiddenException(
          "Cross-hospital violation: Head of Department must be a doctor belonging to the same hospital."
        );
      }
    }

    const department = await this.prisma.department.create({
      data: {
        hospitalId: targetHospitalId,
        code,
        name: createDto.name.trim(),
        description: createDto.description?.trim(),
        headOfDepartmentId: createDto.headOfDepartmentId,
      },
      include: {
        _count: {
          select: { doctors: true, rooms: true },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: targetHospitalId,
        userId: user.id,
        action: AuditAction.CREATE,
        entityName: "Department",
        entityId: department.id,
        details: { code: department.code, name: department.name },
      },
    });

    return department;
  }

  async findAll(
    user: AuthenticatedUser,
    options: { search?: string; page?: number; limit?: number; hospitalId?: string }
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

    const where: any = {};
    if (targetHospitalId) {
      where.hospitalId = targetHospitalId;
    }

    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { code: { contains: options.search, mode: "insensitive" } },
        { description: { contains: options.search, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.department.count({ where }),
      this.prisma.department.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: { doctors: true, rooms: true, appointments: true },
          },
        },
        orderBy: { name: "asc" },
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
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        hospital: {
          select: { id: true, name: true, code: true },
        },
        doctors: {
          where: { deletedAt: null },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        rooms: true,
        _count: {
          select: { doctors: true, rooms: true, appointments: true },
        },
      },
    });

    if (!department) {
      throw new NotFoundException("Department not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && department.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Access to department from another hospital is strictly forbidden."
      );
    }

    return department;
  }

  async update(id: string, updateDto: UpdateDepartmentDto, user: AuthenticatedUser) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });

    if (!department) {
      throw new NotFoundException("Department not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && department.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Cannot update department belonging to another hospital."
      );
    }

    if (updateDto.code && updateDto.code !== department.code) {
      const code = updateDto.code.trim().toUpperCase();
      const existing = await this.prisma.department.findUnique({
        where: {
          hospitalId_code: {
            hospitalId: department.hospitalId,
            code,
          },
        },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Department with code '${code}' already exists in this hospital.`
        );
      }
    }

    if (updateDto.headOfDepartmentId) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { id: updateDto.headOfDepartmentId },
      });
      if (!doctor || doctor.hospitalId !== department.hospitalId) {
        throw new ForbiddenException(
          "Cross-hospital violation: Head of Department must be a doctor in the same hospital."
        );
      }
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        code: updateDto.code ? updateDto.code.trim().toUpperCase() : undefined,
        name: updateDto.name ? updateDto.name.trim() : undefined,
        description: updateDto.description !== undefined ? updateDto.description?.trim() : undefined,
        headOfDepartmentId: updateDto.headOfDepartmentId,
      },
      include: {
        _count: { select: { doctors: true, rooms: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: department.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "Department",
        entityId: id,
        details: updateDto as any,
      },
    });

    return updated;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: { doctors: true, appointments: true, rooms: true },
        },
      },
    });

    if (!department) {
      throw new NotFoundException("Department not found.");
    }

    if (user.role !== UserRole.SUPER_ADMIN && department.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        "Tenant isolation violation: Cannot delete department belonging to another hospital."
      );
    }

    if (department._count.doctors > 0) {
      throw new BadRequestException(
        `Cannot delete department: ${department._count.doctors} doctor(s) are currently assigned to it. Reassign doctors first.`
      );
    }

    await this.prisma.department.delete({ where: { id } });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: department.hospitalId,
        userId: user.id,
        action: AuditAction.DELETE,
        entityName: "Department",
        entityId: id,
        details: { code: department.code, name: department.name },
      },
    });

    return { message: "Department deleted successfully." };
  }
}
