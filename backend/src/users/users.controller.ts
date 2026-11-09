import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Inject,
  Req,
  ValidationPipe,
} from "@nestjs/common";
import { Request } from "express";
import { UserRole } from "@prisma/client";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { QueryUsersDto } from "./dto/query-users.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get()
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: QueryUsersDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const data = await this.usersService.findAll(query, user);
    return {
      success: true,
      data,
      message: "Users retrieved successfully",
    };
  }

  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const data = await this.usersService.findOne(id, user);
    return {
      success: true,
      data,
      message: "User details retrieved successfully",
    };
  }

  @Patch(":id/status")
  async updateStatus(
    @Param("id") id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateUserStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const data = await this.usersService.updateStatus(id, dto, user, ipAddress, userAgent);
    return {
      success: true,
      data,
      message: dto.isActive
        ? "User account successfully activated"
        : "User account successfully deactivated",
    };
  }
}

