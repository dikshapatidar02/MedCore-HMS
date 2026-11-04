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
import { VitalSignsService } from "./vital-signs.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateVitalSignsDto } from "./dto/create-vital-signs.dto";

@Controller("vital-signs")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class VitalSignsController {
  constructor(
    @Inject(VitalSignsService)
    private readonly vitalSignsService: VitalSignsService
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
    @Query("patientId") patientId?: string,
    @Query("medicalRecordId") medicalRecordId?: string,
    @CurrentUser() user?: AuthenticatedUser
  ) {
    return this.vitalSignsService.findAll({ patientId, medicalRecordId }, user!);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.DOCTOR, UserRole.NURSE)
  async create(
    @Body() dto: CreateVitalSignsDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.vitalSignsService.create(dto, user);
  }
}
