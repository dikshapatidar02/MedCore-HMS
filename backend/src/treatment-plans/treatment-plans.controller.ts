import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  ParseUUIDPipe,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { TreatmentPlansService } from "./treatment-plans.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateTreatmentPlanDto, UpdateTreatmentPlanDto } from "./dto/create-treatment-plan.dto";

@Controller("treatment-plans")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class TreatmentPlansController {
  constructor(
    @Inject(TreatmentPlansService)
    private readonly treatmentPlansService: TreatmentPlansService
  ) {}

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.PATIENT
  )
  async findAll(
    @Query("medicalRecordId") medicalRecordId?: string,
    @Query("patientId") patientId?: string,
    @CurrentUser() user?: AuthenticatedUser
  ) {
    return this.treatmentPlansService.findAll({ medicalRecordId, patientId }, user!);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.DOCTOR)
  async create(
    @Body() dto: CreateTreatmentPlanDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.treatmentPlansService.create(dto, user);
  }

  @Patch(":id")
  @Roles(UserRole.SUPER_ADMIN, UserRole.DOCTOR)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTreatmentPlanDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.treatmentPlansService.update(id, dto, user);
  }
}
