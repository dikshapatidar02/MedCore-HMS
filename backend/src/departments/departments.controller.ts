import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { DepartmentsService } from "./departments.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

@Controller("departments")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class DepartmentsController {
  constructor(
    @Inject(DepartmentsService) private readonly departmentsService: DepartmentsService
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  async create(
    @Body() createDto: CreateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.departmentsService.create(createDto, user);
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("hospitalId") hospitalId?: string
  ) {
    return this.departmentsService.findAll(user, {
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      hospitalId,
    });
  }

  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.departmentsService.findOne(id, user);
  }

  @Patch(":id")
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  async update(
    @Param("id") id: string,
    @Body() updateDto: UpdateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.departmentsService.update(id, updateDto, user);
  }

  @Delete(":id")
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.departmentsService.remove(id, user);
  }
}
