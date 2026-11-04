import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { HospitalsService } from "./hospitals.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

@Controller("hospitals")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class HospitalsController {
  constructor(
    @Inject(HospitalsService) private readonly hospitalsService: HospitalsService
  ) {}

  @Get("my-hospital")
  async getMyHospital(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.hospitalsService.getMyHospital(user);
    return {
      success: true,
      data,
      message: "Hospital retrieved successfully",
    };
  }

  @Patch("my-hospital")
  @Roles(UserRole.HOSPITAL_ADMIN)
  async updateMyHospital(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: any
  ) {
    const data = await this.hospitalsService.updateMyHospital(user, body);
    return {
      success: true,
      data,
      message: "Hospital profile updated successfully",
    };
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  async findAllHospitals(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("status") status?: string
  ) {
    const data = await this.hospitalsService.findAllHospitals(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
      status
    );
    return {
      success: true,
      data,
      message: "Hospitals retrieved successfully (Super Admin)",
    };
  }

  @Get("detail/:id")
  @Roles(UserRole.SUPER_ADMIN)
  async findHospitalById(@Param("id") id: string) {
    const data = await this.hospitalsService.findHospitalById(id);
    return {
      success: true,
      data,
      message: "Hospital details retrieved successfully",
    };
  }

  @Patch("detail/:id")
  @Roles(UserRole.SUPER_ADMIN)
  async updateHospitalById(
    @Param("id") id: string,
    @Body() body: any
  ) {
    const data = await this.hospitalsService.updateHospitalById(id, body);
    return {
      success: true,
      data,
      message: "Hospital updated successfully (Super Admin)",
    };
  }

  @Get("platform/overview")
  @Roles(UserRole.SUPER_ADMIN)
  async getPlatformOverview() {
    const data = await this.hospitalsService.getPlatformOverview();
    return {
      success: true,
      data,
      message: "Platform overview retrieved successfully (Super Admin)",
    };
  }

  @Get(":hospitalId/departments")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST
  )
  async getDepartments(
    @Param("hospitalId") hospitalId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const data = await this.hospitalsService.getDepartments(hospitalId, user);
    return {
      success: true,
      data,
      message: "Hospital departments retrieved successfully",
    };
  }

  @Get(":hospitalId/patients")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
    UserRole.ACCOUNTANT
  )
  async getPatients(
    @Param("hospitalId") hospitalId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const data = await this.hospitalsService.getPatients(hospitalId, user);
    return {
      success: true,
      data,
      message: "Hospital patients retrieved successfully",
    };
  }

  @Get("patients/:patientId/clinical-records")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.PATIENT
  )
  async getPatientClinicalRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Param("patientId") patientId: string
  ) {
    const data = await this.hospitalsService.getPatientClinicalRecords(user, patientId);
    return {
      success: true,
      data,
      message: "Patient clinical records retrieved successfully",
    };
  }

  @Patch("patients/:patientId")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.RECEPTIONIST,
    UserRole.PATIENT
  )
  async updatePatient(
    @CurrentUser() user: AuthenticatedUser,
    @Param("patientId") patientId: string,
    @Body() body: { phone?: string }
  ) {
    const data = await this.hospitalsService.updatePatientProfile(user, patientId, body);
    return {
      success: true,
      data,
      message: "Patient updated successfully",
    };
  }

  @Get("appointments/:appointmentId")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
    UserRole.PATIENT
  )
  async getAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string
  ) {
    const data = await this.hospitalsService.getAppointment(user, appointmentId);
    return {
      success: true,
      data,
      message: "Appointment retrieved successfully",
    };
  }

  @Get("invoices/:invoiceId")
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.PATIENT
  )
  async getInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param("invoiceId") invoiceId: string
  ) {
    const data = await this.hospitalsService.getInvoice(user, invoiceId);
    return {
      success: true,
      data,
      message: "Invoice retrieved successfully",
    };
  }
}
