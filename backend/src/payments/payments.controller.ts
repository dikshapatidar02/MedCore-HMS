import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { PaymentsService } from "./payments.service";
import { RecordCashPaymentDto } from "./dto/create-cash-payment.dto";
import { InitiateOnlinePaymentDto } from "./dto/initiate-payment.dto";
import { RefundPaymentDto } from "./dto/refund-payment.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { UserRole } from "@prisma/client";

@Controller("payments")
export class PaymentsController {
  constructor(
    @Inject(PaymentsService)
    private readonly paymentsService: PaymentsService
  ) {}

  @Post("cash")
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    UserRole.RECEPTIONIST,
    UserRole.ACCOUNTANT,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN
  )
  async recordCashPayment(
    @Body() dto: RecordCashPaymentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.paymentsService.recordCashPayment(dto, user);
  }

  @Post("initiate")
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    UserRole.PATIENT,
    UserRole.RECEPTIONIST,
    UserRole.ACCOUNTANT,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN
  )
  async initiateOnlinePayment(
    @Body() dto: InitiateOnlinePaymentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.paymentsService.initiateOnlinePayment(dto, user);
  }

  @Post(":id/refund")
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async refundPayment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RefundPaymentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.paymentsService.refundPayment(id, dto, user);
  }

  @Get("invoice/:invoiceId")
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    UserRole.RECEPTIONIST,
    UserRole.ACCOUNTANT,
    UserRole.HOSPITAL_ADMIN,
    UserRole.PATIENT,
    UserRole.SUPER_ADMIN
  )
  async findInvoicePayments(
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.paymentsService.findInvoicePayments(invoiceId, user);
  }

  @Get("my")
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.PATIENT)
  async getMyPayments(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.getMyPayments(user);
  }

  @Public()
  @Post("webhooks/stripe")
  async handleStripeWebhook(
    @Req() req: Request,
    @Headers("stripe-signature") signature?: string
  ) {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    return this.paymentsService.processStripeWebhook(rawBody, signature);
  }

  @Public()
  @Post("webhooks/razorpay")
  async handleRazorpayWebhook(
    @Req() req: Request,
    @Headers("x-razorpay-signature") signature?: string
  ) {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    return this.paymentsService.processRazorpayWebhook(rawBody, signature);
  }
}
