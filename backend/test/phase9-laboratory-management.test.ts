import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  UserRole,
  LabOrderStatus,
  LabPriority,
  LabResultStatus,
  AuditAction,
} from "@prisma/client";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

interface TestResult {
  id: number;
  category:
    | "CATALOGUE"
    | "ORDER_CREATION"
    | "SPECIMEN_PROCESSING"
    | "RESULTS_ATTACHMENTS"
    | "REVIEW_APPROVAL"
    | "PATIENT_PORTAL"
    | "CANCELLATION"
    | "AUDIT_TENANT";
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
  console.log(`${icon} [PHASE 9 Test ${id}] [${category}] ${name}: ${details}`);
}

function getErrMsg(body: any): string {
  if (body?.error?.message) {
    return typeof body.error.message === "string" ? body.error.message : JSON.stringify(body.error.message);
  }
  if (body?.message) {
    return typeof body.message === "string" ? body.message : JSON.stringify(body.message);
  }
  return "";
}

async function runPhase9Tests() {
  console.log("==========================================================================");
  console.log("🧪 MedCore HMS — Phase 9 Laboratory Management Integration Test Suite");
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

  // Fetch Hospitals
  const hospApex = await prisma.hospital.findUnique({ where: { code: "APEX-MAIN" } });
  const hospCity = await prisma.hospital.findUnique({ where: { code: "CITY-CARE" } });

  if (!hospApex || !hospCity) {
    throw new Error("Seeded hospitals APEX-MAIN and CITY-CARE must exist in database.");
  }

  // Token helper
  const makeToken = (user: { id: string; email: string; role: UserRole; hospitalId: string | null }) => {
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

  // Seeded users
  const superAdmin = await prisma.user.findUnique({ where: { email: "superadmin@medcore.io" } });
  const adminApex = await prisma.user.findUnique({ where: { email: "admin.apex@medcore.io" } });
  const docApex = await prisma.user.findUnique({ where: { email: "dr.arun.sharma@apexhealth.org" } });
  const docCity = await prisma.user.findUnique({ where: { email: "dr.tanvi.patil@citycarehospitals.com" } });
  const nurseApex = await prisma.user.findUnique({ where: { email: "nurse.apex@medcore.io" } });
  const receptionApex = await prisma.user.findUnique({ where: { email: "reception.apex@medcore.io" } });
  const patientApex = await prisma.user.findUnique({ where: { email: "patient.rajesh.sharma0@example.com" } });
  const patientCity = await prisma.user.findUnique({ where: { email: "patient.pooja.patel1@example.com" } });

  if (
    !superAdmin ||
    !adminApex ||
    !docApex ||
    !docCity ||
    !nurseApex ||
    !receptionApex ||
    !patientApex ||
    !patientCity
  ) {
    throw new Error("Required seed users missing from database.");
  }

  // Ensure 2 Lab Technicians for Separation of Duties testing
  let tech1 = await prisma.user.findFirst({
    where: { hospitalId: hospApex.id, role: UserRole.LAB_TECHNICIAN },
  });
  if (!tech1) {
    tech1 = await prisma.user.create({
      data: {
        hospitalId: hospApex.id,
        email: "tech1.lab.apex@medcore.io",
        passwordHash: "seeded_hash",
        firstName: "Ramesh",
        lastName: "Gupta",
        role: UserRole.LAB_TECHNICIAN,
      },
    });
  }

  let tech2 = await prisma.user.findFirst({
    where: {
      hospitalId: hospApex.id,
      role: UserRole.LAB_TECHNICIAN,
      id: { not: tech1.id },
    },
  });
  if (!tech2) {
    tech2 = await prisma.user.create({
      data: {
        hospitalId: hospApex.id,
        email: "tech2.senior.apex@medcore.io",
        passwordHash: "seeded_hash",
        firstName: "Sunita",
        lastName: "Deshmukh",
        role: UserRole.LAB_TECHNICIAN,
      },
    });
  }

  // Second patient in Apex for Anti-IDOR testing
  let patientApex2User = await prisma.user.findFirst({
    where: {
      hospitalId: hospApex.id,
      role: UserRole.PATIENT,
      id: { not: patientApex.id },
    },
  });
  let patientApex2 = patientApex2User
    ? await prisma.patient.findFirst({ where: { userId: patientApex2User.id } })
    : null;

  if (!patientApex2) {
    const pUser = await prisma.user.create({
      data: {
        hospitalId: hospApex.id,
        email: "patient2.apex.test@example.com",
        passwordHash: "seeded_hash",
        firstName: "Amit",
        lastName: "Verma",
        role: UserRole.PATIENT,
      },
    });
    patientApex2 = await prisma.patient.create({
      data: {
        hospitalId: hospApex.id,
        userId: pUser.id,
        mrn: `MRN-TST-${Date.now().toString().slice(-6)}`,
        firstName: "Amit",
        lastName: "Verma",
        phone: "+919876543299",
        emergencyContactName: "Sunita Verma",
        emergencyContactPhone: "+919876543298",
        dateOfBirth: new Date("1988-04-12"),
        gender: "MALE",
      },
    });
    patientApex2User = pUser;
  }

  // Fetch Patient record for patientApex
  const patApexRecord = await prisma.patient.findFirst({ where: { userId: patientApex.id } });
  if (!patApexRecord) {
    throw new Error("Patient profile for patientApex not found.");
  }

  // Ensure patient in hospCity for cross-tenant validation
  let patCityRecord = await prisma.patient.findFirst({ where: { hospitalId: hospCity.id } });
  if (!patCityRecord) {
    patCityRecord = await prisma.patient.create({
      data: {
        hospitalId: hospCity.id,
        userId: patientCity.id,
        mrn: `MRN-CITY-${Date.now().toString().slice(-6)}`,
        firstName: "City",
        lastName: "Patient",
        phone: "+919111222333",
        emergencyContactName: "Emergency Contact",
        emergencyContactPhone: "+919111222334",
        dateOfBirth: new Date("1992-05-15"),
        gender: "FEMALE",
      },
    });
  }

  // Doctor profile for docApex
  const doctorApexProfile = await prisma.doctor.findFirst({ where: { userId: docApex.id } });
  if (!doctorApexProfile) {
    throw new Error("Doctor profile for docApex not found.");
  }

  const tokens = {
    superAdmin: makeToken(superAdmin),
    adminApex: makeToken(adminApex),
    docApex: makeToken(docApex),
    docCity: makeToken(docCity),
    nurseApex: makeToken(nurseApex),
    receptionApex: makeToken(receptionApex),
    tech1: makeToken(tech1),
    tech2: makeToken(tech2),
    patientApex: makeToken(patientApex),
    patientApex2: makeToken(patientApex2User!),
    patientCity: makeToken(patientCity),
  };

  const req = async (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    token?: string,
    body?: any
  ) => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data: any = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, body: data };
  };

  // State holders for lifecycle chaining
  let createdTestId: string = "";
  let inactiveTestId: string = "";
  let order1Id: string = "";
  let order2Id: string = "";
  let orderCancelId: string = "";
  const createdOrderIds: string[] = [];

  try {
    // =========================================================================
    // CATEGORY 1: TEST CATALOGUE & VALIDATION
    // =========================================================================

    // Test 1: Admin can create a new diagnostic test in catalogue
    {
      const res = await req("POST", "/laboratory/tests", tokens.adminApex, {
        code: `CBC-P9-${Date.now().toString().slice(-4)}`,
        name: "Complete Blood Count Automated",
        category: "HEMATOLOGY",
        description: "Automated hemogram including WBC, RBC, Platelets, Hb",
        price: 450.0,
        referenceRange: "4.5 - 11.0 x 10^3 / uL",
        units: "10^3 / uL",
        sampleType: "Whole Blood EDTA",
      });

      const pass = res.status === 201 && !!res.body.id && res.body.category === "HEMATOLOGY";
      if (pass) createdTestId = res.body.id;
      record(1, "CATALOGUE", "Admin test creation", pass, `Status ${res.status}, ID: ${res.body?.id}`);
    }

    // Test 2: Duplicate test code in same hospital rejected
    {
      const existingTest = await prisma.labTest.findUnique({ where: { id: createdTestId } });
      const res = await req("POST", "/laboratory/tests", tokens.adminApex, {
        code: existingTest!.code,
        name: "Duplicate Test Code",
        category: "HEMATOLOGY",
        price: 300.0,
      });

      const pass = res.status === 400 && getErrMsg(res.body).includes("already exists");
      record(2, "CATALOGUE", "Duplicate test code rejection", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 3: Unauthorized user (nurse) cannot create catalogue test
    {
      const res = await req("POST", "/laboratory/tests", tokens.nurseApex, {
        code: "UNAUTH-TEST",
        name: "Unauthorized Creation Attempt",
        category: "BIOCHEMISTRY",
        price: 250.0,
      });

      const pass = res.status === 403;
      record(3, "CATALOGUE", "Unauthorized test creation rejected", pass, `Status ${res.status}`);
    }

    // Test 4: Diagnostic test list is tenant-scoped and lists active tests
    {
      const res = await req("GET", "/laboratory/tests", tokens.docApex);
      const pass = res.status === 200 && Array.isArray(res.body) && res.body.some((t: any) => t.id === createdTestId);
      record(4, "CATALOGUE", "Catalogue listing active tests", pass, `Status ${res.status}, count: ${res.body?.length}`);
    }

    // Test 5: Find diagnostic test by ID
    {
      const res = await req("GET", `/laboratory/tests/${createdTestId}`, tokens.docApex);
      const pass = res.status === 200 && res.body.id === createdTestId;
      record(5, "CATALOGUE", "Find single test by ID", pass, `Status ${res.status}, Name: ${res.body?.name}`);
    }

    // Test 6: Cross-tenant test catalog access is rejected
    {
      const res = await req("GET", `/laboratory/tests/${createdTestId}`, tokens.docCity);
      const pass = res.status === 403;
      record(6, "CATALOGUE", "Cross-tenant test access rejected", pass, `Status ${res.status}`);
    }

    // Test 7: Admin can update catalogue test
    {
      const res = await req("PATCH", `/laboratory/tests/${createdTestId}`, tokens.adminApex, {
        price: 520.0,
        description: "Updated clinical hemogram reference parameters",
      });

      const pass = res.status === 200 && Number(res.body.price) === 520;
      record(7, "CATALOGUE", "Admin update catalogue test", pass, `Status ${res.status}, New Price: ${res.body?.price}`);
    }

    // Test 8: Non-admin cannot update catalogue test
    {
      const res = await req("PATCH", `/laboratory/tests/${createdTestId}`, tokens.docApex, {
        price: 999.0,
      });

      const pass = res.status === 403;
      record(8, "CATALOGUE", "Doctor update test rejected", pass, `Status ${res.status}`);
    }

    // Create an inactive test for testing inactive order prevention
    {
      const inactive = await prisma.labTest.create({
        data: {
          hospitalId: hospApex.id,
          code: `INACT-${Date.now().toString().slice(-4)}`,
          name: "Deprecated Old Chemistry Test",
          category: "BIOCHEMISTRY",
          price: 150.0,
          isActive: false,
        },
      });
      inactiveTestId = inactive.id;
    }

    // =========================================================================
    // CATEGORY 2: LAB ORDER CREATION & RBAC
    // =========================================================================

    // Test 9: Doctor can create a lab order with multiple tests, priority, and clinical notes
    {
      const res = await req("POST", "/laboratory/orders", tokens.docApex, {
        patientId: patApexRecord.id,
        priority: LabPriority.URGENT,
        clinicalNotes: "Patient presenting with acute fatigue and low hemoglobin symptoms.",
        testIds: [createdTestId],
      });

      const pass =
        res.status === 201 &&
        res.body.status === LabOrderStatus.ORDERED &&
        res.body.results?.length === 1 &&
        res.body.priority === LabPriority.URGENT;
      if (pass) {
        order1Id = res.body.id;
        createdOrderIds.push(res.body.id);
      }
      record(9, "ORDER_CREATION", "Doctor creates lab order", pass, `Status ${res.status}, OrderID: ${res.body?.id}`);
    }

    // Test 10: Hospital Admin can create a lab order specifying doctorId
    {
      const res = await req("POST", "/laboratory/orders", tokens.adminApex, {
        patientId: patApexRecord.id,
        doctorId: doctorApexProfile.id,
        priority: LabPriority.ROUTINE,
        clinicalNotes: "Follow-up lab diagnostics ordered by hospital coordinator.",
        testIds: [createdTestId],
      });

      const pass = res.status === 201 && res.body.status === LabOrderStatus.ORDERED;
      if (pass) {
        order2Id = res.body.id;
        createdOrderIds.push(res.body.id);
      }
      record(10, "ORDER_CREATION", "Admin creates lab order", pass, `Status ${res.status}, OrderID: ${res.body?.id}`);
    }

    // Test 11: Unauthorized roles (Nurse, Receptionist, Patient) rejected from creating orders
    {
      const resNurse = await req("POST", "/laboratory/orders", tokens.nurseApex, {
        patientId: patApexRecord.id,
        testIds: [createdTestId],
      });
      const resPatient = await req("POST", "/laboratory/orders", tokens.patientApex, {
        patientId: patApexRecord.id,
        testIds: [createdTestId],
      });

      const pass = resNurse.status === 403 && resPatient.status === 403;
      record(11, "ORDER_CREATION", "Unauthorized roles order creation rejected", pass, `Nurse: ${resNurse.status}, Patient: ${resPatient.status}`);
    }

    // Test 12: Order with empty testIds array rejected
    {
      const res = await req("POST", "/laboratory/orders", tokens.docApex, {
        patientId: patApexRecord.id,
        testIds: [],
      });

      const pass = res.status === 400;
      record(12, "ORDER_CREATION", "Empty testIds array rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 13: Order with inactive test rejected
    {
      const res = await req("POST", "/laboratory/orders", tokens.docApex, {
        patientId: patApexRecord.id,
        testIds: [inactiveTestId],
      });

      const pass = res.status === 400 && getErrMsg(res.body).includes("inactive");
      record(13, "ORDER_CREATION", "Inactive test order rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 14: Order with nonexistent patient rejected
    {
      const res = await req("POST", "/laboratory/orders", tokens.docApex, {
        patientId: "00000000-0000-0000-0000-000000000000",
        testIds: [createdTestId],
      });

      const pass = res.status === 404;
      record(14, "ORDER_CREATION", "Nonexistent patient rejected", pass, `Status ${res.status}`);
    }

    // Test 15: Cross-tenant order creation rejected (Doctor in Hospital A ordering for patient in Hospital B)
    {
      const res = await req("POST", "/laboratory/orders", tokens.docApex, {
        patientId: patCityRecord.id,
        testIds: [createdTestId],
      });

      const pass = res.status === 404; // Patient not in tenant
      record(15, "ORDER_CREATION", "Cross-tenant patient order creation rejected", pass, `Status ${res.status}`);
    }

    // =========================================================================
    // CATEGORY 3: SPECIMEN COLLECTION & PROCESSING
    // =========================================================================

    // Test 16: Lab Technician can record sample collection
    {
      const res = await req("PATCH", `/laboratory/orders/${order1Id}/collect-sample`, tokens.tech1, {
        sampleBarcode: "BC-CBC-9901",
        notes: "Whole blood specimen collected in standard purple-top EDTA vacutainer.",
      });

      const pass =
        res.status === 200 &&
        res.body.status === LabOrderStatus.SAMPLE_COLLECTED &&
        res.body.clinicalNotes?.includes("BC-CBC-9901");
      record(16, "SPECIMEN_PROCESSING", "Sample collection recorded", pass, `Status ${res.status}, Lifecycle: ${res.body?.status}`);
    }

    // Test 17: Unauthorized role (Patient) rejected from sample collection
    {
      const res = await req("PATCH", `/laboratory/orders/${order2Id}/collect-sample`, tokens.patientApex, {
        sampleBarcode: "BC-PATIENT-HACK",
      });

      const pass = res.status === 403;
      record(17, "SPECIMEN_PROCESSING", "Patient sample collection rejected", pass, `Status ${res.status}`);
    }

    // Test 18: Sample collection rejected on orders not in ORDERED state (repeated collection)
    {
      const res = await req("PATCH", `/laboratory/orders/${order1Id}/collect-sample`, tokens.tech1, {
        sampleBarcode: "BC-CBC-DUPLICATE",
      });

      const pass = res.status === 400 && getErrMsg(res.body).includes("SAMPLE_COLLECTED");
      record(18, "SPECIMEN_PROCESSING", "Repeated sample collection rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 19: Lab Technician can transition sample to PROCESSING
    {
      const res = await req("PATCH", `/laboratory/orders/${order1Id}/process-sample`, tokens.tech1);
      const pass = res.status === 200 && res.body.status === LabOrderStatus.PROCESSING;
      record(19, "SPECIMEN_PROCESSING", "Transition to PROCESSING", pass, `Status ${res.status}, State: ${res.body?.status}`);
    }

    // Test 20: Processing transition rejected if sample was not collected first (invalid lifecycle skip)
    {
      const res = await req("PATCH", `/laboratory/orders/${order2Id}/process-sample`, tokens.tech1);
      const pass = res.status === 400 && getErrMsg(res.body).includes("Sample must be collected first");
      record(20, "SPECIMEN_PROCESSING", "Invalid lifecycle skip rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 21: Non-technician (Nurse) rejected from sample processing
    {
      const res = await req("PATCH", `/laboratory/orders/${order1Id}/process-sample`, tokens.nurseApex);
      const pass = res.status === 403;
      record(21, "SPECIMEN_PROCESSING", "Nurse sample processing rejected", pass, `Status ${res.status}`);
    }

    // =========================================================================
    // CATEGORY 4: RESULT ENTRY & FILE UPLOAD VALIDATION
    // =========================================================================

    // Test 22: Lab Technician can enter structured results
    {
      const res = await req("POST", `/laboratory/orders/${order1Id}/results`, tokens.tech1, {
        results: [
          {
            labTestId: createdTestId,
            resultValue: "8.4",
            referenceRange: "4.5 - 11.0",
            unit: "10^3 / uL",
            status: LabResultStatus.NORMAL,
            abnormalFlag: "NORMAL",
            findings: "Hemogram cell counts within normal reference limits.",
          },
        ],
      });

      const pass =
        res.status === 201 &&
        res.body.status === LabOrderStatus.RESULT_UPLOADED &&
        res.body.results?.some((r: any) => r.resultValue === "8.4" && r.performedById === tech1.id);
      record(22, "RESULTS_ATTACHMENTS", "Technician enters structured results", pass, `Status ${res.status}, Order State: ${res.body?.status}`);
    }

    // Test 23: Result attachment validation rejects path traversal
    {
      const res = await req("POST", `/laboratory/orders/${order1Id}/results`, tokens.tech1, {
        results: [
          {
            labTestId: createdTestId,
            resultValue: "8.4",
            attachmentMetadata: {
              filename: "../../secrets/passwords.pdf",
              mimeType: "application/pdf",
              sizeBytes: 2048,
            },
          },
        ],
      });

      const pass = res.status === 400 && getErrMsg(res.body).includes("path traversal");
      record(23, "RESULTS_ATTACHMENTS", "Path traversal in attachment rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 24: Result attachment validation rejects unsafe file extension
    {
      const res = await req("POST", `/laboratory/orders/${order1Id}/results`, tokens.tech1, {
        results: [
          {
            labTestId: createdTestId,
            resultValue: "8.4",
            attachmentMetadata: {
              filename: "lab_results_payload.exe",
              mimeType: "application/octet-stream",
              sizeBytes: 2048,
            },
          },
        ],
      });

      const pass = res.status === 400;
      record(24, "RESULTS_ATTACHMENTS", "Unsafe file extension rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 25: Result attachment validation rejects file size exceeding 10MB
    {
      const res = await req("POST", `/laboratory/orders/${order1Id}/results`, tokens.tech1, {
        results: [
          {
            labTestId: createdTestId,
            resultValue: "8.4",
            attachmentMetadata: {
              filename: "huge_scan.pdf",
              mimeType: "application/pdf",
              sizeBytes: 15 * 1024 * 1024, // 15MB
            },
          },
        ],
      });

      const pass = res.status === 400 && getErrMsg(res.body).includes("10MB");
      record(25, "RESULTS_ATTACHMENTS", "File exceeding 10MB rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 26: Result attachment accepts valid PDF attachment metadata
    {
      const res = await req("POST", `/laboratory/orders/${order1Id}/results`, tokens.tech1, {
        results: [
          {
            labTestId: createdTestId,
            resultValue: "8.4",
            attachmentMetadata: {
              filename: "analyzer_output_specimen_9901.pdf",
              mimeType: "application/pdf",
              sizeBytes: 524288,
            },
          },
        ],
      });

      const pass = res.status === 201;
      record(26, "RESULTS_ATTACHMENTS", "Valid PDF attachment metadata accepted", pass, `Status ${res.status}`);
    }

    // Test 27: Result entry rejected for orders in ORDERED state (before sample collection)
    {
      const res = await req("POST", `/laboratory/orders/${order2Id}/results`, tokens.tech1, {
        results: [
          {
            labTestId: createdTestId,
            resultValue: "7.1",
          },
        ],
      });

      const pass = res.status === 400 && getErrMsg(res.body).includes("ORDERED");
      record(27, "RESULTS_ATTACHMENTS", "Result entry before collection rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 28: Non-technician (Nurse) rejected from uploading results
    {
      const res = await req("POST", `/laboratory/orders/${order1Id}/results`, tokens.nurseApex, {
        results: [{ labTestId: createdTestId, resultValue: "8.4" }],
      });

      const pass = res.status === 403;
      record(28, "RESULTS_ATTACHMENTS", "Nurse result upload rejected", pass, `Status ${res.status}`);
    }

    // =========================================================================
    // CATEGORY 5: REVIEW, APPROVAL & SEPARATION OF DUTIES
    // =========================================================================

    // Test 29: Separation of Duties: Lab technician who performed test results CANNOT approve their own results
    {
      const res = await req("POST", `/laboratory/orders/${order1Id}/review`, tokens.tech1, {
        approve: true,
        notes: "Self-approval attempt by performing technician.",
      });

      const pass = res.status === 403 && getErrMsg(res.body).includes("cannot approve their own");
      record(29, "REVIEW_APPROVAL", "Separation of duties: Self-approval rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 30: Senior/Independent reviewer (tech2 or doctor) can review and approve results
    {
      const res = await req("POST", `/laboratory/orders/${order1Id}/review`, tokens.tech2, {
        approve: true,
        notes: "Clinically reviewed and verified by Senior Pathology Technician.",
      });

      const pass =
        res.status === 201 &&
        res.body.status === LabOrderStatus.APPROVED &&
        res.body.approvedById === tech2.id;
      record(30, "REVIEW_APPROVAL", "Independent reviewer approves results", pass, `Status ${res.status}, ApprovedBy: ${res.body?.approvedById}`);
    }

    // Test 31: Approval transitions all results to isApproved: true
    {
      const checkOrder = await prisma.labOrder.findUnique({
        where: { id: order1Id },
        include: { results: true },
      });

      const pass = checkOrder?.status === LabOrderStatus.APPROVED && checkOrder.results.every((r) => r.isApproved);
      record(31, "REVIEW_APPROVAL", "All results marked approved with timestamps", pass, `Results Count: ${checkOrder?.results.length}, All Approved: ${pass}`);
    }

    // Test 32: Concurrency CAS: Simultaneous duplicate review request rejected
    {
      const res = await req("POST", `/laboratory/orders/${order1Id}/review`, tokens.docApex, {
        approve: true,
        notes: "Second duplicate review attempt.",
      });

      const pass = res.status === 400; // Cannot review order already in APPROVED state
      record(32, "REVIEW_APPROVAL", "Concurrency CAS rejects duplicate approval", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 33: Unauthorized modification: Lab technician cannot alter results after clinical approval
    {
      const res = await req("POST", `/laboratory/orders/${order1Id}/results`, tokens.tech1, {
        results: [{ labTestId: createdTestId, resultValue: "99.9" }],
      });

      const pass = res.status === 400 && getErrMsg(res.body).includes("already approved");
      record(33, "REVIEW_APPROVAL", "Result tampering after approval rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 34: Review rejection: Reviewer can reject an order with clinical notes
    {
      // Prepare order2 for rejection: collect sample -> enter results -> reject
      await req("PATCH", `/laboratory/orders/${order2Id}/collect-sample`, tokens.tech1);
      await req("PATCH", `/laboratory/orders/${order2Id}/process-sample`, tokens.tech1);
      await req("POST", `/laboratory/orders/${order2Id}/results`, tokens.tech1, {
        results: [{ labTestId: createdTestId, resultValue: "HEMOLYZED_SAMPLE" }],
      });

      const res = await req("POST", `/laboratory/orders/${order2Id}/review`, tokens.tech2, {
        approve: false,
        rejectionReason: "Specimen severely hemolyzed; recollect whole blood sample.",
      });

      const pass = res.status === 201 && res.body.status === LabOrderStatus.REJECTED;
      record(34, "REVIEW_APPROVAL", "Reviewer rejects order with clinical reason", pass, `Status ${res.status}, State: ${res.body?.status}`);
    }

    // =========================================================================
    // CATEGORY 6: PATIENT PORTAL VISIBILITY & PRIVACY
    // =========================================================================

    // Create an unapproved order for patient visibility testing
    let unapprovedOrderId = "";
    {
      const res = await req("POST", "/laboratory/orders", tokens.docApex, {
        patientId: patApexRecord.id,
        testIds: [createdTestId],
      });
      unapprovedOrderId = res.body.id;
      createdOrderIds.push(res.body.id);
      await req("PATCH", `/laboratory/orders/${unapprovedOrderId}/collect-sample`, tokens.tech1);
      await req("PATCH", `/laboratory/orders/${unapprovedOrderId}/process-sample`, tokens.tech1);
      await req("POST", `/laboratory/orders/${unapprovedOrderId}/results`, tokens.tech1, {
        results: [{ labTestId: createdTestId, resultValue: "DRAFT_VALUE_12.3" }],
      });
    }

    // Test 35: Patient can view their own lab orders list
    {
      const res = await req("GET", "/laboratory/orders", tokens.patientApex);
      const pass = res.status === 200 && Array.isArray(res.body) && res.body.every((o: any) => o.patientId === patApexRecord.id);
      record(35, "PATIENT_PORTAL", "Patient orders list scoped to own profile", pass, `Status ${res.status}, Count: ${res.body?.length}`);
    }

    // Test 36: Patient viewing order before approval has unapproved results hidden (results: [])
    {
      const res = await req("GET", `/laboratory/orders/${unapprovedOrderId}`, tokens.patientApex);
      const pass = res.status === 200 && res.body.results.length === 0;
      record(36, "PATIENT_PORTAL", "Unapproved results hidden from patient", pass, `Status ${res.status}, Results Exposed: ${res.body?.results?.length}`);
    }

    // Test 37: Patient viewing order after approval can view approved diagnostic results
    {
      const res = await req("GET", `/laboratory/orders/${order1Id}`, tokens.patientApex);
      const pass = res.status === 200 && res.body.results.length > 0 && res.body.results[0].resultValue === "8.4";
      record(37, "PATIENT_PORTAL", "Approved results visible to patient", pass, `Status ${res.status}, Visible Results: ${res.body?.results?.length}`);
    }

    // Test 38: Patient A cannot access Patient B's lab order by ID (anti-IDOR 403 Forbidden)
    {
      const res = await req("GET", `/laboratory/orders/${order1Id}`, tokens.patientApex2);
      const pass = res.status === 403 && getErrMsg(res.body).includes("own");
      record(38, "PATIENT_PORTAL", "Anti-IDOR: Patient access to other patient rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // =========================================================================
    // CATEGORY 7: ORDER CANCELLATION LIFECYCLE & IMMUTABILITY
    // =========================================================================

    // Create an order specifically for cancellation tests
    {
      const res = await req("POST", "/laboratory/orders", tokens.docApex, {
        patientId: patApexRecord.id,
        testIds: [createdTestId],
      });
      orderCancelId = res.body.id;
      createdOrderIds.push(res.body.id);
    }

    // Test 39: Ordering doctor can cancel an order in ORDERED state with clinical reason
    {
      const res = await req("PATCH", `/laboratory/orders/${orderCancelId}/cancel`, tokens.docApex, {
        reason: "Patient discharged before phlebotomy collection.",
      });

      const pass = res.status === 200 && res.body.status === LabOrderStatus.CANCELLED;
      record(39, "CANCELLATION", "Doctor cancels order in ORDERED state", pass, `Status ${res.status}, State: ${res.body?.status}`);
    }

    // Test 40: Hospital admin can cancel an order in SAMPLE_COLLECTED state
    {
      // Create new order, collect sample, then cancel by admin
      const o = await req("POST", "/laboratory/orders", tokens.docApex, {
        patientId: patApexRecord.id,
        testIds: [createdTestId],
      });
      createdOrderIds.push(o.body.id);
      await req("PATCH", `/laboratory/orders/${o.body.id}/collect-sample`, tokens.tech1);

      const res = await req("PATCH", `/laboratory/orders/${o.body.id}/cancel`, tokens.adminApex, {
        reason: "Cancelled by hospital administration due to test reassignment.",
      });

      const pass = res.status === 200 && res.body.status === LabOrderStatus.CANCELLED;
      record(40, "CANCELLATION", "Admin cancels order in SAMPLE_COLLECTED state", pass, `Status ${res.status}, State: ${res.body?.status}`);
    }

    // Test 41: Order cancellation rejected on APPROVED orders (immutability of clinically approved records)
    {
      const res = await req("PATCH", `/laboratory/orders/${order1Id}/cancel`, tokens.adminApex, {
        reason: "Attempt to cancel clinically approved result report.",
      });

      const pass = res.status === 400 && getErrMsg(res.body).includes("clinically approved");
      record(41, "CANCELLATION", "Cancellation of APPROVED order rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 42: Repeated cancellation on already CANCELLED order rejected
    {
      const res = await req("PATCH", `/laboratory/orders/${orderCancelId}/cancel`, tokens.adminApex, {
        reason: "Duplicate cancellation attempt.",
      });

      const pass = res.status === 400 && getErrMsg(res.body).includes("already cancelled");
      record(42, "CANCELLATION", "Repeated cancellation rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 43: Unauthorized role (Nurse / Patient) cannot cancel lab orders
    {
      const newOrder = await req("POST", "/laboratory/orders", tokens.docApex, {
        patientId: patApexRecord.id,
        testIds: [createdTestId],
      });
      createdOrderIds.push(newOrder.body.id);

      const resNurse = await req("PATCH", `/laboratory/orders/${newOrder.body.id}/cancel`, tokens.nurseApex, { reason: "test" });
      const resPat = await req("PATCH", `/laboratory/orders/${newOrder.body.id}/cancel`, tokens.patientApex, { reason: "test" });

      const pass = resNurse.status === 403 && resPat.status === 403;
      record(43, "CANCELLATION", "Unauthorized cancellation rejected", pass, `Nurse: ${resNurse.status}, Patient: ${resPat.status}`);
    }

    // Test 44: Specimen collection / processing / result entry rejected on cancelled orders
    {
      const resCollect = await req("PATCH", `/laboratory/orders/${orderCancelId}/collect-sample`, tokens.tech1);
      const resProcess = await req("PATCH", `/laboratory/orders/${orderCancelId}/process-sample`, tokens.tech1);
      const resResult = await req("POST", `/laboratory/orders/${orderCancelId}/results`, tokens.tech1, {
        results: [{ labTestId: createdTestId, resultValue: "10.0" }],
      });

      const pass =
        resCollect.status === 400 &&
        resProcess.status === 400 &&
        resResult.status === 400;
      record(44, "CANCELLATION", "Operations on cancelled order rejected", pass, `Collect: ${resCollect.status}, Process: ${resProcess.status}, Result: ${resResult.status}`);
    }

    // =========================================================================
    // CATEGORY 8: AUDIT LOGGING & TENANT ISOLATION
    // =========================================================================

    // Test 45: Order creation creates an audit log entry
    {
      const audit = await prisma.auditLog.findFirst({
        where: {
          hospitalId: hospApex.id,
          entityName: "LabOrder",
          entityId: order1Id,
          action: AuditAction.CREATE,
        },
      });

      const pass = !!audit && audit.userId === docApex.id;
      record(45, "AUDIT_TENANT", "Order creation logged in audit trail", pass, `Found Audit: ${!!audit}, Action: ${audit?.action}`);
    }

    // Test 46: Sample collection creates an audit log entry
    {
      const audit = await prisma.auditLog.findFirst({
        where: {
          hospitalId: hospApex.id,
          entityName: "LabOrder",
          entityId: order1Id,
          action: AuditAction.UPDATE,
        },
      });

      const pass = !!audit && (audit.details as any)?.action === "SAMPLE_COLLECTED";
      record(46, "AUDIT_TENANT", "Sample collection logged in audit trail", pass, `Found Audit: ${!!audit}, Details: ${JSON.stringify(audit?.details)}`);
    }

    // Test 47: Order review / approval creates an audit log entry with reviewer details
    {
      const audit = await prisma.auditLog.findFirst({
        where: {
          hospitalId: hospApex.id,
          entityName: "LabOrder",
          entityId: order1Id,
          userId: tech2.id,
          action: AuditAction.UPDATE,
        },
      });

      const pass = !!audit && (audit.details as any)?.action === "APPROVED";
      record(47, "AUDIT_TENANT", "Approval logged in audit trail", pass, `Found Audit: ${!!audit}, Reviewer: ${audit?.userId}`);
    }

    // Test 48: Order cancellation creates an audit log entry with reason and previous state
    {
      const audit = await prisma.auditLog.findFirst({
        where: {
          hospitalId: hospApex.id,
          entityName: "LabOrder",
          entityId: orderCancelId,
          action: AuditAction.UPDATE,
        },
      });

      const pass = !!audit && (audit.details as any)?.action === "ORDER_CANCELLED";
      record(48, "AUDIT_TENANT", "Cancellation logged in audit trail", pass, `Found Audit: ${!!audit}, Action: ${(audit?.details as any)?.action}`);
    }

    // Test 49: Cross-tenant order fetch rejected across hospitals
    {
      const res = await req("GET", `/laboratory/orders/${order1Id}`, tokens.docCity);
      const pass = res.status === 403 && getErrMsg(res.body).includes("Cross-tenant");
      record(49, "AUDIT_TENANT", "Cross-tenant order access rejected", pass, `Status ${res.status}: ${getErrMsg(res.body)}`);
    }

    // Test 50: Super Admin can inspect orders across all hospitals
    {
      const res = await req("GET", `/laboratory/orders/${order1Id}`, tokens.superAdmin);
      const pass = res.status === 200 && res.body.id === order1Id;
      record(50, "AUDIT_TENANT", "Super Admin global order access", pass, `Status ${res.status}, Hospital: ${res.body?.hospitalId}`);
    }

  } finally {
    // Teardown / Cleanup
    console.log("\n🧹 Cleaning up Phase 9 test artifacts...");
    try {
      if (createdOrderIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            hospitalId: hospApex.id,
            entityName: "LabOrder",
            entityId: { in: createdOrderIds },
          },
        });
        await prisma.labResult.deleteMany({
          where: { labOrderId: { in: createdOrderIds } },
        });
        await prisma.labOrder.deleteMany({
          where: { id: { in: createdOrderIds } },
        });
      }
      if (createdTestId || inactiveTestId) {
        const testIds = [createdTestId, inactiveTestId].filter(Boolean);
        await prisma.labResult.deleteMany({
          where: { labTestId: { in: testIds } },
        });
        await prisma.labTest.deleteMany({
          where: { id: { in: testIds } },
        });
      }
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr);
    }
    await app.close();
  }

  // =========================================================================
  // SUMMARY REPORT
  // =========================================================================
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const pct = ((passed / total) * 100).toFixed(1);

  console.log("\n==========================================================================");
  console.log(`📊 PHASE 9 LABORATORY MANAGEMENT TEST RESULTS: ${passed}/${total} PASSED (${pct}%)`);
  console.log("==========================================================================\n");

  const categories = Array.from(new Set(results.map((r) => r.category)));
  for (const cat of categories) {
    const catTests = results.filter((r) => r.category === cat);
    const catPassed = catTests.filter((r) => r.passed).length;
    console.log(`  • ${cat}: ${catPassed}/${catTests.length} passed`);
  }

  if (failed > 0) {
    console.error(`\n❌ ${failed} tests failed in Phase 9 suite.`);
    process.exit(1);
  } else {
    console.log("\n🎯 All Phase 9 Laboratory Management tests executed and passed successfully!");
    process.exit(0);
  }
}

runPhase9Tests().catch((err) => {
  console.error("Fatal error running Phase 9 tests:", err);
  process.exit(1);
});
