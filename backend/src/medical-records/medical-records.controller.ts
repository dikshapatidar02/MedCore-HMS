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
  Inject,
  ParseUUIDPipe,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { MedicalRecordsService } from "./medical-records.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateMedicalRecordDto } from "./dto/create-medical-record.dto";
import { UpdateMedicalRecordDto } from "./dto/update-medical-record.dto";
import { AmendMedicalRecordDto } from "./dto/amend-medical-record.dto";
import { QueryMedicalRecordsDto } from "./dto/query-medical-records.dto";

@Controller("medical-records")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class MedicalRecordsController {
  constructor(
    @Inject(MedicalRecordsService)
    private readonly medicalRecordsService: MedicalRecordsService
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
    @Query() query: QueryMedicalRecordsDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.medicalRecordsService.findAll(query, user);
  }

  @Get(":id")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.PATIENT
  )
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.medicalRecordsService.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.DOCTOR)
  async create(
    @Body() dto: CreateMedicalRecordDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.medicalRecordsService.create(dto, user);
  }

  @Patch(":id")
  @Roles(UserRole.SUPER_ADMIN, UserRole.DOCTOR)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateMedicalRecordDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.medicalRecordsService.update(id, dto, user);
  }

  @Post(":id/sign")
  @Roles(UserRole.SUPER_ADMIN, UserRole.DOCTOR)
  async signAndFinalize(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.medicalRecordsService.signAndFinalize(id, user);
  }

  @Post(":id/amend")
  @Roles(UserRole.SUPER_ADMIN, UserRole.DOCTOR)
  async amend(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AmendMedicalRecordDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.medicalRecordsService.amend(id, dto, user);
  }

  @Delete(":id")
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)
  async delete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.medicalRecordsService.delete(id, user);
  }
}
