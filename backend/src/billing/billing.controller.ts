import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { BillingService } from "./billing.service";
import {
  CreateInvoiceDto,
  ConsolidateEncounterDto,
  VoidInvoiceDto,
} from "./dto/create-invoice.dto";
import { AddInvoiceItemDto } from "./dto/add-invoice-item.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { InvoiceStatus, UserRole } from "@prisma/client";

@Controller("billing")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class BillingController {
  constructor(
    @Inject(BillingService)
    private readonly billingService: BillingService
  ) {}

  @Post("invoices")
  @Roles(UserRole.RECEPTIONIST, UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async createInvoice(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.billingService.createInvoice(dto, user);
  }

  @Post("invoices/consolidate/:appointmentId")
  @Roles(UserRole.RECEPTIONIST, UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async consolidateEncounter(
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.billingService.consolidateEncounter(appointmentId, user);
  }

  @Post("invoices/consolidate-encounter")
  @Roles(UserRole.RECEPTIONIST, UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async consolidateEncounterFromBody(
    @Body() dto: ConsolidateEncounterDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.billingService.consolidateEncounter(dto.appointmentId, user);
  }

  @Post("invoices/:id/items")
  @Roles(UserRole.RECEPTIONIST, UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async addItem(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddInvoiceItemDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.billingService.addItem(id, dto, user);
  }

  @Delete("invoices/:id/items/:itemId")
  @Roles(UserRole.RECEPTIONIST, UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async removeItem(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.billingService.removeItem(id, itemId, user);
  }

  @Post("invoices/:id/finalize")
  @Roles(UserRole.RECEPTIONIST, UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async finalizeInvoice(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.billingService.finalizeInvoice(id, user);
  }

  @Post("invoices/:id/void")
  @Roles(UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async voidInvoice(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: VoidInvoiceDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.billingService.voidInvoice(id, dto, user);
  }

  @Get("invoices")
  @Roles(
    UserRole.RECEPTIONIST,
    UserRole.ACCOUNTANT,
    UserRole.HOSPITAL_ADMIN,
    UserRole.PATIENT,
    UserRole.SUPER_ADMIN
  )
  async findAllInvoices(
    @CurrentUser() user: AuthenticatedUser,
    @Query("patientId") patientId?: string,
    @Query("status") status?: InvoiceStatus
  ) {
    return this.billingService.findAllInvoices(user, { patientId, status });
  }

  @Get("invoices/:id")
  @Roles(
    UserRole.RECEPTIONIST,
    UserRole.ACCOUNTANT,
    UserRole.HOSPITAL_ADMIN,
    UserRole.PATIENT,
    UserRole.SUPER_ADMIN
  )
  async findOneInvoice(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.billingService.findOneInvoice(id, user);
  }
}
