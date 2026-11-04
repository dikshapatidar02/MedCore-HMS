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
import { PatientsService } from "./patients.service";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

@Controller("patients")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class PatientsController {
  constructor(
    @Inject(PatientsService) private readonly patientsService: PatientsService
  ) {}

  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.RECEPTIONIST,
    UserRole.NURSE
  )
  async create(
    @Body() createDto: CreatePatientDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.patientsService.create(createDto, user);
  }

  @Get("me")
  @Roles(UserRole.PATIENT)
  async findMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.findMyProfile(user);
  }

  @Get("me/prescriptions")
  @Roles(UserRole.PATIENT)
  async getMyPrescriptions(@CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.getMyPrescriptions(user);
  }

  @Get("me/lab-orders")
  @Roles(UserRole.PATIENT)
  async getMyLabReports(@CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.getMyLabReports(user);
  }

  @Get("me/invoices")
  @Roles(UserRole.PATIENT)
  async getMyInvoices(@CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.getMyInvoices(user);
  }

  @Get("me/payments")
  @Roles(UserRole.PATIENT)
  async getMyPayments(@CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.getMyPayments(user);
  }

  @Get("me/notifications")
  @Roles(UserRole.PATIENT)
  async getMyNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.getMyNotifications(user);
  }


  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST
  )
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("hospitalId") hospitalId?: string
  ) {
    return this.patientsService.findAll(user, {
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
    return this.patientsService.findOne(id, user);
  }

  @Patch(":id")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.RECEPTIONIST,
    UserRole.NURSE,
    UserRole.PATIENT
  )
  async update(
    @Param("id") id: string,
    @Body() updateDto: UpdatePatientDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.patientsService.update(id, updateDto, user);
  }

  @Delete(":id")
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.patientsService.remove(id, user);
  }

  @Get(":id/appointments")
  async getAppointments(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.patientsService.getAppointments(id, user, {
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(":id/clinical-overview")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.PATIENT
  )
  async getClinicalOverview(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.patientsService.getClinicalOverview(id, user);
  }
}

