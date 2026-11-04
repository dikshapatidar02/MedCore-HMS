import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateInvoiceDto, VoidInvoiceDto } from "./dto/create-invoice.dto";
import { AddInvoiceItemDto } from "./dto/add-invoice-item.dto";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import {
  AuditAction,
  InvoiceItemType,
  InvoiceStatus,
  NotificationType,
  PaymentStatus,
  UserRole,
} from "@prisma/client";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService
  ) {}

  // 1. Create Draft Invoice
  async createInvoice(dto: CreateInvoiceDto, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.RECEPTIONIST &&
      user.role !== UserRole.ACCOUNTANT &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Only billing staff or administrators can create invoices.");
    }

    if (!user.hospitalId) {
      throw new BadRequestException("Billing staff must be assigned to an active hospital tenant.");
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, hospitalId: user.hospitalId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundException(`Patient '${dto.patientId}' not found.`);
    }

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: user.hospitalId },
    });

    // Validate tax and discount amounts
    if (dto.taxAmount !== undefined && dto.taxAmount < 0) {
      throw new BadRequestException("Tax amount cannot be negative.");
    }
    if (dto.discountAmount !== undefined && dto.discountAmount < 0) {
      throw new BadRequestException("Discount amount cannot be negative.");
    }

    // Generate unique invoice number with collision safety
    const count = await this.prisma.invoice.count({
      where: { hospitalId: user.hospitalId },
    });
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${hospital?.code || "HOSP"}-${year}-${(count + 1).toString().padStart(4, "0")}`;

    // Server-side calculation of line item totals and subtotal
    const itemsData = (dto.items || []).map((item) => {
      if (!item.quantity || item.quantity <= 0) {
        throw new BadRequestException("Item quantity must be a positive number.");
      }
      if (item.unitPrice === undefined || item.unitPrice < 0) {
        throw new BadRequestException("Item unit price cannot be negative.");
      }
      const lineTotal = Number((item.quantity * item.unitPrice).toFixed(2));
      return {
        hospitalId: user.hospitalId!,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: lineTotal,
        itemType: item.itemType || InvoiceItemType.CONSULTATION,
      };
    });

    const subtotal = Number(
      itemsData.reduce((acc, it) => acc + Number(it.totalPrice), 0).toFixed(2)
    );
    const taxAmount = Number((dto.taxAmount || 0).toFixed(2));
    const discountAmount = Number((dto.discountAmount || 0).toFixed(2));
    const totalAmount = Number(Math.max(0, subtotal + taxAmount - discountAmount).toFixed(2));
    const outstandingBalance = totalAmount;

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          hospitalId: user.hospitalId!,
          patientId: dto.patientId,
          appointmentId: dto.appointmentId,
          invoiceNumber,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          subtotal,
          taxAmount,
          discountAmount,
          totalAmount,
          paidAmount: 0.0,
          outstandingBalance,
          status: InvoiceStatus.DRAFT,
          notes: dto.notes,
          items: {
            create: itemsData,
          },
        },
        include: {
          items: true,
          patient: true,
          payments: true,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: user.hospitalId,
          userId: user.id,
          action: AuditAction.CREATE,
          entityName: "Invoice",
          entityId: invoice.id,
          details: { invoiceNumber, totalAmount, itemsCount: itemsData.length },
        },
      });

      return invoice;
    });
  }

  // 2. Consolidated Invoice creation from an Appointment Encounter
  async consolidateEncounter(appointmentId: string, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.RECEPTIONIST &&
      user.role !== UserRole.ACCOUNTANT &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Unauthorized to generate consolidated bills.");
    }

    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: true,
        medicalRecord: {
          include: {
            labOrders: {
              include: {
                results: { include: { labTest: true } },
              },
            },
            prescriptions: {
              include: {
                items: {
                  include: {
                    medicine: true,
                    dispensingRecords: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!appt || appt.hospitalId !== user.hospitalId) {
      throw new NotFoundException(`Appointment '${appointmentId}' not found.`);
    }

    const itemsToCreate: CreateInvoiceDto["items"] = [];

    // 1. Consultation fee
    if (appt.doctor.consultationFee && Number(appt.doctor.consultationFee) > 0) {
      itemsToCreate.push({
        description: `Consultation: Dr. ${appt.doctor.licenseNumber} (${appt.doctor.specialization})`,
        quantity: 1,
        unitPrice: Number(appt.doctor.consultationFee),
        itemType: InvoiceItemType.CONSULTATION,
      });
    }

    // 2. Lab tests rendered
    if (appt.medicalRecord?.labOrders) {
      for (const order of appt.medicalRecord.labOrders) {
        for (const res of order.results) {
          itemsToCreate.push({
            description: `Diagnostic Test: ${res.labTest.name} (${res.labTest.code})`,
            quantity: 1,
            unitPrice: Number(res.labTest.price),
            itemType: InvoiceItemType.LAB_TEST,
          });
        }
      }
    }

    // 3. Dispensed medications
    if (appt.medicalRecord?.prescriptions) {
      for (const rx of appt.medicalRecord.prescriptions) {
        for (const rxItem of rx.items) {
          if (rxItem.dispensingRecords && rxItem.dispensingRecords.length > 0) {
            for (const disp of rxItem.dispensingRecords) {
              itemsToCreate.push({
                description: `Pharmacy: ${rxItem.medicine.name} (${rxItem.medicine.strength})`,
                quantity: disp.quantity,
                unitPrice: Number(disp.unitPrice),
                itemType: InvoiceItemType.PHARMACY,
              });
            }
          }
        }
      }
    }

    return this.createInvoice(
      {
        patientId: appt.patientId,
        appointmentId: appt.id,
        items: itemsToCreate,
        notes: `Consolidated billing for visit on ${new Date(appt.appointmentDate).toISOString().split("T")[0]}`,
      },
      user
    );
  }

  // 3. Add Item to Draft Invoice
  async addItem(invoiceId: string, dto: AddInvoiceItemDto, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.RECEPTIONIST &&
      user.role !== UserRole.ACCOUNTANT &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Unauthorized to modify invoice items.");
    }

    if (!dto.quantity || dto.quantity <= 0) {
      throw new BadRequestException("Quantity must be a positive integer.");
    }
    if (dto.unitPrice === undefined || dto.unitPrice < 0) {
      throw new BadRequestException("Unit price cannot be negative.");
    }

    return this.prisma.$transaction(async (tx) => {
      // Concurrency protection: Lock invoice row
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;

      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
      });

      if (!invoice) {
        throw new NotFoundException(`Invoice '${invoiceId}' not found.`);
      }

      if (user.role !== UserRole.SUPER_ADMIN && invoice.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Cross-tenant access to invoices is strictly forbidden.");
      }

      // Finalized invoice immutability
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(
          `Cannot add items to an invoice in status '${invoice.status}'. Only DRAFT invoices can be modified.`
        );
      }

      const lineTotal = Number((dto.quantity * dto.unitPrice).toFixed(2));

      await tx.invoiceItem.create({
        data: {
          hospitalId: user.hospitalId || invoice.hospitalId,
          invoiceId,
          description: dto.description,
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
          totalPrice: lineTotal,
          itemType: dto.itemType,
        },
      });

      // Recalculate totals on server
      const allItems = await tx.invoiceItem.findMany({ where: { invoiceId } });
      const newSubtotal = Number(
        allItems.reduce((sum, it) => sum + Number(it.totalPrice), 0).toFixed(2)
      );
      const tax = Number(invoice.taxAmount);
      const discount = Number(invoice.discountAmount);
      const newTotal = Number(Math.max(0, newSubtotal + tax - discount).toFixed(2));
      const outstanding = Number((newTotal - Number(invoice.paidAmount)).toFixed(2));

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          subtotal: newSubtotal,
          totalAmount: newTotal,
          outstandingBalance: outstanding,
        },
        include: { items: true, patient: true, payments: true },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: invoice.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "Invoice",
          entityId: invoiceId,
          details: { action: "ADD_ITEM", description: dto.description, lineTotal, newTotal },
        },
      });

      return updated;
    });
  }

  // 4. Remove Item from Draft Invoice
  async removeItem(invoiceId: string, itemId: string, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.RECEPTIONIST &&
      user.role !== UserRole.ACCOUNTANT &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Unauthorized to modify invoice items.");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;

      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
      });

      if (!invoice) {
        throw new NotFoundException(`Invoice '${invoiceId}' not found.`);
      }

      if (user.role !== UserRole.SUPER_ADMIN && invoice.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Cross-tenant access to invoices is strictly forbidden.");
      }

      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(
          `Cannot remove items from an invoice in status '${invoice.status}'. Only DRAFT invoices can be modified.`
        );
      }

      const item = await tx.invoiceItem.findFirst({
        where: { id: itemId, invoiceId },
      });

      if (!item) {
        throw new NotFoundException(`Invoice item '${itemId}' not found on invoice '${invoiceId}'.`);
      }

      await tx.invoiceItem.delete({
        where: { id: itemId },
      });

      // Recalculate totals
      const remainingItems = await tx.invoiceItem.findMany({ where: { invoiceId } });
      const newSubtotal = Number(
        remainingItems.reduce((sum, it) => sum + Number(it.totalPrice), 0).toFixed(2)
      );
      const tax = Number(invoice.taxAmount);
      const discount = Number(invoice.discountAmount);
      const newTotal = Number(Math.max(0, newSubtotal + tax - discount).toFixed(2));
      const outstanding = Number((newTotal - Number(invoice.paidAmount)).toFixed(2));

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          subtotal: newSubtotal,
          totalAmount: newTotal,
          outstandingBalance: outstanding,
        },
        include: { items: true, patient: true, payments: true },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: invoice.hospitalId,
          userId: user.id,
          action: AuditAction.DELETE,
          entityName: "InvoiceItem",
          entityId: itemId,
          details: { action: "REMOVE_ITEM", description: item.description, newTotal },
        },
      });

      return updated;
    });
  }

  // 5. Finalize Invoice (Atomic & Concurrency-Protected)
  async finalizeInvoice(invoiceId: string, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.RECEPTIONIST &&
      user.role !== UserRole.ACCOUNTANT &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Only billing staff or accountants can finalize invoices.");
    }

    const finalized = await this.prisma.$transaction(async (tx) => {
      // Concurrency lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;

      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: true },
      });

      if (!invoice) {
        throw new NotFoundException(`Invoice '${invoiceId}' not found.`);
      }

      if (user.role !== UserRole.SUPER_ADMIN && invoice.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Cross-tenant access to invoices is strictly forbidden.");
      }

      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(
          `Invoice is already finalized in status '${invoice.status}'. Cannot finalize again.`
        );
      }

      if (!invoice.items || invoice.items.length === 0) {
        throw new BadRequestException("Cannot finalize an invoice with no line items.");
      }

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.ISSUED,
          finalizedAt: new Date(),
          finalizedById: user.id,
        },
        include: {
          items: true,
          patient: true,
          payments: true,
          finalizedBy: { select: { firstName: true, lastName: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: invoice.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "Invoice",
          entityId: invoiceId,
          details: { action: "FINALIZE", totalAmount: invoice.totalAmount, itemsCount: invoice.items.length },
        },
      });

      return updated;
    });

    if (finalized.patient?.userId && this.notificationsService) {
      await this.notificationsService.dispatch({
        userId: finalized.patient.userId,
        hospitalId: finalized.hospitalId,
        title: "Hospital Invoice Issued",
        message: `Invoice #${finalized.invoiceNumber} for amount ₹${finalized.totalAmount} has been generated.`,
        type: NotificationType.BILLING,
        channels: ["IN_APP", "EMAIL"],
        metadata: {
          invoiceId: finalized.id,
          invoiceNumber: finalized.invoiceNumber,
          totalAmount: Number(finalized.totalAmount),
          protectedRoute: "/billing",
        },
      }).catch((err) => this.logger.warn(`Failed to dispatch invoice notification: ${err.message}`));
    }

    return finalized;
  }

  // 6. Void / Cancel Invoice
  async voidInvoice(invoiceId: string, dto: VoidInvoiceDto, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.ACCOUNTANT &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Only accountants or hospital administrators can void invoices.");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;

      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { payments: true },
      });

      if (!invoice) {
        throw new NotFoundException(`Invoice '${invoiceId}' not found.`);
      }

      if (user.role !== UserRole.SUPER_ADMIN && invoice.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Cross-tenant access to invoices is strictly forbidden.");
      }

      if (invoice.status === InvoiceStatus.VOID) {
        throw new BadRequestException("Invoice is already void.");
      }

      const activePayments = invoice.payments.filter(
        (p) => p.status === PaymentStatus.COMPLETED || p.status === PaymentStatus.SUCCESS
      );
      if (activePayments.length > 0) {
        throw new BadRequestException(
          "Cannot void an invoice that has active settled payments. Please issue refunds before voiding."
        );
      }

      const voidNote = dto?.reason ? `[VOIDED: ${dto.reason}]` : "[VOIDED: Cancelled by staff]";
      const newNotes = invoice.notes ? `${invoice.notes} ${voidNote}` : voidNote;

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.VOID,
          notes: newNotes,
        },
        include: { items: true, patient: true, payments: true },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: invoice.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "Invoice",
          entityId: invoiceId,
          details: { action: "VOID", reason: dto?.reason },
        },
      });

      return updated;
    });
  }

  // 7. Query Invoices
  async findAllInvoices(
    user: AuthenticatedUser,
    filters?: { patientId?: string; status?: InvoiceStatus }
  ) {
    const where: any = {};

    if (user.role !== UserRole.SUPER_ADMIN) {
      where.hospitalId = user.hospitalId;
    }

    if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id },
      });
      if (!patient) {
        throw new NotFoundException("Patient profile not linked to user.");
      }
      where.patientId = patient.id;
    } else if (filters?.patientId) {
      where.patientId = filters.patientId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    return this.prisma.invoice.findMany({
      where,
      include: {
        items: true,
        patient: {
          select: { id: true, mrn: true, firstName: true, lastName: true, email: true },
        },
        payments: true,
      },
      orderBy: { issueDate: "desc" },
    });
  }

  // 8. Find Single Invoice
  async findOneInvoice(invoiceId: string, user: AuthenticatedUser) {
    const invoice = await this.getInvoiceOrThrow(invoiceId, user);

    if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id },
      });
      if (!patient || invoice.patientId !== patient.id) {
        throw new ForbiddenException("Patients can only access their own invoices.");
      }
    }

    return invoice;
  }

  private async getInvoiceOrThrow(invoiceId: string, user: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        payments: true,
        patient: true,
        finalizedBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found.`);
    }

    if (user.role !== UserRole.SUPER_ADMIN && invoice.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Cross-tenant access to invoices is strictly forbidden.");
    }

    return invoice;
  }
}
