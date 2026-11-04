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
import { PatientAllergiesService } from "./patient-allergies.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreatePatientAllergyDto, UpdatePatientAllergyDto } from "./dto/create-allergy.dto";

@Controller("patient-allergies")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class PatientAllergiesController {
  constructor(
    @Inject(PatientAllergiesService)
    private readonly patientAllergiesService: PatientAllergiesService
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
    return this.patientAllergiesService.findAll(patientId, user);
  }

  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE
  )
  async create(
    @Body() dto: CreatePatientAllergyDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.patientAllergiesService.create(dto, user);
  }

  @Patch(":id")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE
  )
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientAllergyDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.patientAllergiesService.update(id, dto, user);
  }
}
