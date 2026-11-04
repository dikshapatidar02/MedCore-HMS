import {
  Controller,
  Get,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { DashboardService } from "./dashboard.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class DashboardController {
  constructor(
    @Inject(DashboardService)
    private readonly dashboardService: DashboardService
  ) {}

  /**
   * Unified endpoint: returns the caller's role-specific dashboard metrics.
   * Scoped to the authenticated user's role and tenant context.
   */
  @Get("stats")
  async getMyStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getDashboardStats(user);
  }

  @Get("super-admin")
  @Roles(UserRole.SUPER_ADMIN)
  async getSuperAdminStats() {
    return this.dashboardService.getSuperAdminStats();
  }

  @Get("hospital-admin")
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async getHospitalAdminStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getHospitalAdminStats(user);
  }

  @Get("doctor")
  @Roles(UserRole.DOCTOR, UserRole.SUPER_ADMIN)
  async getDoctorStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getDoctorStats(user);
  }

  @Get("nurse")
  @Roles(UserRole.NURSE, UserRole.SUPER_ADMIN)
  async getNurseStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getNurseStats(user);
  }

  @Get("receptionist")
  @Roles(UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  async getReceptionistStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getReceptionistStats(user);
  }

  @Get("lab-technician")
  @Roles(UserRole.LAB_TECHNICIAN, UserRole.SUPER_ADMIN)
  async getLabTechnicianStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getLabTechnicianStats(user);
  }

  @Get("pharmacist")
  @Roles(UserRole.PHARMACIST, UserRole.SUPER_ADMIN)
  async getPharmacistStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getPharmacistStats(user);
  }

  @Get("accountant")
  @Roles(UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN)
  async getAccountantStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getAccountantStats(user);
  }

  @Get("patient")
  @Roles(UserRole.PATIENT)
  async getPatientStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getPatientStats(user);
  }
}
