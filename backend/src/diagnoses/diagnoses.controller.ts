import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { DiagnosesService } from "./diagnoses.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateDiagnosisDto } from "./dto/create-diagnosis.dto";

@Controller("diagnoses")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class DiagnosesController {
  constructor(
    @Inject(DiagnosesService)
    private readonly diagnosesService: DiagnosesService
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
    return this.diagnosesService.findAll({ medicalRecordId, patientId }, user!);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.DOCTOR)
  async create(
    @Body() dto: CreateDiagnosisDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.diagnosesService.create(dto, user);
  }
}
