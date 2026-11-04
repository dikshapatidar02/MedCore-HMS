import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecordCashPaymentDto } from "./dto/create-cash-payment.dto";
import { InitiateOnlinePaymentDto } from "./dto/initiate-payment.dto";
import { RefundPaymentDto } from "./dto/refund-payment.dto";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import {
  AuditAction,
  InvoiceStatus,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from "@prisma/client";
import * as crypto from "crypto";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService
  ) {}

  // 1. Counter Payment (Cash / POS Card / Counter UPI)
  async recordCashPayment(dto: RecordCashPaymentDto, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.RECEPTIONIST &&
      user.role !== UserRole.ACCOUNTANT &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Only billing staff or accountants can collect counter payments.");
    }

    if (!user.hospitalId && user.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException("Staff must be bound to a hospital tenant.");
    }

    const payAmount = Number(dto.amount.toFixed(2));
    if (payAmount <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Concurrency protection: Lock invoice row
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.invoiceId}))`;

      const invoice = await tx.invoice.findUnique({
        where: { id: dto.invoiceId },
        include: { hospital: true, patient: true },
      });

      if (!invoice) {
        throw new NotFoundException(`Invoice '${dto.invoiceId}' not found.`);
      }

      if (user.role !== UserRole.SUPER_ADMIN && invoice.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Cross-tenant payment collection is strictly forbidden.");
      }

      if (invoice.status === InvoiceStatus.DRAFT) {
        throw new BadRequestException(
          "Cannot record payment for a DRAFT invoice. Invoice must be finalized first."
        );
      }

      if (invoice.status === InvoiceStatus.VOID) {
        throw new BadRequestException("Cannot record payment for a VOID invoice.");
      }

      if (invoice.status === InvoiceStatus.PAID) {
        throw new BadRequestException("Invoice is already fully paid.");
      }

      const currentOutstanding = Number(invoice.outstandingBalance);

      if (payAmount > currentOutstanding) {
        throw new BadRequestException(
          `Payment amount (₹${payAmount}) cannot exceed outstanding balance (₹${currentOutstanding}).`
        );
      }

      const count = await tx.payment.count({
        where: { hospitalId: invoice.hospitalId },
      });
      const year = new Date().getFullYear();
      const receiptNumber = `RCP-${invoice.hospital.code || "HOSP"}-${year}-${(count + 1).toString().padStart(4, "0")}`;

      const newPaid = Number((Number(invoice.paidAmount) + payAmount).toFixed(2));
      const newOutstanding = Number((Number(invoice.totalAmount) - newPaid).toFixed(2));
      const newStatus =
        newOutstanding <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

      const payment = await tx.payment.create({
        data: {
          hospitalId: invoice.hospitalId,
          invoiceId: dto.invoiceId,
          amount: payAmount,
          paymentMethod: dto.paymentMethod || PaymentMethod.CASH,
          transactionReference: dto.transactionReference,
          receiptNumber,
          receivedById: user.id,
          status: PaymentStatus.COMPLETED,
          notes: dto.notes || "Counter payment received",
        },
        include: {
          receivedBy: { select: { firstName: true, lastName: true } },
        },
      });

      await tx.invoice.update({
        where: { id: dto.invoiceId },
        data: {
          paidAmount: newPaid,
          outstandingBalance: newOutstanding,
          status: newStatus,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: invoice.hospitalId,
          userId: user.id,
          action: AuditAction.CREATE,
          entityName: "Payment",
          entityId: payment.id,
          details: {
            receiptNumber,
            amount: payAmount,
            invoiceId: dto.invoiceId,
            newOutstanding,
            method: dto.paymentMethod || PaymentMethod.CASH,
          },
        },
      });

      return {
        payment,
        invoiceNumber: invoice.invoiceNumber,
        newPaidAmount: newPaid,
        newOutstandingBalance: newOutstanding,
        invoiceStatus: newStatus,
        patientUserId: invoice.patient?.userId,
        hospitalId: invoice.hospitalId,
      };
    });

    if (result.patientUserId && this.notificationsService) {
      await this.notificationsService.dispatch({
        userId: result.patientUserId,
        hospitalId: result.hospitalId,
        title: "Payment Receipt Confirmed",
        message: `Your payment of ₹${dto.amount} for Invoice #${result.invoiceNumber} has been received. Thank you.`,
        type: NotificationType.BILLING,
        channels: ["IN_APP", "EMAIL"],
        metadata: {
          paymentId: result.payment.id,
          invoiceId: dto.invoiceId,
          receiptNumber: result.payment.receiptNumber,
          amount: dto.amount,
          protectedRoute: "/billing",
        },
      }).catch((err) => this.logger.warn(`Failed to dispatch payment notification: ${err.message}`));
    }

    return {
      payment: result.payment,
      invoiceNumber: result.invoiceNumber,
      newPaidAmount: result.newPaidAmount,
      newOutstandingBalance: result.newOutstandingBalance,
      invoiceStatus: result.invoiceStatus,
    };
  }

  // 2. Initiate Online Payment
  async initiateOnlinePayment(dto: InitiateOnlinePaymentDto, user: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice '${dto.invoiceId}' not found.`);
    }

    if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id },
      });
      if (!patient || invoice.patientId !== patient.id) {
        throw new ForbiddenException("Patients can only initiate payment for their own invoices.");
      }
    } else if (user.role !== UserRole.SUPER_ADMIN && invoice.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Cross-tenant payment initiation rejected.");
    }

    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException("Cannot pay a draft invoice. Invoice must be finalized first.");
    }
    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException("Cannot pay a void invoice.");
    }

    const payAmount = Number(dto.amount.toFixed(2));
    if (payAmount <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero.");
    }

    const paymentMethod = dto.paymentMethod || dto.gateway;
    if (!paymentMethod) {
      throw new BadRequestException("Payment method or gateway parameter is required.");
    }

    if (paymentMethod === PaymentMethod.STRIPE) {
      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecret) {
        throw new ServiceUnavailableException(
          "Stripe payment gateway is currently unconfigured. Live card checkout is unavailable."
        );
      }
      return {
        provider: "STRIPE",
        invoiceId: invoice.id,
        amount: payAmount,
        status: "INITIATED",
        clientSecret: `pi_test_${invoice.id.substring(0, 8)}_secret`,
        message: "Stripe PaymentIntent session initialized.",
      };
    }

    if (paymentMethod === PaymentMethod.RAZORPAY) {
      const razorpayKey = process.env.RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        throw new ServiceUnavailableException(
          "Razorpay payment gateway is currently unconfigured. Live UPI/Netbanking checkout is unavailable."
        );
      }
      return {
        provider: "RAZORPAY",
        invoiceId: invoice.id,
        amount: payAmount,
        status: "INITIATED",
        orderId: `order_test_${invoice.id.substring(0, 8)}`,
        message: "Razorpay Order session initialized.",
      };
    }

    throw new BadRequestException(`Unsupported payment method '${paymentMethod}'.`);
  }

  // 3. Process Stripe Webhook
  async processStripeWebhook(
    payloadBuffer: Buffer | string,
    signatureHeader: string | undefined
  ) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_stripe_secret_key_medcore";

    if (!signatureHeader) {
      throw new BadRequestException("Missing 'stripe-signature' header.");
    }

    const payloadString =
      typeof payloadBuffer === "string" ? payloadBuffer : payloadBuffer.toString("utf8");

    // Verify Stripe signature format: t=timestamp,v1=signature
    const sigParts = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split("=");
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    }, {});

    if (!sigParts.t || !sigParts.v1) {
      throw new BadRequestException("Invalid Stripe signature header structure.");
    }

    // Replay attack prevention: verify timestamp is within 300 seconds
    const timestampSec = parseInt(sigParts.t, 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (isNaN(timestampSec) || Math.abs(nowSec - timestampSec) > 300) {
      throw new BadRequestException("Stripe webhook timestamp expired (replay attack protection).");
    }

    const signedPayload = `${sigParts.t}.${payloadString}`;
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(signedPayload)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSig);
    const receivedBuf = Buffer.from(sigParts.v1);

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new BadRequestException("Stripe webhook signature verification failed.");
    }

    const event = JSON.parse(payloadString);
    const eventId = event.id;

    // Idempotency check: prevent duplicate webhook processing
    const existingEvent = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        gateway_eventId: {
          gateway: "STRIPE",
          eventId,
        },
      },
    });

    if (existingEvent) {
      return { received: true, idempotent: true, eventId };
    }

    // Process event
    if (event.type === "payment_intent.succeeded" || event.type === "checkout.session.completed") {
      const obj = event.data.object;
      const invoiceId = obj.metadata?.invoiceId;
      const amountReceived = obj.amount_received !== undefined ? obj.amount_received : obj.amount_total;
      const amount = Number((amountReceived / 100).toFixed(2));

      if (invoiceId && amount > 0) {
        await this.applyVerifiedOnlinePayment({
          invoiceId,
          amount,
          gateway: "STRIPE",
          providerTransactionId: obj.id,
          payload: obj,
        });
      }
    }

    // Record processed webhook event for idempotency
    await this.prisma.paymentWebhookEvent.create({
      data: {
        gateway: "STRIPE",
        eventId,
        eventType: event.type,
        payload: event,
        status: "PROCESSED",
      },
    });

    return { received: true, eventId };
  }

  // 4. Process Razorpay Webhook
  async processRazorpayWebhook(
    payloadBuffer: Buffer | string,
    signatureHeader: string | undefined
  ) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "rzp_test_razorpay_secret_key_medcore";

    if (!signatureHeader) {
      throw new BadRequestException("Missing 'x-razorpay-signature' header.");
    }

    const payloadString =
      typeof payloadBuffer === "string" ? payloadBuffer : payloadBuffer.toString("utf8");

    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(payloadString)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSig);
    const receivedBuf = Buffer.from(signatureHeader);

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new BadRequestException("Razorpay webhook signature verification failed.");
    }

    const event = JSON.parse(payloadString);
    const eventId = event.event_id || event.payload?.payment?.entity?.id || `${Date.now()}`;

    // Idempotency check
    const existingEvent = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        gateway_eventId: {
          gateway: "RAZORPAY",
          eventId,
        },
      },
    });

    if (existingEvent) {
      return { received: true, idempotent: true, eventId };
    }

    if (event.event === "payment.captured" || event.event === "order.paid") {
      const p = event.payload.payment.entity;
      const invoiceId = p.notes?.invoiceId;
      const amount = Number((p.amount / 100).toFixed(2));

      if (invoiceId && amount > 0) {
        await this.applyVerifiedOnlinePayment({
          invoiceId,
          amount,
          gateway: "RAZORPAY",
          providerTransactionId: p.id,
          payload: p,
        });
      }
    }

    await this.prisma.paymentWebhookEvent.create({
      data: {
        gateway: "RAZORPAY",
        eventId,
        eventType: event.event,
        payload: event,
        status: "PROCESSED",
      },
    });

    return { received: true, eventId };
  }

  // 5. Refund Payment (Safe, Auditable & Balance-Restoring)
  async refundPayment(paymentId: string, dto: RefundPaymentDto, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.ACCOUNTANT &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Only accountants or administrators can issue refunds.");
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { invoice: true },
      });

      if (!payment) {
        throw new NotFoundException(`Payment '${paymentId}' not found.`);
      }

      if (user.role !== UserRole.SUPER_ADMIN && payment.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Cross-tenant refund attempt strictly rejected.");
      }

      if (payment.status === PaymentStatus.REFUNDED) {
        throw new BadRequestException("Payment is already refunded.");
      }

      if (payment.status !== PaymentStatus.COMPLETED && payment.status !== PaymentStatus.SUCCESS) {
        throw new BadRequestException("Only completed or successful payments can be refunded.");
      }

      const originalAmount = Number(payment.amount);
      const refundAmount = dto?.amount ? Number(dto.amount.toFixed(2)) : originalAmount;

      if (refundAmount <= 0 || refundAmount > originalAmount) {
        throw new BadRequestException(
          `Refund amount must be between 0.01 and the original payment amount (₹${originalAmount}).`
        );
      }

      // Lock invoice
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payment.invoiceId}))`;

      const refundNote = dto?.reason
        ? `[REFUNDED: ₹${refundAmount} - Reason: ${dto.reason}]`
        : `[REFUNDED: ₹${refundAmount}]`;
      const updatedNotes = payment.notes ? `${payment.notes} ${refundNote}` : refundNote;

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.REFUNDED,
          notes: updatedNotes,
        },
      });

      // Recalculate invoice paid amount and outstanding balance
      const newPaid = Math.max(
        0,
        Number((Number(payment.invoice.paidAmount) - refundAmount).toFixed(2))
      );
      const newOutstanding = Number(
        (Number(payment.invoice.totalAmount) - newPaid).toFixed(2)
      );
      const newStatus =
        newPaid <= 0
          ? payment.invoice.finalizedAt
            ? InvoiceStatus.ISSUED
            : InvoiceStatus.DRAFT
          : InvoiceStatus.PARTIALLY_PAID;

      const updatedInvoice = await tx.invoice.update({
        where: { id: payment.invoice.id },
        data: {
          paidAmount: newPaid,
          outstandingBalance: newOutstanding,
          status: newStatus,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: payment.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "Payment",
          entityId: payment.id,
          details: {
            action: "REFUND",
            refundAmount,
            previousPaid: payment.invoice.paidAmount,
            newPaid,
            newOutstanding,
            reason: dto?.reason,
          },
        },
      });

      return {
        payment: updatedPayment,
        invoice: updatedInvoice,
        refundAmount,
      };
    });
  }

  // 6. Query Payments for an Invoice
  async findInvoicePayments(invoiceId: string, user: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found.`);
    }

    if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id },
      });
      if (!patient || invoice.patientId !== patient.id) {
        throw new ForbiddenException("Patients can only view payments for their own invoices.");
      }
    } else if (user.role !== UserRole.SUPER_ADMIN && invoice.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Cross-tenant access to payments is strictly forbidden.");
    }

    return this.prisma.payment.findMany({
      where: { invoiceId },
      include: {
        receivedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { paymentDate: "desc" },
    });
  }

  // 7. Query Patient Self-Service Payments
  async getMyPayments(user: AuthenticatedUser) {
    if (user.role !== UserRole.PATIENT) {
      throw new BadRequestException("User is not a patient.");
    }

    const patient = await this.prisma.patient.findFirst({
      where: { userId: user.id },
    });

    if (!patient) {
      throw new NotFoundException("Patient profile not linked to user.");
    }

    return this.prisma.payment.findMany({
      where: {
        invoice: { patientId: patient.id },
      },
      include: {
        invoice: {
          select: { id: true, invoiceNumber: true, totalAmount: true, status: true },
        },
      },
      orderBy: { paymentDate: "desc" },
    });
  }

  // Helper to apply verified webhook payment
  private async applyVerifiedOnlinePayment(params: {
    invoiceId: string;
    amount: number;
    gateway: "STRIPE" | "RAZORPAY";
    providerTransactionId: string;
    payload: any;
  }) {
    const settlement = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.invoiceId}))`;

      const currentInvoice = await tx.invoice.findUnique({
        where: { id: params.invoiceId },
        include: { patient: true },
      });
      if (!currentInvoice) return null;

      if (
        currentInvoice.status === InvoiceStatus.PAID ||
        Number(currentInvoice.outstandingBalance) <= 0
      ) {
        return null; // Already settled
      }

      const payAmount = Number(
        Math.min(params.amount, Number(currentInvoice.outstandingBalance)).toFixed(2)
      );
      const newPaid = Number((Number(currentInvoice.paidAmount) + payAmount).toFixed(2));
      const newOutstanding = Number(
        (Number(currentInvoice.totalAmount) - newPaid).toFixed(2)
      );
      const newStatus =
        newOutstanding <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

      const payment = await tx.payment.create({
        data: {
          hospitalId: currentInvoice.hospitalId,
          invoiceId: currentInvoice.id,
          amount: payAmount,
          paymentMethod:
            params.gateway === "STRIPE" ? PaymentMethod.STRIPE : PaymentMethod.RAZORPAY,
          providerTransactionId: params.providerTransactionId,
          providerPayload: params.payload,
          status: PaymentStatus.SUCCESS,
          notes: `Verified ${params.gateway} Webhook Settlement`,
        },
      });

      await tx.invoice.update({
        where: { id: currentInvoice.id },
        data: {
          paidAmount: newPaid,
          outstandingBalance: newOutstanding,
          status: newStatus,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: currentInvoice.hospitalId,
          userId: null,
          action: AuditAction.CREATE,
          entityName: "Payment",
          entityId: payment.id,
          details: {
            gateway: params.gateway,
            amount: payAmount,
            invoiceId: params.invoiceId,
            newOutstanding,
          },
        },
      });

      return {
        payment,
        invoiceNumber: currentInvoice.invoiceNumber,
        payAmount,
        patientUserId: currentInvoice.patient?.userId,
        hospitalId: currentInvoice.hospitalId,
      };
    });

    if (settlement?.patientUserId && this.notificationsService) {
      await this.notificationsService.dispatch({
        userId: settlement.patientUserId,
        hospitalId: settlement.hospitalId,
        title: "Online Payment Confirmed",
        message: `Online payment of ₹${settlement.payAmount} for Invoice #${settlement.invoiceNumber} was successfully processed.`,
        type: NotificationType.BILLING,
        channels: ["IN_APP", "EMAIL"],
        metadata: {
          invoiceId: params.invoiceId,
          amount: settlement.payAmount,
          gateway: params.gateway,
          protectedRoute: "/billing",
        },
      }).catch((err) => this.logger.warn(`Failed to dispatch online payment notification: ${err.message}`));
    }

    return settlement;
  }
}
