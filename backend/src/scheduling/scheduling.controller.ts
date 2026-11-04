import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { SchedulingService } from "./scheduling.service";
import { SetWeeklyAvailabilityDto } from "./dto/set-availability.dto";
import { CreateScheduleExceptionDto } from "./dto/create-exception.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

@Controller("scheduling")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class SchedulingController {
  constructor(
    @Inject(SchedulingService) private readonly schedulingService: SchedulingService
  ) {}

  @Put("doctors/:doctorId/availability")
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)
  async setAvailability(
    @Param("doctorId") doctorId: string,
    @Body() dto: SetWeeklyAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.schedulingService.setAvailability(doctorId, dto, user);
  }

  @Get("doctors/:doctorId/availability")
  async getAvailability(
    @Param("doctorId") doctorId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.schedulingService.getAvailability(doctorId, user);
  }

  @Post("doctors/:doctorId/exceptions")
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)
  async createException(
    @Param("doctorId") doctorId: string,
    @Body() dto: CreateScheduleExceptionDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.schedulingService.createException(doctorId, dto, user);
  }

  @Get("doctors/:doctorId/exceptions")
  async getExceptions(
    @Param("doctorId") doctorId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("fromDate") fromDate?: string
  ) {
    return this.schedulingService.getExceptions(doctorId, user, fromDate);
  }

  @Delete("doctors/:doctorId/exceptions/:exceptionId")
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)
  @HttpCode(HttpStatus.OK)
  async deleteException(
    @Param("doctorId") doctorId: string,
    @Param("exceptionId") exceptionId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.schedulingService.deleteException(doctorId, exceptionId, user);
  }

  @Get("doctors/:doctorId/slots")
  async getAvailableSlots(
    @Param("doctorId") doctorId: string,
    @Query("date") date: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    if (!date) {
      throw new BadRequestException("Query parameter 'date' is required in YYYY-MM-DD format.");
    }
    return this.schedulingService.getAvailableSlots(doctorId, date, user);
  }
}
