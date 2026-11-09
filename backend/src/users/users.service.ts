import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole, HospitalStatus, AuditAction, Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { QueryUsersDto } from "./dto/query-users.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private readonly userSelectFields = {
    id: true,
    hospitalId: true,
    role: true,
    email: true,
    firstName: true,
    lastName: true,
    phone: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    hospital: {
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
      },
    },
  };

  async findAll(query: QueryUsersDto, currentUser: AuthenticatedUser) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    // 1. Enforce multi-tenant boundary for HOSPITAL_ADMIN
    if (currentUser.role === UserRole.HOSPITAL_ADMIN) {
      if (!currentUser.hospitalId) {
        throw new ForbiddenException("Hospital administrator is not assigned to a hospital.");
      }
      where.hospitalId = currentUser.hospitalId;
    } else if (currentUser.role === UserRole.SUPER_ADMIN && query.hospitalId) {
      where.hospitalId = query.hospitalId;
    }

    // 2. Role filter
    if (query.role) {
      where.role = query.role;
    }

    // 3. Status filter
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    // 4. Search query across name, email, phone
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { firstName: { contains: s, mode: "insensitive" } },
        { lastName: { contains: s, mode: "insensitive" } },
        { email: { contains: s, mode: "insensitive" } },
        { phone: { contains: s, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: this.userSelectFields,
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

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.userSelectFields,
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    // Hospital Admin can only access users within their own hospital
    if (currentUser.role === UserRole.HOSPITAL_ADMIN && user.hospitalId !== currentUser.hospitalId) {
      throw new ForbiddenException("Cross-hospital violation: Cannot view users outside your hospital.");
    }

    return user;
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
    userAgent?: string
  ) {
    // 1. Retrieve target user with hospital information
    const targetUser = await this.prisma.user.findUnique({
      where: { id },
      include: {
        hospital: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw new NotFoundException("User not found.");
    }

    // 2. Prevent self-activation or self-deactivation
    if (targetUser.id === currentUser.id) {
      throw new BadRequestException("Administrators cannot alter their own activation status.");
    }

    // 3. Hierarchy protection: Hospital Admin cannot modify Platform Super Administrators
    if (currentUser.role === UserRole.HOSPITAL_ADMIN && targetUser.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Hospital administrators cannot modify platform super administrators.");
    }

    // 4. Multi-tenant isolation: Hospital Admin cannot modify users of another hospital
    if (currentUser.role === UserRole.HOSPITAL_ADMIN && targetUser.hospitalId !== currentUser.hospitalId) {
      throw new ForbiddenException("Cross-hospital violation: You can only manage users within your own hospital.");
    }

    // 5. Hospital status validation when activating
    if (dto.isActive && targetUser.hospital) {
      const hStatus = targetUser.hospital.status;
      if (hStatus === HospitalStatus.SUSPENDED || hStatus === HospitalStatus.INACTIVE) {
        throw new BadRequestException(
          `Cannot activate user because hospital '${targetUser.hospital.name}' is ${hStatus}. Resolve hospital status first.`
        );
      }

      if (hStatus === HospitalStatus.ONBOARDING && currentUser.role !== UserRole.SUPER_ADMIN) {
        throw new BadRequestException(
          "Cannot activate user while hospital registration is pending platform approval."
        );
      }
    }

    // 6. Execute activation or deactivation in a database transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { isActive: dto.isActive },
        select: this.userSelectFields,
      });

      // If deactivating user, immediately revoke all active refresh token sessions
      if (!dto.isActive) {
        await tx.refreshToken.deleteMany({
          where: { userId: targetUser.id },
        });
      }

      // Record immutable audit log
      await tx.auditLog.create({
        data: {
          hospitalId: targetUser.hospitalId || currentUser.hospitalId,
          userId: currentUser.id,
          action: AuditAction.UPDATE,
          entityName: "User",
          entityId: targetUser.id,
          details: {
            action: dto.isActive ? "USER_ACTIVATION" : "USER_DEACTIVATION",
            targetEmail: targetUser.email,
            targetRole: targetUser.role,
            previousActive: targetUser.isActive,
            newActive: dto.isActive,
            updatedBy: currentUser.email,
            reason: dto.reason?.trim() || (dto.isActive ? "Administrative activation" : "Administrative deactivation"),
          },
          ipAddress,
          userAgent,
        },
      });

      return u;
    });

    return updated;
  }
}

