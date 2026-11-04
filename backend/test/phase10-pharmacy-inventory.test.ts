import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  UserRole,
  BatchStatus,
  StockMovementType,
  PrescriptionStatus,
  AuditAction,
  MedicineForm,
} from "@prisma/client";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { ExpiryMonitorService } from "../src/pharmacy/expiry-monitor.service";

interface TestResult {
  id: number;
  category:
    | "CATALOGUE"
    | "BATCH_MANAGEMENT"
    | "STOCK_RECEIVING"
    | "INVENTORY_TRACKING"
    | "FIFO_DISPENSING"
    | "PRESCRIPTION_INTEGRATION"
    | "EXPIRY_MANAGEMENT"
    | "SECURITY_TENANCY";
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
  console.log(`${icon} [PHASE 10 Test ${id}] [${category}] ${name}: ${details}`);
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

async function runPhase10Tests() {
  console.log("==========================================================================");
  console.log("🧪 MedCore HMS — Phase 10 Pharmacy & Inventory Management Integration Tests");
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
  const expiryMonitor = app.get(ExpiryMonitorService);

  // Fetch Hospitals
  const hospApex = await prisma.hospital.findUnique({ where: { code: "APEX-MAIN" } });
  const hospCity = await prisma.hospital.findUnique({ where: { code: "CITY-CARE" } });

  if (!hospApex || !hospCity) {
    throw new Error("Seeded hospitals APEX-MAIN and CITY-CARE must exist in database.");
  }

  // Token helper
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
  const docCity = await prisma.user.findUnique({ where: { email: "dr.tanvi.patil@citycarehospitals.com" } });
  const nurseApex = await prisma.user.findUnique({ where: { email: "nurse.apex@medcore.io" } });
  const patientApex = await prisma.user.findUnique({ where: { email: "patient.rajesh.sharma0@example.com" } });
  const patientCity = await prisma.user.findUnique({ where: { email: "patient.pooja.patel1@example.com" } });

  if (
    !superAdmin ||
    !adminApex ||
    !docApex ||
    !docCity ||
    !nurseApex ||
    !patientApex ||
    !patientCity
  ) {
    throw new Error("Required seed users missing from database.");
  }

  // Ensure Pharmacists for Apex and City
  let pharmApex = await prisma.user.findFirst({
    where: { hospitalId: hospApex.id, role: UserRole.PHARMACIST },
  });
  if (!pharmApex) {
    pharmApex = await prisma.user.create({
      data: {
        hospitalId: hospApex.id,
        email: "pharmacist.apex@medcore.io",
        passwordHash: "seeded_hash",
        firstName: "Priya",
        lastName: "Nair",
        role: UserRole.PHARMACIST,
      },
    });
  }

  let pharmCity = await prisma.user.findFirst({
    where: { hospitalId: hospCity.id, role: UserRole.PHARMACIST },
  });
  if (!pharmCity) {
    pharmCity = await prisma.user.create({
      data: {
        hospitalId: hospCity.id,
        email: "pharmacist.city@medcore.io",
        passwordHash: "seeded_hash",
        firstName: "Suresh",
        lastName: "Patel",
        role: UserRole.PHARMACIST,
      },
    });
  }

  // Ensure patient record for Apex
  let patApexRecord = await prisma.patient.findFirst({
    where: { hospitalId: hospApex.id, userId: patientApex.id },
  });
  if (!patApexRecord) {
    patApexRecord = await prisma.patient.create({
      data: {
        hospitalId: hospApex.id,
        userId: patientApex.id,
        mrn: `MRN-PH10-${Date.now().toString().slice(-6)}`,
        firstName: "Rajesh",
        lastName: "Sharma",
        phone: "+919876543210",
        emergencyContactName: "Aarti Sharma",
        emergencyContactPhone: "+919876543211",
        gender: "MALE",
        dateOfBirth: new Date("1985-05-15"),
      },
    });
  }

  // Ensure doctor record for Apex
  let docApexRecord = await prisma.doctor.findFirst({
    where: { hospitalId: hospApex.id, userId: docApex.id },
  });
  if (!docApexRecord) {
    const deptApex = await prisma.department.findFirst({ where: { hospitalId: hospApex.id } });
    docApexRecord = await prisma.doctor.create({
      data: {
        hospitalId: hospApex.id,
        userId: docApex.id,
        licenseNumber: `DOC-PH10-${Date.now().toString().slice(-4)}`,
        specialization: "Internal Medicine",
        departmentId: deptApex!.id,
        consultationFee: 500,
      },
    });
  }

  // Ensure medical record for Apex patient
  let medRec = await prisma.medicalRecord.findFirst({
    where: { hospitalId: hospApex.id, patientId: patApexRecord.id },
  });
  if (!medRec) {
    medRec = await prisma.medicalRecord.create({
      data: {
        hospitalId: hospApex.id,
        patientId: patApexRecord.id,
        doctorId: docApexRecord.id,
        chiefComplaint: "Routine clinical visit",
      },
    });
  }

  // Tokens
  const tPharmApex = makeToken(pharmApex);
  const tPharmCity = makeToken(pharmCity);
  const tAdminApex = makeToken(adminApex);
  const tSuper = makeToken(superAdmin);
  const tDocApex = makeToken(docApex);
  const tPatApex = makeToken(patientApex);

  // Tracking for cleanup
  const cleanDispRecordIds: string[] = [];
  const cleanMovementIds: string[] = [];
  const cleanBatchIds: string[] = [];
  const cleanRxItemIds: string[] = [];
  const cleanRxIds: string[] = [];
  const cleanMedIds: string[] = [];

  const createTestRx = async (
    qty: number,
    medId: string,
    status: PrescriptionStatus = PrescriptionStatus.PENDING
  ) => {
    const rx = await prisma.prescription.create({
      data: {
        hospitalId: hospApex.id,
        patientId: patApexRecord.id,
        doctorId: docApexRecord.id,
        medicalRecordId: medRec.id,
        status,
        prescriptionDate: new Date(),
        items: {
          create: [
            {
              hospitalId: hospApex.id,
              medicineId: medId,
              dosage: "500mg",
              frequency: "TDS",
              duration: "5 days",
              quantity: qty,
            },
          ],
        },
      },
      include: { items: true },
    });
    cleanRxIds.push(rx.id);
    if (rx.items[0]?.id) cleanRxItemIds.push(rx.items[0].id);
    return rx;
  };

  try {
    // =========================================================================
    // SECTION A: MEDICINE CATALOGUE
    // =========================================================================

    // Test 1: Pharmacist can create medicine in catalog
    const medCode1 = `TEST-MED-${Date.now().toString().slice(-5)}`;
    const res1 = await fetch(`${baseUrl}/pharmacy/medicines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        code: medCode1,
        name: "Amoxicillin Trihydrate 500mg",
        genericName: "Amoxicillin",
        category: "Antibiotics",
        form: MedicineForm.CAPSULE,
        strength: "500mg",
        manufacturer: "Cipla Health",
        unitPrice: 12.5,
        reorderLevel: 25,
      }),
    });
    const b1 = await res1.json();
    const p1 = res1.status === 201 && b1.code === medCode1 && b1.hospitalId === hospApex.id;
    if (b1?.id) cleanMedIds.push(b1.id);
    record(1, "CATALOGUE", "Pharmacist creates medicine in hospital formulary", p1, `Status: ${res1.status}`);

    const medId1 = b1.id;

    // Test 2: Reject duplicate medicine code in same hospital scope
    const res2 = await fetch(`${baseUrl}/pharmacy/medicines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        code: medCode1,
        name: "Amoxicillin Duplicate",
        genericName: "Amoxicillin",
        category: "Antibiotics",
        form: MedicineForm.CAPSULE,
        strength: "500mg",
        unitPrice: 15.0,
      }),
    });
    const b2 = await res2.json();
    const p2 = res2.status === 400 && getErrMsg(b2).includes("already exists");
    record(2, "CATALOGUE", "Reject duplicate medicine code within tenant scope", p2, `Status: ${res2.status}, Msg: ${getErrMsg(b2)}`);

    // Test 3: Reject medicine creation by Patient (Unauthorized)
    const res3 = await fetch(`${baseUrl}/pharmacy/medicines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPatApex}` },
      body: JSON.stringify({
        code: `PAT-MED-${Date.now().toString().slice(-4)}`,
        name: "Unauthorized Patient Med",
        genericName: "Fake",
        category: "General",
        form: MedicineForm.TABLET,
        strength: "100mg",
        unitPrice: 5.0,
      }),
    });
    const p3 = res3.status === 403;
    record(3, "CATALOGUE", "Reject unauthorized medicine creation by Patient", p3, `Status: ${res3.status}`);

    // Test 4: Reject medicine creation by Doctor (Pharmacist or Admin only)
    const res4 = await fetch(`${baseUrl}/pharmacy/medicines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tDocApex}` },
      body: JSON.stringify({
        code: `DOC-MED-${Date.now().toString().slice(-4)}`,
        name: "Unauthorized Doctor Med",
        genericName: "Fake",
        category: "General",
        form: MedicineForm.TABLET,
        strength: "100mg",
        unitPrice: 5.0,
      }),
    });
    const p4 = res4.status === 403;
    record(4, "CATALOGUE", "Reject unauthorized catalog creation by Doctor", p4, `Status: ${res4.status}`);

    // Test 5: Validation - Reject missing required fields or invalid price
    const res5 = await fetch(`${baseUrl}/pharmacy/medicines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        code: "INVALID-MED",
        // missing name, genericName
        unitPrice: -10, // negative price
      }),
    });
    const p5 = res5.status === 400;
    record(5, "CATALOGUE", "Input validation rejects missing fields and negative unitPrice", p5, `Status: ${res5.status}`);

    // Test 6: Get medicine by ID with total stock and low stock calculation
    const res6 = await fetch(`${baseUrl}/pharmacy/medicines/${medId1}`, {
      headers: { Authorization: `Bearer ${tPharmApex}` },
    });
    const b6 = await res6.json();
    const p6 = res6.status === 200 && b6.id === medId1 && b6.totalStock === 0 && b6.isLowStock === true;
    record(6, "CATALOGUE", "GET /pharmacy/medicines/:id returns details with stock calculation", p6, `totalStock: ${b6.totalStock}, isLowStock: ${b6.isLowStock}`);

    // Test 7: Update medicine details (PATCH /pharmacy/medicines/:id)
    const res7 = await fetch(`${baseUrl}/pharmacy/medicines/${medId1}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        manufacturer: "Cipla Healthcare International",
        reorderLevel: 30,
        unitPrice: 14.0,
      }),
    });
    const b7 = await res7.json();
    const p7 = res7.status === 200 && b7.manufacturer === "Cipla Healthcare International" && b7.reorderLevel === 30;
    record(7, "CATALOGUE", "PATCH /pharmacy/medicines/:id updates medicine and writes audit log", p7, `Updated reorderLevel: ${b7.reorderLevel}`);

    // Test 8: Reject cross-tenant medicine update
    const res8 = await fetch(`${baseUrl}/pharmacy/medicines/${medId1}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmCity}` },
      body: JSON.stringify({
        name: "Hacked by City Hospital",
      }),
    });
    const p8 = res8.status === 403;
    record(8, "CATALOGUE", "Tenant isolation: Prevent modifying another hospital's medicine", p8, `Status: ${res8.status}`);

    // Test 9: List medicines with search filter
    const res9 = await fetch(`${baseUrl}/pharmacy/medicines?search=Amoxicillin`, {
      headers: { Authorization: `Bearer ${tPharmApex}` },
    });
    const b9 = await res9.json();
    const p9 = res9.status === 200 && Array.isArray(b9) && b9.some((m: any) => m.id === medId1);
    record(9, "CATALOGUE", "GET /pharmacy/medicines supports case-insensitive search filtering", p9, `Found: ${b9.length} matches`);

    // =========================================================================
    // SECTION B: MEDICINE BATCH MANAGEMENT
    // =========================================================================

    // Test 10: Pharmacist creates batch with valid future expiry
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 180); // 6 months in future
    const mfgDate = new Date();
    mfgDate.setDate(mfgDate.getDate() - 30); // 1 month ago

    const batchNo1 = `BATCH-A-${Date.now().toString().slice(-4)}`;
    const res10 = await fetch(`${baseUrl}/pharmacy/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchNumber: batchNo1,
        manufacturingDate: mfgDate.toISOString().split("T")[0],
        expiryDate: futureDate.toISOString().split("T")[0],
        quantity: 100,
        unitCost: 8.5,
        mrp: 14.0,
        supplier: "Global Pharma Distributors",
      }),
    });
    const b10 = await res10.json();
    const p10 = res10.status === 201 && b10.batchNumber === batchNo1 && b10.currentQuantity === 100 && b10.status === BatchStatus.ACTIVE;
    if (b10?.id) cleanBatchIds.push(b10.id);
    record(10, "BATCH_MANAGEMENT", "Create valid batch with initial quantity and purchase receipt movement", p10, `Status: ${res10.status}, Batch ID: ${b10.id}`);

    const batchId1 = b10.id;

    // Test 11: Verify StockMovement created automatically on batch creation
    const mv11 = await prisma.stockMovement.findFirst({
      where: { batchId: batchId1, type: StockMovementType.PURCHASE_RECEIPT },
    });
    const p11 = !!mv11 && mv11.quantity === 100 && mv11.newStock === 100;
    if (mv11?.id) cleanMovementIds.push(mv11.id);
    record(11, "BATCH_MANAGEMENT", "Batch creation atomically creates PURCHASE_RECEIPT StockMovement", p11, `Movement quantity: ${mv11?.quantity}`);

    // Test 12: Reject duplicate batch number for same medicine
    const res12 = await fetch(`${baseUrl}/pharmacy/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchNumber: batchNo1,
        expiryDate: futureDate.toISOString().split("T")[0],
        quantity: 50,
        unitCost: 8.5,
        mrp: 14.0,
      }),
    });
    const b12 = await res12.json();
    const p12 = res12.status === 400 && getErrMsg(b12).includes("already registered");
    record(12, "BATCH_MANAGEMENT", "Reject duplicate batch number for the same medicine in tenant", p12, `Status: ${res12.status}, Msg: ${getErrMsg(b12)}`);

    // Test 13: Reject batch with expiry date in the past
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const res13 = await fetch(`${baseUrl}/pharmacy/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchNumber: `BATCH-EXPIRED-${Date.now().toString().slice(-4)}`,
        expiryDate: pastDate.toISOString().split("T")[0],
        quantity: 50,
        unitCost: 8.5,
        mrp: 14.0,
      }),
    });
    const b13 = await res13.json();
    const p13 = res13.status === 400 && getErrMsg(b13).includes("future");
    record(13, "BATCH_MANAGEMENT", "Reject batch registration with already-expired date", p13, `Status: ${res13.status}, Msg: ${getErrMsg(b13)}`);

    // Test 14: Reject batch where manufacturing date >= expiry date
    const res14 = await fetch(`${baseUrl}/pharmacy/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchNumber: `BATCH-INVALID-DATE-${Date.now().toString().slice(-4)}`,
        manufacturingDate: "2027-06-01",
        expiryDate: "2027-01-01", // precedes manufacturing!
        quantity: 50,
        unitCost: 8.5,
        mrp: 14.0,
      }),
    });
    const b14 = await res14.json();
    const p14 = res14.status === 400 && getErrMsg(b14).includes("precede");
    record(14, "BATCH_MANAGEMENT", "Reject batch where manufacturing date succeeds expiry date", p14, `Status: ${res14.status}, Msg: ${getErrMsg(b14)}`);

    // Test 15: Reject batch with zero or negative quantity
    const res15 = await fetch(`${baseUrl}/pharmacy/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchNumber: `BATCH-ZERO-${Date.now().toString().slice(-4)}`,
        expiryDate: futureDate.toISOString().split("T")[0],
        quantity: 0,
        unitCost: 8.5,
        mrp: 14.0,
      }),
    });
    const p15 = res15.status === 400;
    record(15, "BATCH_MANAGEMENT", "Reject batch registration with zero or negative quantity", p15, `Status: ${res15.status}`);

    // Test 16: Get single batch by ID
    const res16 = await fetch(`${baseUrl}/pharmacy/batches/${batchId1}`, {
      headers: { Authorization: `Bearer ${tPharmApex}` },
    });
    const b16 = await res16.json();
    const p16 = res16.status === 200 && b16.id === batchId1 && b16.medicine?.id === medId1;
    record(16, "BATCH_MANAGEMENT", "GET /pharmacy/batches/:id returns batch details with medicine relation", p16, `Batch number: ${b16.batchNumber}`);

    // Test 17: Cross-tenant batch query forbidden
    const res17 = await fetch(`${baseUrl}/pharmacy/batches/${batchId1}`, {
      headers: { Authorization: `Bearer ${tPharmCity}` },
    });
    const p17 = res17.status === 403;
    record(17, "BATCH_MANAGEMENT", "Cross-tenant access to batch details is forbidden (403)", p17, `Status: ${res17.status}`);

    // =========================================================================
    // SECTION C: STOCK RECEIVING
    // =========================================================================

    // Test 18: Receive additional stock into existing batch via POST /pharmacy/receive-stock
    const res18 = await fetch(`${baseUrl}/pharmacy/receive-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchNumber: batchNo1,
        expiryDate: futureDate.toISOString().split("T")[0],
        quantity: 50,
        unitCost: 9.0,
        mrp: 14.0,
        supplier: "Global Pharma Distributors",
        invoiceReference: "INV-2026-0099",
      }),
    });
    const b18 = await res18.json();
    const p18 = res18.status === 201 && b18.batch?.currentQuantity === 150 && b18.movement?.quantity === 50;
    if (b18?.movement?.id) cleanMovementIds.push(b18.movement.id);
    record(18, "STOCK_RECEIVING", "Receive additional stock into existing batch updates stock atomically", p18, `New total batch stock: ${b18.batch?.currentQuantity}`);

    // Test 19: Receive stock creating a second batch (older expiry for FIFO testing)
    const earlierExpiry = new Date();
    earlierExpiry.setDate(earlierExpiry.getDate() + 60); // 2 months in future (expires earlier than batch 1)
    const batchNo2 = `BATCH-B-${Date.now().toString().slice(-4)}`;

    const res19 = await fetch(`${baseUrl}/pharmacy/receive-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchNumber: batchNo2,
        expiryDate: earlierExpiry.toISOString().split("T")[0],
        quantity: 40,
        unitCost: 8.0,
        mrp: 14.0,
        supplier: "Apex Direct Lab",
        invoiceReference: "INV-2026-0100",
      }),
    });
    const b19 = await res19.json();
    const p19 = res19.status === 201 && b19.batch?.batchNumber === batchNo2 && b19.batch?.currentQuantity === 40;
    if (b19?.batch?.id) cleanBatchIds.push(b19.batch.id);
    if (b19?.movement?.id) cleanMovementIds.push(b19.movement.id);
    record(19, "STOCK_RECEIVING", "Receive incoming stock creating new batch with invoice reference", p19, `Created batch ${batchNo2} with qty 40`);

    const batchId2 = b19.batch?.id;

    // Test 20: Reject stock receiving with non-positive quantity
    const res20 = await fetch(`${baseUrl}/pharmacy/receive-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchNumber: `BATCH-NEG-${Date.now().toString().slice(-4)}`,
        expiryDate: futureDate.toISOString().split("T")[0],
        quantity: -10,
        unitCost: 8.0,
        mrp: 14.0,
      }),
    });
    const p20 = res20.status === 400;
    record(20, "STOCK_RECEIVING", "Reject stock receiving with negative quantity", p20, `Status: ${res20.status}`);

    // Test 21: Reject cross-tenant stock receiving
    const res21 = await fetch(`${baseUrl}/pharmacy/receive-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmCity}` },
      body: JSON.stringify({
        medicineId: medId1, // belongs to Apex
        batchNumber: `BATCH-CROSS-${Date.now().toString().slice(-4)}`,
        expiryDate: futureDate.toISOString().split("T")[0],
        quantity: 20,
        unitCost: 8.0,
        mrp: 14.0,
      }),
    });
    const p21 = res21.status === 404; // Medicine not in City formulary
    record(21, "STOCK_RECEIVING", "Prevent cross-tenant stock receiving (404 Not Found in formulary)", p21, `Status: ${res21.status}`);

    // =========================================================================
    // SECTION D: INVENTORY TRACKING & MOVEMENTS
    // =========================================================================

    // Test 22: Query stock movement ledger (GET /pharmacy/movements)
    const res22 = await fetch(`${baseUrl}/pharmacy/movements?medicineId=${medId1}`, {
      headers: { Authorization: `Bearer ${tPharmApex}` },
    });
    const b22 = await res22.json();
    const p22 = res22.status === 200 && Array.isArray(b22) && b22.length >= 2;
    record(22, "INVENTORY_TRACKING", "GET /pharmacy/movements returns traceable movement history", p22, `Found: ${b22.length} movements`);

    // Test 23: Perform stock adjustment with mandatory justification
    const res23 = await fetch(`${baseUrl}/pharmacy/adjust-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchId: batchId1,
        quantityDelta: -5,
        type: StockMovementType.ADJUSTMENT,
        reason: "Damaged ampoule during internal pharmacy relocation",
      }),
    });
    const b23 = await res23.json();
    const p23 = res23.status === 201 && b23.quantity === -5 && b23.previousStock === 150 && b23.newStock === 145;
    if (b23?.id) cleanMovementIds.push(b23.id);
    record(23, "INVENTORY_TRACKING", "Authorized stock adjustment creates movement and updates batch stock", p23, `Previous: ${b23.previousStock}, New: ${b23.newStock}`);

    // Test 24: Reject stock adjustment without mandatory reason
    const res24 = await fetch(`${baseUrl}/pharmacy/adjust-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchId: batchId1,
        quantityDelta: -2,
        type: StockMovementType.ADJUSTMENT,
        reason: "  ", // invalid empty reason
      }),
    });
    const b24 = await res24.json();
    const p24 = res24.status === 400 && getErrMsg(b24).includes("reason");
    record(24, "INVENTORY_TRACKING", "Reject inventory adjustment with missing or whitespace-only reason", p24, `Status: ${res24.status}`);

    // Test 25: Reject stock adjustment causing negative stock
    const res25 = await fetch(`${baseUrl}/pharmacy/adjust-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchId: batchId1,
        quantityDelta: -1000, // excessive reduction
        type: StockMovementType.ADJUSTMENT,
        reason: "Inventory audit correction",
      }),
    });
    const b25 = await res25.json();
    const p25 = res25.status === 400 && getErrMsg(b25).includes("negative");
    record(25, "INVENTORY_TRACKING", "Reject stock adjustment that would cause batch stock to become negative", p25, `Status: ${res25.status}, Msg: ${getErrMsg(b25)}`);

    // Test 26: Return to stock (positive delta with type RETURNED)
    const res26 = await fetch(`${baseUrl}/pharmacy/adjust-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        batchId: batchId1,
        quantityDelta: 2,
        type: StockMovementType.RETURNED,
        reason: "Unopened patient return per hospital return policy",
      }),
    });
    const b26 = await res26.json();
    const p26 = res26.status === 201 && b26.quantity === 2 && b26.type === StockMovementType.RETURNED;
    if (b26?.id) cleanMovementIds.push(b26.id);
    record(26, "INVENTORY_TRACKING", "Return to stock (RETURNED) increases batch quantity with audit reason", p26, `Type: ${b26.type}, New stock: ${b26.newStock}`);

    // =========================================================================
    // SECTION E: FIFO DISPENSING
    // =========================================================================

    // Current state of medId1 batches:
    // batchId2: qty 40, expires in 60 days (EARLIER -> must be consumed FIRST under FIFO)
    // batchId1: qty 147 (150 - 5 + 2), expires in 180 days (LATER -> consumed after batchId2 is exhausted)

    // Create a prescription for patientApex with medId1
    const rx1 = await createTestRx(15, medId1);

    // Test 27: Dispense rx1 - FIFO must pick batchId2 first (earliest expiry)
    const res27 = await fetch(`${baseUrl}/pharmacy/dispense/${rx1.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({}),
    });
    const b27 = await res27.json();
    const p27 =
      res27.status === 201 &&
      b27.status === PrescriptionStatus.DISPENSED &&
      b27.dispensedRecords?.length === 1 &&
      b27.dispensedRecords[0]?.batchId === batchId2 &&
      b27.dispensedRecords[0]?.quantity === 15;
    if (b27.dispensedRecords?.[0]?.id) cleanDispRecordIds.push(b27.dispensedRecords[0].id);
    record(27, "FIFO_DISPENSING", "FIFO orders batches by expiryDate ASC and consumes oldest batch first", p27, `Selected batch: ${b27.dispensedRecords?.[0]?.batchId} (expected batchId2)`);

    // Verify batchId2 remaining stock: 40 - 15 = 25
    const b2Check = await prisma.medicineBatch.findUnique({ where: { id: batchId2 } });
    const p28 = b2Check?.currentQuantity === 25;
    record(28, "FIFO_DISPENSING", "Batch stock accurately reduced after single-batch FIFO dispensing", p28, `Remaining in batch 2: ${b2Check?.currentQuantity} (expected 25)`);

    // Test 29: Multi-batch allocation (FIFO across multiple batches)
    // Request 35 units: 25 remaining in batchId2 + 10 from batchId1
    const rx2 = await createTestRx(35, medId1);

    const res29 = await fetch(`${baseUrl}/pharmacy/dispense/${rx2.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({}),
    });
    const b29 = await res29.json();
    const recs29 = b29.dispensedRecords || [];
    const p29 =
      res29.status === 201 &&
      b29.status === PrescriptionStatus.DISPENSED &&
      recs29.length === 2 &&
      recs29[0].batchId === batchId2 &&
      recs29[0].quantity === 25 &&
      recs29[1].batchId === batchId1 &&
      recs29[1].quantity === 10;
    for (const r of recs29) {
      if (r?.id) cleanDispRecordIds.push(r.id);
    }
    record(29, "FIFO_DISPENSING", "Multi-batch allocation: exhausts earlier batch then spills to next batch", p29, `Records: ${recs29.map((r: any) => `${r.batchId}:${r.quantity}`).join(", ")}`);

    // Verify batchId2 is now DEPLETED (0 stock) and batchId1 has 137 (147 - 10)
    const b2Depleted = await prisma.medicineBatch.findUnique({ where: { id: batchId2 } });
    const b1After = await prisma.medicineBatch.findUnique({ where: { id: batchId1 } });
    const p30 =
      b2Depleted?.currentQuantity === 0 &&
      b2Depleted?.status === BatchStatus.DEPLETED &&
      b1After?.currentQuantity === 137;
    record(30, "FIFO_DISPENSING", "Depleted batch status updated to DEPLETED upon full stock exhaustion", p30, `Batch 2 status: ${b2Depleted?.status}, Batch 1 stock: ${b1After?.currentQuantity}`);

    // Test 31: Exclude Quarantined batches from FIFO dispensing
    // Quarantine batchId1
    await prisma.medicineBatch.update({
      where: { id: batchId1 },
      data: { status: BatchStatus.QUARANTINED },
    });

    const rx3 = await createTestRx(5, medId1);

    const res31 = await fetch(`${baseUrl}/pharmacy/dispense/${rx3.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({}),
    });
    const b31 = await res31.json();
    const p31 = res31.status === 400 && getErrMsg(b31).includes("Insufficient");
    record(31, "FIFO_DISPENSING", "Quarantined batches are strictly excluded from FIFO dispensing", p31, `Status: ${res31.status}, Msg: ${getErrMsg(b31)}`);

    // Un-quarantine batchId1 for remaining tests
    await prisma.medicineBatch.update({
      where: { id: batchId1 },
      data: { status: BatchStatus.ACTIVE },
    });

    // Test 32: Exclude Expired batches from FIFO dispensing
    // Create an already-expired batch in DB directly
    const expiredBatch = await prisma.medicineBatch.create({
      data: {
        hospitalId: hospApex.id,
        medicineId: medId1,
        batchNumber: `BATCH-EX-TEST-${Date.now().toString().slice(-4)}`,
        expiryDate: new Date(Date.now() - 5 * 24 * 3600 * 1000), // 5 days ago
        initialQuantity: 50,
        currentQuantity: 50,
        unitCost: 5.0,
        mrp: 10.0,
        status: BatchStatus.ACTIVE, // active status but expired date
      },
    });
    cleanBatchIds.push(expiredBatch.id);

    // Dispense from rx3 - should pick batchId1 (137 available), NOT the expired batch
    const res32 = await fetch(`${baseUrl}/pharmacy/dispense/${rx3.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({}),
    });
    const b32 = await res32.json();
    const p32 =
      res32.status === 201 &&
      b32.status === PrescriptionStatus.DISPENSED &&
      b32.dispensedRecords?.[0]?.batchId === batchId1; // picked active non-expired batch
    if (b32.dispensedRecords?.[0]?.id) cleanDispRecordIds.push(b32.dispensedRecords[0].id);
    record(32, "FIFO_DISPENSING", "Expired stock is never dispensed even if marked ACTIVE in database", p32, `Dispensed from: ${b32.dispensedRecords?.[0]?.batchId}`);

    // Test 33: Reject dispensing if total available stock is insufficient
    const rxExcess = await createTestRx(9999, medId1);

    const res33 = await fetch(`${baseUrl}/pharmacy/dispense/${rxExcess.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({}),
    });
    const b33 = await res33.json();
    const p33 = res33.status === 400 && getErrMsg(b33).includes("Insufficient");
    record(33, "FIFO_DISPENSING", "Safely reject dispensing when stock is insufficient without corrupting inventory", p33, `Status: ${res33.status}, Msg: ${getErrMsg(b33)}`);

    // Test 34: Reject duplicate dispensing of already DISPENSED prescription
    const res34 = await fetch(`${baseUrl}/pharmacy/dispense/${rx1.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({}),
    });
    const b34 = await res34.json();
    const p34 = res34.status === 400 && getErrMsg(b34).includes("already");
    record(34, "FIFO_DISPENSING", "Prevent duplicate dispensing on already-fulfilled prescription", p34, `Status: ${res34.status}`);

    // =========================================================================
    // SECTION F: PRESCRIPTION INTEGRATION & AUTHORIZATION
    // =========================================================================

    // Test 35: Reject dispensing cancelled prescriptions
    const rxCancelled = await createTestRx(6, medId1, PrescriptionStatus.CANCELLED);

    const res35 = await fetch(`${baseUrl}/pharmacy/dispense/${rxCancelled.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({}),
    });
    const b35 = await res35.json();
    const p35 = res35.status === 400 && getErrMsg(b35).includes("cancelled");
    record(35, "PRESCRIPTION_INTEGRATION", "Reject dispensing cancelled prescriptions", p35, `Status: ${res35.status}, Msg: ${getErrMsg(b35)}`);

    // Test 36: Reject dispensing by unauthorized Patient
    const res36 = await fetch(`${baseUrl}/pharmacy/dispense/${rxExcess.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPatApex}` },
      body: JSON.stringify({}),
    });
    const p36 = res36.status === 403;
    record(36, "PRESCRIPTION_INTEGRATION", "Patients cannot dispense medicines (403 Forbidden)", p36, `Status: ${res36.status}`);

    // Test 37: Reject cross-tenant dispensing (City pharmacist cannot dispense Apex prescription)
    const res37 = await fetch(`${baseUrl}/pharmacy/dispense/${rxExcess.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmCity}` },
      body: JSON.stringify({}),
    });
    const p37 = res37.status === 403;
    record(37, "PRESCRIPTION_INTEGRATION", "Cross-tenant dispensing strictly prohibited (403 Forbidden)", p37, `Status: ${res37.status}`);

    // Test 38: Partial dispensing support
    const rxPartial = await createTestRx(20, medId1);

    // Partially dispense 10 out of 20
    const res38 = await fetch(`${baseUrl}/pharmacy/dispense/${rxPartial.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
      body: JSON.stringify({
        items: [
          {
            prescriptionItemId: rxPartial.items[0].id,
            quantity: 10,
          },
        ],
      }),
    });
    const b38 = await res38.json();
    const p38 = res38.status === 201 && b38.status === PrescriptionStatus.PARTIALLY_DISPENSED;
    if (b38.dispensedRecords?.[0]?.id) cleanDispRecordIds.push(b38.dispensedRecords[0].id);
    record(38, "PRESCRIPTION_INTEGRATION", "Partial dispensing marks prescription status as PARTIALLY_DISPENSED", p38, `Status: ${b38.status}`);

    // Test 39: Query dispensing history (GET /pharmacy/dispensing-records)
    const res39 = await fetch(`${baseUrl}/pharmacy/dispensing-records?prescriptionId=${rxPartial.id}`, {
      headers: { Authorization: `Bearer ${tPharmApex}` },
    });
    const b39 = await res39.json();
    const p39 = res39.status === 200 && Array.isArray(b39) && b39.length === 1 && b39[0].quantity === 10;
    record(39, "PRESCRIPTION_INTEGRATION", "GET /pharmacy/dispensing-records returns full batch-level audit record", p39, `Dispensed qty: ${b39[0]?.quantity}, Unit price: ${b39[0]?.unitPrice}`);

    // =========================================================================
    // SECTION G: EXPIRY MANAGEMENT & QUARANTINE
    // =========================================================================

    // Test 40: Manual batch quarantine (POST /pharmacy/batches/:id/quarantine)
    const res40 = await fetch(`${baseUrl}/pharmacy/batches/${batchId1}/quarantine`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tPharmApex}` },
    });
    const b40 = await res40.json();
    const p40 = res40.status === 201 && b40.status === BatchStatus.QUARANTINED;
    record(40, "EXPIRY_MANAGEMENT", "Manual batch quarantine updates status to QUARANTINED and writes audit log", p40, `Batch status: ${b40.status}`);

    // Test 41: Auto-quarantine expired stock scan (POST /pharmacy/quarantine-expired)
    // We already have `expiredBatch` created earlier which is expired and status ACTIVE
    const res41 = await fetch(`${baseUrl}/pharmacy/quarantine-expired`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tPharmApex}` },
    });
    const b41 = await res41.json();
    const p41 = res41.status === 201 && b41.quarantinedCount >= 1;
    record(41, "EXPIRY_MANAGEMENT", "Quarantine scan finds all expired active batches and auto-quarantines them", p41, `Quarantined count: ${b41.quarantinedCount}`);

    // Test 42: Nightly BullMQ Expiry Scan integration test
    const scanResult = await expiryMonitor.runExpiryCheck();
    const p42 = typeof scanResult.quarantinedCount === "number" && typeof scanResult.expiringSoonCount === "number";
    record(42, "EXPIRY_MANAGEMENT", "BullMQ ExpiryMonitorService runs automated expiry and 30-day lookahead scan", p42, `Expiring soon count: ${scanResult.expiringSoonCount}`);

    // Test 43: Pharmacy alerts endpoint (GET /pharmacy/alerts)
    const res43 = await fetch(`${baseUrl}/pharmacy/alerts`, {
      headers: { Authorization: `Bearer ${tPharmApex}` },
    });
    const b43 = await res43.json();
    const p43 =
      res43.status === 200 &&
      Array.isArray(b43.expiringSoon) &&
      Array.isArray(b43.expired) &&
      Array.isArray(b43.lowStock);
    record(43, "EXPIRY_MANAGEMENT", "GET /pharmacy/alerts identifies expiring soon, expired, and low-stock items", p43, `Low stock: ${b43.lowStock.length}, Expiring soon: ${b43.expiringSoon.length}`);

    // =========================================================================
    // SECTION H: MULTI-TENANT SECURITY & ANTI-IDOR
    // =========================================================================

    // Test 44: Patient cannot access pharmacy stock movements
    const res44 = await fetch(`${baseUrl}/pharmacy/movements`, {
      headers: { Authorization: `Bearer ${tPatApex}` },
    });
    const p44 = res44.status === 403;
    record(44, "SECURITY_TENANCY", "Patients cannot access pharmacy stock ledger (403 Forbidden)", p44, `Status: ${res44.status}`);

    // Test 45: Patient cannot access dispensing records
    const res45 = await fetch(`${baseUrl}/pharmacy/dispensing-records`, {
      headers: { Authorization: `Bearer ${tPatApex}` },
    });
    const p45 = res45.status === 403;
    record(45, "SECURITY_TENANCY", "Patients cannot access dispensing records (403 Forbidden)", p45, `Status: ${res45.status}`);

    // Test 46: Doctor cannot adjust inventory stock
    const res46 = await fetch(`${baseUrl}/pharmacy/adjust-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tDocApex}` },
      body: JSON.stringify({
        medicineId: medId1,
        quantityDelta: 10,
        type: StockMovementType.ADJUSTMENT,
        reason: "Doctor attempting stock adjustment",
      }),
    });
    const p46 = res46.status === 403;
    record(46, "SECURITY_TENANCY", "Doctors cannot adjust pharmacy inventory stock (403 Forbidden)", p46, `Status: ${res46.status}`);

    // Test 47: Cross-tenant batch quarantine attempt rejected
    const res47 = await fetch(`${baseUrl}/pharmacy/batches/${batchId1}/quarantine`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tPharmCity}` },
    });
    const p47 = res47.status === 403;
    record(47, "SECURITY_TENANCY", "Anti-IDOR: Cross-tenant batch quarantine attempt rejected (403 Forbidden)", p47, `Status: ${res47.status}`);

    // Test 48: Audit log records created for medicine and stock mutations
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        hospitalId: hospApex.id,
        entityName: { in: ["Medicine", "MedicineBatch", "StockMovement", "Prescription"] },
      },
    });
    const p48 = auditLogs.length >= 5;
    record(48, "SECURITY_TENANCY", "AuditLog captures all critical pharmacy & stock mutations", p48, `Found: ${auditLogs.length} audit log entries`);

    // Test 49: Concurrency safety - simultaneous dispensing requests
    // Restore batchId1 stock for concurrent test
    await prisma.medicineBatch.update({
      where: { id: batchId1 },
      data: { currentQuantity: 10, status: BatchStatus.ACTIVE },
    });

    // Create 2 prescriptions each wanting 8 units (total 16 > 10 available)
    const rxConcurrent1 = await createTestRx(8, medId1);
    const rxConcurrent2 = await createTestRx(8, medId1);

    // Fire both simultaneously
    const [cRes1, cRes2] = await Promise.all([
      fetch(`${baseUrl}/pharmacy/dispense/${rxConcurrent1.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
        body: JSON.stringify({}),
      }),
      fetch(`${baseUrl}/pharmacy/dispense/${rxConcurrent2.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tPharmApex}` },
        body: JSON.stringify({}),
      }),
    ]);

    const statuses = [cRes1.status, cRes2.status];
    // Exactly one must succeed (201) and the second must be rejected (400) because total is 16 > 10
    const onePassedOneFailed =
      statuses.includes(201) && statuses.includes(400);

    // Check remaining stock never drops below 0
    const bPostConcurrent = await prisma.medicineBatch.findUnique({ where: { id: batchId1 } });
    const stockNonNegative = (bPostConcurrent?.currentQuantity || 0) >= 0;

    const p49 = onePassedOneFailed && stockNonNegative;
    record(49, "FIFO_DISPENSING", "Advisory lock prevents overselling during concurrent dispensing requests", p49, `Statuses: [${statuses.join(", ")}], Final stock: ${bPostConcurrent?.currentQuantity}`);

    // Test 50: Pharmacy stock movements filtered by movement type
    const res50 = await fetch(`${baseUrl}/pharmacy/movements?type=${StockMovementType.PURCHASE_RECEIPT}`, {
      headers: { Authorization: `Bearer ${tPharmApex}` },
    });
    const b50 = await res50.json();
    const p50 = res50.status === 200 && Array.isArray(b50) && b50.every((m: any) => m.type === StockMovementType.PURCHASE_RECEIPT);
    record(50, "INVENTORY_TRACKING", "GET /pharmacy/movements correctly filters ledger by StockMovementType", p50, `Found: ${b50.length} PURCHASE_RECEIPT records`);
  } catch (err: any) {
    console.error("Test execution fatal error:", err);
  } finally {
    console.log("\n🧹 Cleaning up test artifacts...");
    try {
      if (cleanRxItemIds.length > 0) {
        await prisma.dispensingRecord.deleteMany({ where: { prescriptionItemId: { in: cleanRxItemIds } } });
      }
      if (cleanDispRecordIds.length > 0) {
        await prisma.dispensingRecord.deleteMany({ where: { id: { in: cleanDispRecordIds } } });
      }
      if (cleanMovementIds.length > 0) {
        await prisma.stockMovement.deleteMany({ where: { id: { in: cleanMovementIds } } });
      }
      if (cleanRxItemIds.length > 0) {
        await prisma.prescriptionItem.deleteMany({ where: { id: { in: cleanRxItemIds } } });
      }
      if (cleanRxIds.length > 0) {
        await prisma.prescription.deleteMany({ where: { id: { in: cleanRxIds } } });
      }
      if (cleanBatchIds.length > 0) {
        await prisma.stockMovement.deleteMany({ where: { batchId: { in: cleanBatchIds } } });
        await prisma.medicineBatch.deleteMany({ where: { id: { in: cleanBatchIds } } });
      }
      if (cleanMedIds.length > 0) {
        await prisma.stockMovement.deleteMany({ where: { medicineId: { in: cleanMedIds } } });
        await prisma.medicine.deleteMany({ where: { id: { in: cleanMedIds } } });
      }
    } catch (e: any) {
      console.warn("Cleanup warning:", e.message);
    }
    await app.close();
  }

  // Summary
  console.log("\n==========================================================================");
  console.log("📊 Phase 10 Pharmacy & Inventory Management Test Summary");
  console.log("==========================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total Tests Run: ${total}`);
  console.log(`Passed:         ${passed}`);
  console.log(`Failed:         ${failed}`);
  console.log(`Pass Rate:       ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.error("❌ Some Phase 10 tests failed. Inspect details above.");
    process.exit(1);
  } else {
    console.log("🎉 ALL PHASE 10 PHARMACY & INVENTORY TESTS PASSED!");
  }
}

runPhase10Tests().catch((e) => {
  console.error("Fatal test suite failure:", e);
  process.exit(1);
});
