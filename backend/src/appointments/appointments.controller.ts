import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { AppointmentStatus } from "@prisma/client";
import { AppointmentsService } from "./appointments.service";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto";
import { UpdateAppointmentStatusDto } from "./dto/update-status.dto";
import { CancelAppointmentDto } from "./dto/cancel-appointment.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

@Controller("appointments")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class AppointmentsController {
  constructor(
    @Inject(AppointmentsService) private readonly appointmentsService: AppointmentsService
  ) {}

  @Post()
  async create(
    @Body() createDto: CreateAppointmentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.appointmentsService.create(createDto, user);
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("search") search?: string,
    @Query("doctorId") doctorId?: string,
    @Query("patientId") patientId?: string,
    @Query("departmentId") departmentId?: string,
    @Query("status") status?: AppointmentStatus,
    @Query("date") date?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("hospitalId") hospitalId?: string
  ) {
    return this.appointmentsService.findAll(user, {
      search,
      doctorId,
      patientId,
      departmentId,
      status,
      date,
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
    return this.appointmentsService.findOne(id, user);
  }

  @Patch(":id/reschedule")
  async reschedule(
    @Param("id") id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.appointmentsService.reschedule(id, dto, user);
  }

  @Patch(":id/status")
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateAppointmentStatusDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.appointmentsService.updateStatus(id, dto, user);
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param("id") id: string,
    @Body() dto: CancelAppointmentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.appointmentsService.cancel(id, dto, user);
  }
}
