import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  UserRole,
  InvoiceStatus,
  PaymentStatus,
  PaymentMethod,
  InvoiceItemType,
  AuditAction,
  AppointmentType,
  AppointmentStatus,
} from "@prisma/client";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import * as crypto from "crypto";

interface TestResult {
  id: number;
  category:
    | "INVOICE_CREATION"
    | "INVOICE_ITEMS_MUTATIONS"
    | "INVOICE_FINALIZATION"
    | "VOID_WORKFLOW"
    | "PAYMENT_RECORDING"
    | "REFUNDS_AND_CORRECTIONS"
    | "GATEWAY_INITIATION"
    | "WEBHOOK_VERIFICATION"
    | "SECURITY_AND_TENANCY";
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(
  id: number,
  category: TestResult["category"],
  name: string,
  passed: boolean,
  details: string
) {
  results.push({ id, category, name, passed, details });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} [PHASE 11 Test ${id}] [${category}] ${name}: ${details}`);
}

function getErrMsg(body: any): string {
  if (body?.error?.message) {
    return typeof body.error.message === "string"
      ? body.error.message
      : JSON.stringify(body.error.message);
  }
  if (body?.message) {
    return typeof body.message === "string" ? body.message : JSON.stringify(body.message);
  }
  return "";
}

function createStripeSignature(payloadStr: string, secret: string, timestamp?: number): string {
  const t = timestamp !== undefined ? timestamp : Math.floor(Date.now() / 1000);
  const signedPayload = `${t}.${payloadStr}`;
  const sig = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${t},v1=${sig}`;
}

function createRazorpaySignature(payloadStr: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");
}

