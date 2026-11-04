import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { PrescriptionsService } from "./prescriptions.service";
import { CreatePrescriptionDto } from "./dto/create-prescription.dto";
import { CancelPrescriptionDto } from "./dto/cancel-prescription.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { PrescriptionStatus, UserRole } from "@prisma/client";

@Controller("prescriptions")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class PrescriptionsController {
  constructor(
    @Inject(PrescriptionsService)
    private readonly prescriptionsService: PrescriptionsService
  ) {}

  @Post()
  @Roles(UserRole.DOCTOR)
  async create(
    @Body() createDto: CreatePrescriptionDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.prescriptionsService.create(createDto, user);
  }

  @Get()
  @Roles(
    UserRole.DOCTOR,
    UserRole.HOSPITAL_ADMIN,
    UserRole.NURSE,
    UserRole.PHARMACIST,
    UserRole.PATIENT,
    UserRole.SUPER_ADMIN
  )
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("patientId") patientId?: string,
    @Query("doctorId") doctorId?: string,
    @Query("status") status?: PrescriptionStatus
  ) {
    return this.prescriptionsService.findAll({ patientId, doctorId, status }, user);
  }

  @Get(":id")
  @Roles(
    UserRole.DOCTOR,
    UserRole.HOSPITAL_ADMIN,
    UserRole.NURSE,
    UserRole.PHARMACIST,
    UserRole.PATIENT,
    UserRole.SUPER_ADMIN
  )
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.prescriptionsService.findOne(id, user);
  }

  @Get(":id/pdf")
  @Roles(
    UserRole.DOCTOR,
    UserRole.HOSPITAL_ADMIN,
    UserRole.NURSE,
    UserRole.PHARMACIST,
    UserRole.PATIENT,
    UserRole.SUPER_ADMIN
  )
  async getPdf(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response
  ) {
    const pdfBuffer = await this.prescriptionsService.generatePdf(id, user);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="prescription-${id}.pdf"`);
    res.send(pdfBuffer);
  }

  @Patch(":id/cancel")
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() cancelDto: CancelPrescriptionDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.prescriptionsService.cancel(id, cancelDto, user);
  }
}
