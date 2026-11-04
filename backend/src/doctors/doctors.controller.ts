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
import { DoctorsService } from "./doctors.service";
import { CreateDoctorDto } from "./dto/create-doctor.dto";
import { UpdateDoctorDto } from "./dto/update-doctor.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

@Controller("doctors")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class DoctorsController {
  constructor(
    @Inject(DoctorsService) private readonly doctorsService: DoctorsService
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  async create(
    @Body() createDto: CreateDoctorDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.doctorsService.create(createDto, user);
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("search") search?: string,
    @Query("departmentId") departmentId?: string,
    @Query("specialization") specialization?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("hospitalId") hospitalId?: string
  ) {
    return this.doctorsService.findAll(user, {
      search,
      departmentId,
      specialization,
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
    return this.doctorsService.findOne(id, user);
  }

  @Patch(":id")
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)
  async update(
    @Param("id") id: string,
    @Body() updateDto: UpdateDoctorDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.doctorsService.update(id, updateDto, user);
  }

  @Delete(":id")
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.doctorsService.remove(id, user);
  }

  @Get(":id/appointments")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.RECEPTIONIST,
    UserRole.NURSE
  )
  async getAppointments(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("status") status?: string,
    @Query("date") date?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.doctorsService.getAppointments(id, user, {
      status,
      date,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
