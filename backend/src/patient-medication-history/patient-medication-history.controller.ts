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
import { PatientMedicationHistoryService } from "./patient-medication-history.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import {
  CreatePatientMedicationHistoryDto,
  UpdatePatientMedicationHistoryDto,
} from "./dto/create-medication-history.dto";

@Controller("patient-medication-history")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class PatientMedicationHistoryController {
  constructor(
    @Inject(PatientMedicationHistoryService)
    private readonly medicationHistoryService: PatientMedicationHistoryService
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
    @Query("patientId") patientId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.medicationHistoryService.findAll(patientId, user);
  }

  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE
  )
  async create(
    @Body() dto: CreatePatientMedicationHistoryDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.medicationHistoryService.create(dto, user);
  }

  @Patch(":id")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE
  )
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientMedicationHistoryDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.medicationHistoryService.update(id, dto, user);
  }
}