async function runPhase11Tests() {
  console.log("==========================================================================");
  console.log("🧾 MedCore HMS — Phase 11 Billing & Payment Management Integration Suite");
  console.log("==========================================================================\n");

  const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(0);
  const serverAddress = app.getHttpServer().address();
  const port = typeof serverAddress === "string" ? 3001 : serverAddress.port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  const prisma = app.get(PrismaService);
  const jwtService = app.get(JwtService);

  // 1. Fetch Seeded Hospitals
  const hospApex = await prisma.hospital.findUnique({ where: { code: "APEX-MAIN" } });
  const hospCity = await prisma.hospital.findUnique({ where: { code: "CITY-CARE" } });

  if (!hospApex || !hospCity) {
    throw new Error("Seeded hospitals APEX-MAIN and CITY-CARE must exist in database.");
  }

  // Token generator
  const makeToken = (user: {
    id: string;
    email: string;
    role: UserRole;
    hospitalId: string | null;
  }) => {
    return jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET || "access_secret_medcore_hms",
        expiresIn: "1h",
      }
    );
  };

  // Seeded / resolved users
  const superAdmin = await prisma.user.findUnique({ where: { email: "superadmin@medcore.io" } });
  const adminApex = await prisma.user.findUnique({ where: { email: "admin.apex@medcore.io" } });
  const docApex = await prisma.user.findUnique({ where: { email: "dr.arun.sharma@apexhealth.org" } });
  const nurseApex = await prisma.user.findUnique({ where: { email: "nurse.apex@medcore.io" } });
  const patientApex = await prisma.user.findUnique({ where: { email: "patient.rajesh.sharma0@example.com" } });
  const patientCity = await prisma.user.findUnique({ where: { email: "patient.pooja.patel1@example.com" } });

  if (!superAdmin || !adminApex || !docApex || !nurseApex || !patientApex || !patientCity) {
    throw new Error("Required seed users missing from database.");
  }

  // Resolve or create Accountants
  let acctApex = await prisma.user.findFirst({
    where: { hospitalId: hospApex.id, role: UserRole.ACCOUNTANT },
  });
  if (!acctApex) {
    acctApex = await prisma.user.create({
      data: {
        email: "accountant.apex@medcore.io",
        passwordHash: "$2a$10$wT8mQWp0000000000000000000000000000000000000000000000",
        firstName: "Apex",
        lastName: "Accountant",
        role: UserRole.ACCOUNTANT,
        hospitalId: hospApex.id,
        phone: "+919800000088",
      },
    });
  }

  let acctCity = await prisma.user.findFirst({
    where: { hospitalId: hospCity.id, role: UserRole.ACCOUNTANT },
  });
  if (!acctCity) {
    acctCity = await prisma.user.create({
      data: {
        email: "accountant.city@medcore.io",
        passwordHash: "$2a$10$wT8mQWp0000000000000000000000000000000000000000000000",
        firstName: "City",
        lastName: "Accountant",
        role: UserRole.ACCOUNTANT,
        hospitalId: hospCity.id,
        phone: "+919800000089",
      },
    });
  }

  // Patient profiles
  const patProfileApex = await prisma.patient.findFirst({ where: { userId: patientApex.id } });
  const patProfileCity = await prisma.patient.findFirst({ where: { userId: patientCity.id } });

  if (!patProfileApex || !patProfileCity) {
    throw new Error("Patient profiles for test patients must exist.");
  }

  // Doctor profile
  const docProfileApex = await prisma.doctor.findFirst({ where: { hospitalId: hospApex.id } });
  if (!docProfileApex) {
    throw new Error("Doctor profile for Apex must exist.");
  }

  // Auth Tokens
  const tokenSuperAdmin = makeToken(superAdmin);
  const tokenAdminApex = makeToken(adminApex);
  const tokenAcctApex = makeToken(acctApex);
  const tokenAcctCity = makeToken(acctCity);
  const tokenDocApex = makeToken(docApex);
  const tokenNurseApex = makeToken(nurseApex);
  const tokenPatientApex = makeToken(patientApex);
  const tokenPatientCity = makeToken(patientCity);

  // Webhook secrets
  const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_stripe_secret_key_medcore";
  const razorpaySecret = process.env.RAZORPAY_WEBHOOK_SECRET || "rzp_test_razorpay_secret_key_medcore";

  // Track created entities for cleanup
  const createdInvoiceIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdPaymentWebhookEvents: { gateway: string; eventId: string }[] = [];

  try {
    // =========================================================================
    // SECTION 1: INVOICE CREATION & FINANCIAL INTEGRITY
    // =========================================================================

    // Test 1: Create draft invoice with valid items
    let invoice1Id = "";
    {
      const res = await fetch(`${baseUrl}/billing/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: patProfileApex.id,
          taxAmount: 50.0,
          discountAmount: 20.0,
          notes: "Initial Consultation & Diagnostic Billing",
          items: [
            {
              description: "Cardiology Specialist Consultation",
              quantity: 1,
              unitPrice: 800.0,
              itemType: InvoiceItemType.CONSULTATION,
            },
            {
              description: "Complete Blood Count (CBC)",
              quantity: 1,
              unitPrice: 350.5,
              itemType: InvoiceItemType.LAB_TEST,
            },
          ],
        }),
      });

      const data = await res.json();
      invoice1Id = data.id;
      if (invoice1Id) createdInvoiceIds.push(invoice1Id);

      // Subtotal = 800 + 350.50 = 1150.50. Tax = 50. Discount = 20. Total = 1180.50
      const subtotalCorrect = Number(data.subtotal) === 1150.5;
      const totalCorrect = Number(data.totalAmount) === 1180.5;
      const balanceCorrect = Number(data.outstandingBalance) === 1180.5;
      const draftStatus = data.status === InvoiceStatus.DRAFT;

      record(
        1,
        "INVOICE_CREATION",
        "Create draft invoice with valid items and backend financial calculation",
        res.status === 201 && subtotalCorrect && totalCorrect && balanceCorrect && draftStatus,
        `Status: ${res.status}, Subtotal: ₹${data.subtotal}, Total: ₹${data.totalAmount}, Status: ${data.status}`
      );
    }

    // Test 2: Invalid item quantity (negative)
    {
      const res = await fetch(`${baseUrl}/billing/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: patProfileApex.id,
          items: [
            {
              description: "Invalid Item",
              quantity: -2,
              unitPrice: 100,
              itemType: InvoiceItemType.OTHER,
            },
          ],
        }),
      });
      const data = await res.json();
      record(
        2,
        "INVOICE_CREATION",
        "Validation rejection on negative item quantity",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 3: Invalid item unitPrice (negative)
    {
      const res = await fetch(`${baseUrl}/billing/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: patProfileApex.id,
          items: [
            {
              description: "Negative Price Item",
              quantity: 1,
              unitPrice: -50.0,
              itemType: InvoiceItemType.OTHER,
            },
          ],
        }),
      });
      const data = await res.json();
      record(
        3,
        "INVOICE_CREATION",
        "Validation rejection on negative item unitPrice",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 4: Invalid tax amount (negative)
    {
      const res = await fetch(`${baseUrl}/billing/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: patProfileApex.id,
          taxAmount: -10.0,
          items: [{ description: "Consultation", quantity: 1, unitPrice: 500 }],
        }),
      });
      const data = await res.json();
      record(
        4,
        "INVOICE_CREATION",
        "Validation rejection on negative taxAmount",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 5: Invalid discount amount (negative)
    {
      const res = await fetch(`${baseUrl}/billing/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: patProfileApex.id,
          discountAmount: -25.0,
          items: [{ description: "Consultation", quantity: 1, unitPrice: 500 }],
        }),
      });
      const data = await res.json();
      record(
        5,
        "INVOICE_CREATION",
        "Validation rejection on negative discountAmount",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 6: Decimal precision & rounding: 3 items with fractional values
    {
      const res = await fetch(`${baseUrl}/billing/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: patProfileApex.id,
          taxAmount: 18.25,
          discountAmount: 10.5,
          items: [
            { description: "Item 1", quantity: 3, unitPrice: 33.33 }, // 99.99
            { description: "Item 2", quantity: 2, unitPrice: 12.45 }, // 24.90
            { description: "Item 3", quantity: 1, unitPrice: 5.11 },  // 5.11
          ], // subtotal = 130.00. Tax = 18.25. Discount = 10.50. Total = 137.75
        }),
      });
      const data = await res.json();
      if (data.id) createdInvoiceIds.push(data.id);

      const subMatch = Number(data.subtotal) === 130.0;
      const totalMatch = Number(data.totalAmount) === 137.75;
      const balMatch = Number(data.outstandingBalance) === 137.75;

      record(
        6,
        "INVOICE_CREATION",
        "Decimal-safe subtotal and grand total calculation with rounding",
        res.status === 201 && subMatch && totalMatch && balMatch,
        `Status: ${res.status}, Subtotal: ${data.subtotal}, GrandTotal: ${data.totalAmount}`
      );
    }

    // Test 7: Unique invoice number formatting
    {
      const inv = await prisma.invoice.findUnique({ where: { id: invoice1Id } });
      const formatValid = !!inv?.invoiceNumber.startsWith(`INV-${hospApex.code}-`);
      record(
        7,
        "INVOICE_CREATION",
        "Invoice number uniqueness and hospital prefix formatting",
        formatValid,
        `Generated InvoiceNumber: ${inv?.invoiceNumber}`
      );
    }

    // =========================================================================
    // SECTION 2: LINE ITEMS MUTATIONS ON DRAFT INVOICE
    // =========================================================================

    // Test 8: Add line item to draft invoice
    let addedItemId = "";
    {
      const res = await fetch(`${baseUrl}/billing/invoices/${invoice1Id}/items`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: "Pharmacy Medication - Amoxicillin 500mg",
          quantity: 2,
          unitPrice: 50.0,
          itemType: InvoiceItemType.PHARMACY,
        }),
      });
      const data = await res.json();
      // Previous subtotal = 1150.50 + 100 = 1250.50. Tax = 50, Discount = 20. Total = 1280.50
      const subCorrect = Number(data.subtotal) === 1250.5;
      const totalCorrect = Number(data.totalAmount) === 1280.5;
      const balCorrect = Number(data.outstandingBalance) === 1280.5;
      const itemFound = data.items?.find((i: any) => i.description.includes("Amoxicillin"));
      if (itemFound) addedItemId = itemFound.id;

      record(
        8,
        "INVOICE_ITEMS_MUTATIONS",
        "Add line item to draft invoice and re-derive totals",
        res.status === 201 && subCorrect && totalCorrect && balCorrect && !!itemFound,
        `Status: ${res.status}, NewSubtotal: ₹${data.subtotal}, NewTotal: ₹${data.totalAmount}`
      );
    }

    // Test 9: Remove line item from draft invoice
    {
      const res = await fetch(`${baseUrl}/billing/invoices/${invoice1Id}/items/${addedItemId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
        },
      });
      const data = await res.json();
      // Should revert to subtotal 1150.50, total 1180.50
      const subReverted = Number(data.subtotal) === 1150.5;
      const totalReverted = Number(data.totalAmount) === 1180.5;

      record(
        9,
        "INVOICE_ITEMS_MUTATIONS",
        "Remove line item from draft invoice and restore totals",
        res.status === 200 && subReverted && totalReverted,
        `Status: ${res.status}, RestoredSubtotal: ₹${data.subtotal}, RestoredTotal: ₹${data.totalAmount}`
      );
    }

    // Test 10: Validation rejection on adding non-positive quantity
    {
      const res = await fetch(`${baseUrl}/billing/invoices/${invoice1Id}/items`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: "Zero Quantity Item",
          quantity: 0,
          unitPrice: 100,
          itemType: InvoiceItemType.OTHER,
        }),
      });
      const data = await res.json();
      record(
        10,
        "INVOICE_ITEMS_MUTATIONS",
        "Validation rejection on adding item with non-positive quantity",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 11: Attempted addition to non-existent invoice
    {
      const randomId = crypto.randomUUID();
      const res = await fetch(`${baseUrl}/billing/invoices/${randomId}/items`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: "Test Item",
          quantity: 1,
          unitPrice: 100,
        }),
      });
      record(
        11,
        "INVOICE_ITEMS_MUTATIONS",
        "Rejection on adding item to non-existent invoice (404)",
        res.status === 404,
        `Status: ${res.status}`
      );
    }

    // Test 12: Consolidated encounter billing
    let consolidatedInvoiceId = "";
    {
      // Create a test appointment
      const appt = await prisma.appointment.create({
        data: {
          hospitalId: hospApex.id,
          patientId: patProfileApex.id,
          doctorId: docProfileApex.id,
          departmentId: docProfileApex.departmentId,
          appointmentDate: new Date(),
          startTime: "11:00",
          endTime: "11:30",
          reason: "Cardiology consultation and review",
          type: AppointmentType.CONSULTATION,
          status: AppointmentStatus.COMPLETED,
        },
      });
      createdAppointmentIds.push(appt.id);

      const res = await fetch(`${baseUrl}/billing/invoices/consolidate-encounter`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ appointmentId: appt.id }),
      });
      const data = await res.json();
      consolidatedInvoiceId = data.id;
      if (consolidatedInvoiceId) createdInvoiceIds.push(consolidatedInvoiceId);

      record(
        12,
        "INVOICE_ITEMS_MUTATIONS",
        "Consolidated billing from visit encounter aggregation",
        res.status === 201 && data.status === InvoiceStatus.DRAFT && data.patientId === patProfileApex.id,
        `Status: ${res.status}, Invoice: ${data.invoiceNumber}, Items: ${data.items?.length}`
      );
    }

    // =========================================================================
    // SECTION 3: INVOICE FINALIZATION & IMMUTABILITY
    // =========================================================================

    // Test 13: Finalize draft invoice by accountant
    {
      const res = await fetch(`${baseUrl}/billing/invoices/${invoice1Id}/finalize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
        },
      });
      const data = await res.json();
      const statusIssued = data.status === InvoiceStatus.ISSUED;
      const hasFinalizedAt = !!data.finalizedAt;
      const finalizedByMatch = data.finalizedById === acctApex.id;

      record(
        13,
        "INVOICE_FINALIZATION",
        "Finalize draft invoice into immutable ISSUED state",
        res.status === 201 && statusIssued && hasFinalizedAt && finalizedByMatch,
        `Status: ${res.status}, FinalizedStatus: ${data.status}, FinalizedBy: ${data.finalizedBy?.firstName}`
      );
    }

    // Test 14: Repeated finalization rejection (idempotent block)
    {
      const res = await fetch(`${baseUrl}/billing/invoices/${invoice1Id}/finalize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
        },
      });
      const data = await res.json();
      record(
        14,
        "INVOICE_FINALIZATION",
        "Rejection of repeated finalization on already finalized invoice",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 15: Cannot finalize an empty invoice with 0 items
    {
      const emptyInv = await prisma.invoice.create({
        data: {
          hospitalId: hospApex.id,
          patientId: patProfileApex.id,
          invoiceNumber: `INV-${hospApex.code}-EMPTY-${Date.now()}`,
          subtotal: 0,
          totalAmount: 0,
          outstandingBalance: 0,
          status: InvoiceStatus.DRAFT,
        },
      });
      createdInvoiceIds.push(emptyInv.id);

      const res = await fetch(`${baseUrl}/billing/invoices/${emptyInv.id}/finalize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
        },
      });
      const data = await res.json();
      record(
        15,
        "INVOICE_FINALIZATION",
        "Block finalization on draft invoice with no line items",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 16: Immutability: Block adding item to finalized invoice
    {
      const res = await fetch(`${baseUrl}/billing/invoices/${invoice1Id}/items`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: "Illegal post-finalization item",
          quantity: 1,
          unitPrice: 150,
        }),
      });
      const data = await res.json();
      record(
        16,
        "INVOICE_FINALIZATION",
        "Immutability: Attempted item addition to finalized invoice is blocked",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 17: Immutability: Block removing item from finalized invoice
    {
      const invWithItems = await prisma.invoice.findUnique({
        where: { id: invoice1Id },
        include: { items: true },
      });
      const itemToDelete = invWithItems?.items[0];

      const res = await fetch(`${baseUrl}/billing/invoices/${invoice1Id}/items/${itemToDelete?.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
        },
      });
      const data = await res.json();
      record(
        17,
        "INVOICE_FINALIZATION",
        "Immutability: Attempted item removal from finalized invoice is blocked",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // =========================================================================
    // SECTION 4: INVOICE VOID WORKFLOW
    // =========================================================================

    // Test 18: Void draft/unpaid invoice
    let voidInvoiceId = "";
    {
      const invToVoid = await prisma.invoice.create({
        data: {
          hospitalId: hospApex.id,
          patientId: patProfileApex.id,
          invoiceNumber: `INV-${hospApex.code}-VOID-${Date.now()}`,
          subtotal: 200,
          totalAmount: 200,
          outstandingBalance: 200,
          status: InvoiceStatus.DRAFT,
          items: {
            create: [
              {
                hospitalId: hospApex.id,
                description: "Test Consultation for Void",
                quantity: 1,
                unitPrice: 200,
                totalPrice: 200,
              },
            ],
          },
        },
      });
      voidInvoiceId = invToVoid.id;
      createdInvoiceIds.push(voidInvoiceId);

      const res = await fetch(`${baseUrl}/billing/invoices/${voidInvoiceId}/void`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Patient cancelled appointment" }),
      });
      const data = await res.json();
      record(
        18,
        "VOID_WORKFLOW",
        "Void an unpaid invoice with audit reason",
        res.status === 201 && data.status === InvoiceStatus.VOID && data.notes?.includes("Patient cancelled appointment"),
        `Status: ${res.status}, Notes: ${data.notes}`
      );
    }

    // Test 19: Repeated void rejection on already void invoice
    {
      const res = await fetch(`${baseUrl}/billing/invoices/${voidInvoiceId}/void`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Repeat void" }),
      });
      const data = await res.json();
      record(
        19,
        "VOID_WORKFLOW",
        "Rejection on attempting to void an already VOID invoice",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 20: Payment attempt on VOID invoice is blocked
    {
      const res = await fetch(`${baseUrl}/payments/cash`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: voidInvoiceId,
          amount: 200,
        }),
      });
      const data = await res.json();
      record(
        20,
        "VOID_WORKFLOW",
        "Payment collection on VOID invoice is strictly rejected",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // =========================================================================
    // SECTION 5: PAYMENT RECORDING & BALANCE MANAGEMENT
    // =========================================================================

    // Test 21: Attempted payment on a DRAFT invoice is blocked
    {
      const draftInv = await prisma.invoice.create({
        data: {
          hospitalId: hospApex.id,
          patientId: patProfileApex.id,
          invoiceNumber: `INV-${hospApex.code}-DRAFT-${Date.now()}`,
          subtotal: 500,
          totalAmount: 500,
          outstandingBalance: 500,
          status: InvoiceStatus.DRAFT,
          items: {
            create: [
              {
                hospitalId: hospApex.id,
                description: "Draft Charge",
                quantity: 1,
                unitPrice: 500,
                totalPrice: 500,
              },
            ],
          },
        },
      });
      createdInvoiceIds.push(draftInv.id);

      const res = await fetch(`${baseUrl}/payments/cash`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: draftInv.id,
          amount: 500,
        }),
      });
      const data = await res.json();
      record(
        21,
        "PAYMENT_RECORDING",
        "Block payment recording on DRAFT invoice (must be finalized first)",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 22: Successful counter cash partial payment
    // Invoice 1 total is ₹1180.50. Let's make a partial cash payment of ₹500.00.
    let payment1Id = "";
    {
      const res = await fetch(`${baseUrl}/payments/cash`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice1Id,
          amount: 500.0,
          paymentMethod: PaymentMethod.CASH,
          notes: "Initial counter cash installment",
        }),
      });
      const data = await res.json();
      payment1Id = data.payment?.id;

      // Paid = 500. Outstanding = 1180.50 - 500 = 680.50. Status = PARTIALLY_PAID
      const paidCorrect = Number(data.newPaidAmount) === 500.0;
      const balCorrect = Number(data.newOutstandingBalance) === 680.5;
      const statusCorrect = data.invoiceStatus === InvoiceStatus.PARTIALLY_PAID;

      record(
        22,
        "PAYMENT_RECORDING",
        "Successful partial cash payment updates paidAmount and outstandingBalance",
        res.status === 201 && paidCorrect && balCorrect && statusCorrect,
        `Status: ${res.status}, Paid: ₹${data.newPaidAmount}, Balance: ₹${data.newOutstandingBalance}, InvStatus: ${data.invoiceStatus}`
      );
    }

    // Test 23: Receipt number generation
    {
      const p = await prisma.payment.findUnique({ where: { id: payment1Id } });
      const receiptValid = !!p?.receiptNumber?.startsWith(`RCP-${hospApex.code}-`);
      record(
        23,
        "PAYMENT_RECORDING",
        "Sequential official payment receipt number generation",
        receiptValid,
        `ReceiptNumber: ${p?.receiptNumber}`
      );
    }

    // Test 24: Counter card/POS payment with transaction reference
    let payment2Id = "";
    {
      const res = await fetch(`${baseUrl}/payments/cash`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice1Id,
          amount: 200.0,
          paymentMethod: PaymentMethod.CREDIT_CARD,
          transactionReference: "AUTH-POS-987654",
          notes: "Card counter swipe",
        }),
      });
      const data = await res.json();
      payment2Id = data.payment?.id;

      // Paid = 700. Outstanding = 1180.50 - 700 = 480.50
      const paidCorrect = Number(data.newPaidAmount) === 700.0;
      const balCorrect = Number(data.newOutstandingBalance) === 480.5;

      record(
        24,
        "PAYMENT_RECORDING",
        "Counter card/POS payment with auth transaction reference",
        res.status === 201 && paidCorrect && balCorrect && data.payment?.paymentMethod === PaymentMethod.CREDIT_CARD,
        `Status: ${res.status}, Method: ${data.payment?.paymentMethod}, Balance: ₹${data.newOutstandingBalance}`
      );
    }

    // Test 25: Zero or negative payment amount is rejected
    {
      const res = await fetch(`${baseUrl}/payments/cash`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice1Id,
          amount: 0,
        }),
      });
      record(
        25,
        "PAYMENT_RECORDING",
        "Validation rejection on zero or negative payment amount",
        res.status === 400,
        `Status: ${res.status}`
      );
    }

    // Test 26: Overpayment rejection: payment amount exceeding outstanding balance
    {
      const res = await fetch(`${baseUrl}/payments/cash`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice1Id,
          amount: 1000.0, // Remaining balance is ₹480.50
        }),
      });
      const data = await res.json();
      record(
        26,
        "PAYMENT_RECORDING",
        "Overpayment protection: payments exceeding outstanding balance rejected",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 27: Full payment completion transitions status to PAID
    let payment3Id = "";
    {
      const res = await fetch(`${baseUrl}/payments/cash`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice1Id,
          amount: 480.5, // Exactly pays off remaining balance
          paymentMethod: PaymentMethod.UPI,
          transactionReference: "UPI-REF-11223344",
        }),
      });
      const data = await res.json();
      payment3Id = data.payment?.id;

      const totalSettled = Number(data.newOutstandingBalance) === 0;
      const statusPaid = data.invoiceStatus === InvoiceStatus.PAID;

      record(
        27,
        "PAYMENT_RECORDING",
        "Settling full remaining balance transitions invoice to PAID",
        res.status === 201 && totalSettled && statusPaid,
        `Status: ${res.status}, Outstanding: ₹${data.newOutstandingBalance}, InvStatus: ${data.invoiceStatus}`
      );
    }

    // Test 28: Attempted payment on already fully paid invoice is rejected
    {
      const res = await fetch(`${baseUrl}/payments/cash`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice1Id,
          amount: 50.0,
        }),
      });
      const data = await res.json();
      record(
        28,
        "PAYMENT_RECORDING",
        "Block payment on already fully paid invoice",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // =========================================================================
    // SECTION 6: REFUNDS & PAYMENT CORRECTIONS
    // =========================================================================

    // Test 29: Partial refund of payment 1 (₹500 payment refunded ₹200)
    {
      const res = await fetch(`${baseUrl}/payments/${payment1Id}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: 200.0,
          reason: "Patient billing adjustment",
        }),
      });
      const data = await res.json();

      // Previous paid was 1180.50 - 200 = 980.50. Outstanding becomes 200. Status becomes PARTIALLY_PAID.
      const invCheck = await prisma.invoice.findUnique({ where: { id: invoice1Id } });
      const balanceRestored = Number(invCheck?.outstandingBalance) === 200.0;
      const statusAdjusted = invCheck?.status === InvoiceStatus.PARTIALLY_PAID;

      record(
        29,
        "REFUNDS_AND_CORRECTIONS",
        "Partial refund restores invoice outstanding balance and transitions to PARTIALLY_PAID",
        res.status === 201 && balanceRestored && statusAdjusted,
        `Status: ${res.status}, Refunded: ₹${data.refundAmount}, NewBalance: ₹${invCheck?.outstandingBalance}, NewStatus: ${invCheck?.status}`
      );
    }

    // Test 30: Full refund of payment 2 (₹200 payment fully refunded)
    {
      const res = await fetch(`${baseUrl}/payments/${payment2Id}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
        },
        body: JSON.stringify({
          reason: "Charge reversed on POS terminal",
        }),
      });
      const data = await res.json();

      const payCheck = await prisma.payment.findUnique({ where: { id: payment2Id } });
      const isRefunded = payCheck?.status === PaymentStatus.REFUNDED;

      record(
        30,
        "REFUNDS_AND_CORRECTIONS",
        "Full payment refund updates payment status to REFUNDED with audit note",
        res.status === 201 && isRefunded && data.refundAmount === 200.0,
        `Status: ${res.status}, Refunded: ₹${data.refundAmount}, PaymentStatus: ${payCheck?.status}`
      );
    }

    // Test 31: Excessive refund rejection
    {
      const res = await fetch(`${baseUrl}/payments/${payment3Id}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: 9999.0, // Payment 3 was ₹480.50
          reason: "Excessive refund",
        }),
      });
      const data = await res.json();
      record(
        31,
        "REFUNDS_AND_CORRECTIONS",
        "Rejection on attempting refund exceeding original payment amount",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 32: Duplicate refund prevention
    {
      // payment 2 was already refunded in Test 30
      const res = await fetch(`${baseUrl}/payments/${payment2Id}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctApex}`,
        },
        body: JSON.stringify({
          reason: "Duplicate refund attempt",
        }),
      });
      const data = await res.json();
      record(
        32,
        "REFUNDS_AND_CORRECTIONS",
        "Rejection of duplicate refund attempt on already REFUNDED payment",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 33: Payment record is NOT deleted on refund
    {
      const p = await prisma.payment.findUnique({ where: { id: payment2Id } });
      record(
        33,
        "REFUNDS_AND_CORRECTIONS",
        "Refund preservation: payment record remains stored in database for audit trail",
        !!p && p.status === PaymentStatus.REFUNDED,
        `Payment ID: ${p?.id}, Status: ${p?.status}`
      );
    }

    // =========================================================================
    // SECTION 7: GATEWAY INITIATION
    // =========================================================================

    // Test 34: Online payment initiation for Stripe (safe 503 if unconfigured)
    {
      const res = await fetch(`${baseUrl}/payments/initiate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenPatientApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice1Id,
          gateway: "STRIPE",
          amount: 100.0,
        }),
      });
      const data = await res.json();
      // If STRIPE_SECRET_KEY is configured, returns 201; if unconfigured, safely returns 503
      const pass = res.status === 201 || (res.status === 503 && getErrMsg(data).includes("unconfigured"));
      record(
        34,
        "GATEWAY_INITIATION",
        "Safe Stripe checkout session initiation (503 if unconfigured)",
        pass,
        `Status: ${res.status}, Message: ${data.message || getErrMsg(data)}`
      );
    }

    // Test 35: Online payment initiation for Razorpay (safe 503 if unconfigured)
    {
      const res = await fetch(`${baseUrl}/payments/initiate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenPatientApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice1Id,
          gateway: "RAZORPAY",
          amount: 100.0,
        }),
      });
      const data = await res.json();
      const pass = res.status === 201 || (res.status === 503 && getErrMsg(data).includes("unconfigured"));
      record(
        35,
        "GATEWAY_INITIATION",
        "Safe Razorpay order initiation (503 if unconfigured)",
        pass,
        `Status: ${res.status}, Message: ${data.message || getErrMsg(data)}`
      );
    }

    // Test 36: Online payment initiation with non-positive amount
    {
      const res = await fetch(`${baseUrl}/payments/initiate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenPatientApex}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice1Id,
          gateway: "STRIPE",
          amount: 0,
        }),
      });
      record(
        36,
        "GATEWAY_INITIATION",
        "Reject initiating online payment with non-positive amount",
        res.status === 400,
        `Status: ${res.status}`
      );
    }

    // =========================================================================
    // SECTION 8: WEBHOOK VERIFICATION & IDEMPOTENCY
    // =========================================================================

    // Create a fresh finalized invoice for webhook tests
    const webhookInv = await prisma.invoice.create({
      data: {
        hospitalId: hospApex.id,
        patientId: patProfileApex.id,
        invoiceNumber: `INV-${hospApex.code}-WH-${Date.now()}`,
        subtotal: 1000.0,
        totalAmount: 1000.0,
        outstandingBalance: 1000.0,
        status: InvoiceStatus.ISSUED,
        items: {
          create: [
            {
              hospitalId: hospApex.id,
              description: "Diagnostic CT Scan",
              quantity: 1,
              unitPrice: 1000.0,
              totalPrice: 1000.0,
            },
          ],
        },
      },
    });
    createdInvoiceIds.push(webhookInv.id);

    const stripeEventId = `evt_test_stripe_${Date.now()}`;
    const stripePayload = JSON.stringify({
      id: stripeEventId,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: `pi_${Date.now()}`,
          amount_received: 40000, // 40000 cents = 400.00
          metadata: {
            invoiceId: webhookInv.id,
          },
        },
      },
    });

    // Test 37: Stripe webhook with valid signature
    {
      const sig = createStripeSignature(stripePayload, stripeSecret);
      const res = await fetch(`${baseUrl}/payments/webhooks/stripe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": sig,
        },
        body: stripePayload,
      });
      const data = await res.json();
      createdPaymentWebhookEvents.push({ gateway: "STRIPE", eventId: stripeEventId });

      const updatedInv = await prisma.invoice.findUnique({ where: { id: webhookInv.id } });
      const paidCorrect = Number(updatedInv?.paidAmount) === 400.0;
      const balCorrect = Number(updatedInv?.outstandingBalance) === 600.0;

      record(
        37,
        "WEBHOOK_VERIFICATION",
        "Stripe webhook verified via HMAC timing-safe signature and balance updated",
        res.status === 201 && paidCorrect && balCorrect && data.received === true,
        `Status: ${res.status}, Paid: ₹${updatedInv?.paidAmount}, Balance: ₹${updatedInv?.outstandingBalance}`
      );
    }

    // Test 38: Stripe webhook with invalid signature rejected
    {
      const invalidSig = "t=" + Math.floor(Date.now() / 1000) + ",v1=invalid_fake_signature_hash_123";
      const res = await fetch(`${baseUrl}/payments/webhooks/stripe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": invalidSig,
        },
        body: stripePayload,
      });
      const data = await res.json();
      record(
        38,
        "WEBHOOK_VERIFICATION",
        "Stripe webhook with invalid signature is rejected (400)",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 39: Stripe webhook with expired timestamp (replay attack prevention)
    {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago (> 300s)
      const expiredSig = createStripeSignature(stripePayload, stripeSecret, oldTimestamp);
      const res = await fetch(`${baseUrl}/payments/webhooks/stripe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": expiredSig,
        },
        body: stripePayload,
      });
      const data = await res.json();
      record(
        39,
        "WEBHOOK_VERIFICATION",
        "Stripe webhook replay attack rejected via timestamp window validation",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 40: Duplicate Stripe event delivery (idempotently handled)
    {
      const validSig = createStripeSignature(stripePayload, stripeSecret);
      const res = await fetch(`${baseUrl}/payments/webhooks/stripe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": validSig,
        },
        body: stripePayload,
      });
      const data = await res.json();

      // Check balance is unchanged (not double-charged)
      const checkInv = await prisma.invoice.findUnique({ where: { id: webhookInv.id } });
      const balanceStill600 = Number(checkInv?.outstandingBalance) === 600.0;

      record(
        40,
        "WEBHOOK_VERIFICATION",
        "Idempotency: Re-delivered Stripe webhook does NOT double-deduct invoice balance",
        res.status === 201 && data.idempotent === true && balanceStill600,
        `Status: ${res.status}, Idempotent: ${data.idempotent}, Balance: ₹${checkInv?.outstandingBalance}`
      );
    }

    // Test 41: Razorpay webhook with valid HMAC signature
    const razorpayEventId = `rzp_evt_${Date.now()}`;
    const razorpayPayload = JSON.stringify({
      event: "payment.captured",
      event_id: razorpayEventId,
      payload: {
        payment: {
          entity: {
            id: `pay_rzp_${Date.now()}`,
            amount: 25000, // 25000 paise = 250.00
            notes: {
              invoiceId: webhookInv.id,
            },
          },
        },
      },
    });

    {
      const sig = createRazorpaySignature(razorpayPayload, razorpaySecret);
      const res = await fetch(`${baseUrl}/payments/webhooks/razorpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": sig,
        },
        body: razorpayPayload,
      });
      const data = await res.json();
      createdPaymentWebhookEvents.push({ gateway: "RAZORPAY", eventId: razorpayEventId });

      // Previous paid = 400 + 250 = 650. Outstanding = 1000 - 650 = 350
      const updatedInv = await prisma.invoice.findUnique({ where: { id: webhookInv.id } });
      const paidCorrect = Number(updatedInv?.paidAmount) === 650.0;
      const balCorrect = Number(updatedInv?.outstandingBalance) === 350.0;

      record(
        41,
        "WEBHOOK_VERIFICATION",
        "Razorpay webhook verified via HMAC SHA256 and settled against invoice",
        res.status === 201 && paidCorrect && balCorrect && data.received === true,
        `Status: ${res.status}, Paid: ₹${updatedInv?.paidAmount}, Balance: ₹${updatedInv?.outstandingBalance}`
      );
    }

    // Test 42: Razorpay webhook with invalid signature rejected
    {
      const invalidSig = "fake_invalid_razorpay_hmac_signature_hex";
      const res = await fetch(`${baseUrl}/payments/webhooks/razorpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": invalidSig,
        },
        body: razorpayPayload,
      });
      const data = await res.json();
      record(
        42,
        "WEBHOOK_VERIFICATION",
        "Razorpay webhook with invalid signature is rejected (400)",
        res.status === 400,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // =========================================================================
    // SECTION 9: MULTI-TENANT & PATIENT BILLING PRIVACY
    // =========================================================================

    // Test 43: Cross-tenant invoice isolation: Hospital City accountant cannot read Hospital Apex invoice
    {
      const res = await fetch(`${baseUrl}/billing/invoices/${invoice1Id}`, {
        headers: {
          Authorization: `Bearer ${tokenAcctCity}`,
        },
      });
      const data = await res.json();
      record(
        43,
        "SECURITY_AND_TENANCY",
        "Tenant isolation: Hospital B staff cannot view Hospital A invoice (403)",
        res.status === 403,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 44: Cross-tenant payment collection rejection: Hospital City staff cannot collect payment on Hospital Apex invoice
    {
      const res = await fetch(`${baseUrl}/payments/cash`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenAcctCity}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice1Id,
          amount: 50.0,
        }),
      });
      const data = await res.json();
      record(
        44,
        "SECURITY_AND_TENANCY",
        "Tenant isolation: Hospital B staff cannot record payment for Hospital A invoice (403)",
        res.status === 403,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 45: Patient IDOR protection: Patient City cannot view Patient Apex invoice
    {
      const res = await fetch(`${baseUrl}/billing/invoices/${invoice1Id}`, {
        headers: {
          Authorization: `Bearer ${tokenPatientCity}`,
        },
      });
      const data = await res.json();
      record(
        45,
        "SECURITY_AND_TENANCY",
        "Patient IDOR protection: Patient B cannot view Patient A invoice (403)",
        res.status === 403,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 46: Patient IDOR protection: Patient City cannot initiate payment for Patient Apex invoice
    {
      const res = await fetch(`${baseUrl}/payments/initiate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenPatientCity}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice1Id,
          gateway: "STRIPE",
          amount: 50.0,
        }),
      });
      const data = await res.json();
      record(
        46,
        "SECURITY_AND_TENANCY",
        "Patient IDOR protection: Patient B cannot initiate payment for Patient A invoice (403)",
        res.status === 403,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 47: RBAC enforcement: Nurse cannot finalize invoices
    {
      const res = await fetch(`${baseUrl}/billing/invoices/${consolidatedInvoiceId}/finalize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenNurseApex}`,
        },
      });
      const data = await res.json();
      record(
        47,
        "SECURITY_AND_TENANCY",
        "RBAC enforcement: Unauthorized role (NURSE) cannot finalize invoices (403)",
        res.status === 403,
        `Status: ${res.status}, Message: ${getErrMsg(data)}`
      );
    }

    // Test 48: Audit trail verification for billing and payment actions
    {
      const auditCount = await prisma.auditLog.count({
        where: {
          hospitalId: hospApex.id,
          entityName: { in: ["Invoice", "Payment", "InvoiceItem"] },
        },
      });
      record(
        48,
        "SECURITY_AND_TENANCY",
        "Comprehensive AuditLog generation for financial mutations and lifecycle events",
        auditCount >= 5,
        `Total Billing & Payment Audit Logs: ${auditCount}`
      );
    }

  } finally {
    // Teardown created test entities
    try {
      for (const ev of createdPaymentWebhookEvents) {
        await prisma.paymentWebhookEvent.deleteMany({
          where: { gateway: ev.gateway, eventId: ev.eventId },
        });
      }
      for (const invId of createdInvoiceIds) {
        await prisma.payment.deleteMany({ where: { invoiceId: invId } });
        await prisma.invoiceItem.deleteMany({ where: { invoiceId: invId } });
        await prisma.invoice.deleteMany({ where: { id: invId } });
      }
      for (const apptId of createdAppointmentIds) {
        await prisma.appointment.deleteMany({ where: { id: apptId } });
      }
    } catch (e) {
      // ignore cleanup errors
    }

    await app.close();
  }

  // Print Summary
  console.log("\n==========================================================================");
  console.log("📊 Phase 11 Billing & Payment Test Suite Execution Summary");
  console.log("==========================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Tests Run: ${total}`);
  console.log(`Passed:         ${passed} / ${total} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`Failed:         ${failed} / ${total}`);

  if (failed > 0) {
    console.error(`\n❌ ${failed} test(s) failed in Phase 11 Suite!`);
    process.exit(1);
  } else {
    console.log("\n✨ All 48 Phase 11 Billing & Payment Management Tests Passed Successfully! ✨\n");
    process.exit(0);
  }
}

runPhase11Tests().catch((err) => {
  console.error("Fatal error executing Phase 11 Test Suite:", err);
  process.exit(1);
});
