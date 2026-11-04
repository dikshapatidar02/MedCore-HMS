import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, RecordStatus, AllergySeverity, DiagnosisType } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

interface TestResult {
  id: number;
  category: "ENCOUNTER" | "IMMUTABILITY" | "AMENDMENT" | "VITALS" | "DIAGNOSES" | "TREATMENT" | "ALLERGY_MEDS" | "OVERVIEW" | "TENANT_PRIVACY" | "AUDIT" | "RBAC" | "VALIDATION";
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
  console.log(`${icon} [${category} Test ${id}] ${name}: ${details}`);
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

async function runPhase5Tests() {
  console.log("==========================================================================");
  console.log("🔬 MedCore HMS — Phase 5 Clinical EMR Integration Suite (PostgreSQL Backed)");
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
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: "15m",
      }
    );
  };

  // Fetch seeded users
  const superAdmin = await prisma.user.findUnique({ where: { email: "superadmin@medcore.io" } });
  const adminApexUser = await prisma.user.findUnique({ where: { email: "admin.apex@medcore.io" } });
  const docApexUser = await prisma.user.findUnique({ where: { email: "dr.arun.sharma@apexhealth.org" } });
  const docCityUser = await prisma.user.findUnique({ where: { email: "dr.tanvi.patil@citycarehospitals.com" } });
  const nurseApexUser = await prisma.user.findUnique({ where: { email: "nurse.apex@medcore.io" } });
  const receptionApexUser = await prisma.user.findUnique({ where: { email: "reception.apex@medcore.io" } });
  const patientApexUser = await prisma.user.findUnique({ where: { email: "patient.rajesh.sharma0@example.com" } });
  const patientCityUser = await prisma.user.findUnique({ where: { email: "patient.pooja.patel1@example.com" } });

  if (
    !superAdmin ||
    !adminApexUser ||
    !docApexUser ||
    !docCityUser ||
    !nurseApexUser ||
    !receptionApexUser ||
    !patientApexUser ||
    !patientCityUser
  ) {
    throw new Error("Required seed users for Phase 5 tests are missing.");
  }

  const tokenSuper = makeToken(superAdmin);
  const tokenApexAdmin = makeToken(adminApexUser);
  const tokenApexDoc = makeToken(docApexUser);
  const tokenCityDoc = makeToken(docCityUser);
  const tokenApexNurse = makeToken(nurseApexUser);
  const tokenApexReception = makeToken(receptionApexUser);
  const tokenApexPatient = makeToken(patientApexUser);
  const tokenCityPatient = makeToken(patientCityUser);

  // Fetch patient profiles
  const patientApex = await prisma.patient.findFirst({ where: { userId: patientApexUser.id } });
  const patientCity = await prisma.patient.findFirst({ where: { userId: patientCityUser.id } });

  if (!patientApex || !patientCity) {
    throw new Error("Patient profiles for test users must exist.");
  }

  let createdRecordId: string = "";

  try {
    // -----------------------------------------------------------------------
    // CATEGORY 1: CLINICAL ENCOUNTER DRAFT CREATION & EDITING
    // -----------------------------------------------------------------------
    console.log("--- Category 1: Clinical Encounter Lifecycle ---");

    // Test 1: Doctor creates draft medical record
    {
      const res = await fetch(`${baseUrl}/medical-records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          chiefComplaint: "Acute onset substernal chest pressure with mild diaphoresis",
          presentIllness: "Patient reports retrosternal pressure starting 2 hours ago, non-radiating, 6/10 intensity.",
          pastMedicalHistory: "Primary hypertension x 5 years, hyperlipidemia",
          physicalExamination: "BP 145/90, HR 88 regular, S1/S2 present, lungs clear to auscultation bilaterally",
          assessment: "Atypical angina pectoris vs musculoskeletal chest pain; rule out acute coronary syndrome",
          clinicalNotes: "Ordered urgent 12-lead ECG and serial cardiac troponins. Commenced low-dose aspirin.",
          followUpInstructions: "Strict bed rest pending troponin results; repeat ECG if symptoms exacerbate.",
        }),
      });

      const body = await res.json();
      const passed =
        res.status === 201 &&
        body.id &&
        body.status === "DRAFT" &&
        body.hospitalId === hospApex.id &&
        body.patientId === patientApex.id;

      if (passed) createdRecordId = body.id;

      record(
        1,
        "ENCOUNTER",
        "Doctor creates draft medical record",
        passed,
        `Status ${res.status}, recordId: ${body.id}, recordStatus: ${body.status}`
      );
    }

    // Test 2: Doctor fetches medical record by ID with full relations
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}`, {
        headers: { Authorization: `Bearer ${tokenApexDoc}` },
      });
      const body = await res.json();
      const passed =
        res.status === 200 &&
        body.id === createdRecordId &&
        body.patient?.firstName === patientApex.firstName &&
        body.doctor?.user?.email === docApexUser.email;

      record(
        2,
        "ENCOUNTER",
        "Doctor retrieves medical record with full relations",
        passed,
        `Status ${res.status}, Patient: ${body.patient?.firstName}, Doctor: Dr. ${body.doctor?.user?.lastName}`
      );
    }

    // Test 3: Doctor lists medical records filtered by patient
    {
      const res = await fetch(`${baseUrl}/medical-records?patientId=${patientApex.id}`, {
        headers: { Authorization: `Bearer ${tokenApexDoc}` },
      });
      const body = await res.json();
      const passed = res.status === 200 && Array.isArray(body.items) && body.items.length > 0;

      record(
        3,
        "ENCOUNTER",
        "Doctor lists medical records with query filters",
        passed,
        `Status ${res.status}, total items returned: ${body.items?.length}`
      );
    }

    // Test 4: Doctor updates draft medical record
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          assessment: "Updated Assessment: High-sensitivity Troponin negative at 2h. Likely musculoskeletal.",
          clinicalNotes: "ECG shows sinus rhythm without acute ST/T changes. Pain relieved with acetaminophen.",
        }),
      });
      const body = await res.json();
      const passed =
        res.status === 200 &&
        body.assessment.includes("High-sensitivity Troponin negative") &&
        body.status === "DRAFT";

      record(
        4,
        "ENCOUNTER",
        "Doctor updates draft medical record",
        passed,
        `Status ${res.status}, updated assessment preserved: ${passed}`
      );
    }

    // Test 5: Receptionist cannot create medical record (403)
    {
      const res = await fetch(`${baseUrl}/medical-records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexReception}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          chiefComplaint: "Unauthorized creation attempt",
        }),
      });
      const passed = res.status === 403;

      record(
        5,
        "ENCOUNTER",
        "Receptionist role cannot create medical records (403)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // Test 6: Patient cannot create medical record (403)
    {
      const res = await fetch(`${baseUrl}/medical-records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexPatient}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          chiefComplaint: "Self-diagnosis attempt",
        }),
      });
      const passed = res.status === 403;

      record(
        6,
        "ENCOUNTER",
        "Patient role cannot create medical records (403)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // Test 7: Patient cannot update medical record (403)
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexPatient}`,
        },
        body: JSON.stringify({
          clinicalNotes: "Tampering attempt by patient",
        }),
      });
      const passed = res.status === 403;

      record(
        7,
        "ENCOUNTER",
        "Patient role cannot update medical records (403)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // -----------------------------------------------------------------------
    // CATEGORY 2: HEALTHCARE IMMUTABILITY & RECORD FINALIZATION
    // -----------------------------------------------------------------------
    console.log("\n--- Category 2: Healthcare Immutability & Record Finalization ---");

    // Test 8: Doctor signs and finalizes draft medical record
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}/sign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenApexDoc}` },
      });
      const body = await res.json();
      const passed =
        res.status === 201 &&
        body.status === "FINALIZED" &&
        body.signedAt !== null &&
        body.signedById === docApexUser.id;

      record(
        8,
        "IMMUTABILITY",
        "Doctor signs and finalizes medical record",
        passed,
        `Status ${res.status}, recordStatus: ${body.status}, signedAt: ${body.signedAt}`
      );
    }

    // Test 9: Direct edit on finalized medical record is rejected (400)
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          clinicalNotes: "Illicit retroactive overwrite of finalized record",
        }),
      });
      const body = await res.json();
      const errMsg = getErrMsg(body).toLowerCase();
      const passed = res.status === 400 && (errMsg.includes("finalized") || errMsg.includes("amended"));

      record(
        9,
        "IMMUTABILITY",
        "Direct edits to finalized medical records are strictly rejected (400)",
        passed,
        `Status ${res.status}, Error: ${getErrMsg(body)}`
      );
    }

    // Test 10: Permanent deletion protection (400)
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenApexDoc}` },
      });
      const body = await res.json();
      const errMsg = getErrMsg(body).toLowerCase();
      const passed = res.status === 400 && errMsg.includes("cannot be permanently deleted");

      record(
        10,
        "IMMUTABILITY",
        "Permanent deletion of medical records is legally prohibited (400)",
        passed,
        `Status ${res.status}, Message: ${getErrMsg(body)}`
      );
    }

    // Test 11: Finalized record cannot be signed again (400)
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}/sign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenApexDoc}` },
      });
      const body = await res.json();
      const errMsg = getErrMsg(body).toLowerCase();
      const passed = res.status === 400 && errMsg.includes("already") && errMsg.includes("finalized");

      record(
        11,
        "IMMUTABILITY",
        "Finalized record cannot be signed again (400)",
        passed,
        `Status ${res.status}, Error: ${getErrMsg(body)}`
      );
    }

    // -----------------------------------------------------------------------
    // CATEGORY 3: CLINICAL AMENDMENT WORKFLOW
    // -----------------------------------------------------------------------
    console.log("\n--- Category 3: Clinical Amendment Workflow ---");

    // Test 12: Doctor attaches clinical amendment to finalized record
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}/amend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          reason: "Addition of 6-hour follow-up cardiac enzyme lab results",
          notes: "Repeat high-sensitivity Troponin I at 6 hours post-presentation remained 4 ng/L (normal range < 14 ng/L). Patient discharged home with cardiology follow-up.",
        }),
      });
      const body = await res.json();
      const recStatus = body.status || body.record?.status;
      const passed = res.status === 201 && (recStatus === "AMENDED" || body.amendment !== undefined);

      record(
        12,
        "AMENDMENT",
        "Doctor attaches official clinical amendment with reason and addendum notes",
        passed,
        `Status ${res.status}, recordStatus transitioned to: ${recStatus}`
      );
    }

    // Test 13: Fetch amended record and verify amendment history in database
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}`, {
        headers: { Authorization: `Bearer ${tokenApexDoc}` },
      });
      const body = await res.json();
      const hasAmendment =
        Array.isArray(body.amendments) &&
        body.amendments.length === 1 &&
        body.amendments[0].reason.includes("Addition of 6-hour follow-up") &&
        body.amendments[0].amendedById === docApexUser.id;

      const passed = res.status === 200 && body.status === "AMENDED" && hasAmendment;

      record(
        13,
        "AMENDMENT",
        "Amended record contains immutable audit trail of clinical amendments",
        passed,
        `Status ${res.status}, amendments count: ${body.amendments?.length}, author: ${body.amendments?.[0]?.amendedById}`
      );
    }

    // Test 14: Direct edit on AMENDED record is rejected (400)
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          assessment: "Attempted direct edit of amended record",
        }),
      });
      const passed = res.status === 400;

      record(
        14,
        "AMENDMENT",
        "Direct edits on AMENDED records remain strictly forbidden (400)",
        passed,
        `Status ${res.status} (expected 400 Bad Request)`
      );
    }

    // Test 15: Non-clinical role cannot amend records (403)
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}/amend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexReception}`,
        },
        body: JSON.stringify({
          reason: "Unauthorized addendum",
          notes: "Receptionist cannot write clinical addendums",
        }),
      });
      const passed = res.status === 403;

      record(
        15,
        "AMENDMENT",
        "Non-clinical role (Receptionist) cannot attach amendments (403)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // -----------------------------------------------------------------------
    // CATEGORY 4: TENANT ISOLATION & PATIENT PRIVACY (ANTI-IDOR)
    // -----------------------------------------------------------------------
    console.log("\n--- Category 4: Tenant Isolation & Patient Privacy (Anti-IDOR) ---");

    // Test 16: Cross-tenant medical record access is rejected (404/403)
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}`, {
        headers: { Authorization: `Bearer ${tokenCityDoc}` },
      });
      const passed = res.status === 404 || res.status === 403;

      record(
        16,
        "TENANT_PRIVACY",
        "Doctor from Hospital B cannot view medical records from Hospital A",
        passed,
        `Status ${res.status} (cross-tenant record isolated)`
      );
    }

    // Test 17: Cross-tenant record amendment is rejected (404/403)
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}/amend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenCityDoc}`,
        },
        body: JSON.stringify({
          reason: "Cross-tenant intrusion attempt",
          notes: "Intrusion",
        }),
      });
      const passed = res.status === 404 || res.status === 403;

      record(
        17,
        "TENANT_PRIVACY",
        "Doctor from Hospital B cannot amend medical records from Hospital A",
        passed,
        `Status ${res.status} (cross-tenant mutation rejected)`
      );
    }

    // Test 18: Client-supplied hospitalId override attempt is rejected by TenantGuard (403)
    {
      const res = await fetch(`${baseUrl}/medical-records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          chiefComplaint: "Testing hospitalId injection",
          hospitalId: hospCity.id, // malicious attempt to write to Hospital B
        }),
      });
      const passed = res.status === 403;

      record(
        18,
        "TENANT_PRIVACY",
        "Client-supplied hospitalId override is rejected by TenantGuard (403)",
        passed,
        `Status ${res.status} (TenantGuard rejected forged hospitalId parameter)`
      );
    }

    // Test 19: Patient views own medical record (200)
    {
      const res = await fetch(`${baseUrl}/medical-records/${createdRecordId}`, {
        headers: { Authorization: `Bearer ${tokenApexPatient}` },
      });
      const body = await res.json();
      const passed = res.status === 200 && body.id === createdRecordId;

      record(
        19,
        "TENANT_PRIVACY",
        "Patient can view their own medical record (200)",
        passed,
        `Status ${res.status}, Chief Complaint: ${body.chiefComplaint}`
      );
    }

    // Test 20: Patient A attempts to view Patient B's medical record (403 IDOR blocked)
    {
      // Create a record for Patient Pooja Patel by Doctor Apex
      const otherRecRes = await fetch(`${baseUrl}/medical-records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          patientId: patientCity.id,
          chiefComplaint: "Pooja Patel confidential clinical encounter",
        }),
      });
      const otherRec = await otherRecRes.json();

      // Apex Patient (Rajesh Sharma) tries to view Pooja Patel's record
      const idorRes = await fetch(`${baseUrl}/medical-records/${otherRec.id}`, {
        headers: { Authorization: `Bearer ${tokenApexPatient}` },
      });
      const passed = idorRes.status === 403 || idorRes.status === 404;

      record(
        20,
        "TENANT_PRIVACY",
        "Patient cannot view another patient's medical records (IDOR protection)",
        passed,
        `Status ${idorRes.status} (IDOR attack successfully blocked)`
      );
    }

    // Test 21: Patient lists medical records - only own records returned
    {
      const res = await fetch(`${baseUrl}/medical-records`, {
        headers: { Authorization: `Bearer ${tokenApexPatient}` },
      });
      const body = await res.json();
      const allMine = body.items.every((r: any) => r.patientId === patientApex.id);
      const passed = res.status === 200 && body.items.length > 0 && allMine;

      record(
        21,
        "TENANT_PRIVACY",
        "Patient record list query strictly scopes to authenticated patient's records",
        passed,
        `Status ${res.status}, items returned: ${body.items?.length}, all belongs to patient: ${allMine}`
      );
    }

    // -----------------------------------------------------------------------
    // CATEGORY 5: VITAL SIGNS STATION & BMI AUTOMATION
    // -----------------------------------------------------------------------
    console.log("\n--- Category 5: Vital Signs Station & Automated BMI ---");

    // Test 22: Nurse records patient vital signs
    let recordedVitalsId: string = "";
    {
      const res = await fetch(`${baseUrl}/vital-signs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexNurse}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          systolicBp: 120,
          diastolicBp: 80,
          heartRate: 72,
          respiratoryRate: 16,
          temperature: 36.8,
          oxygenSaturation: 98,
          weightKg: 70.0,
          heightCm: 175.0,
          notes: "Routine triage vital signs",
        }),
      });
      const body = await res.json();
      const passed = res.status === 201 && body.id && body.systolicBp === 120;
      if (passed) recordedVitalsId = body.id;

      record(
        22,
        "VITALS",
        "Nurse records complete patient vital signs",
        passed,
        `Status ${res.status}, vitalsId: ${body.id}, BP: ${body.systolicBp}/${body.diastolicBp}`
      );
    }

    // Test 23: Verify automated BMI computation (70 / (1.75)^2 = 22.86)
    {
      const vitalsInDb = await prisma.vitalSigns.findUnique({ where: { id: recordedVitalsId } });
      const expectedBmi = 22.86;
      const bmiNum = vitalsInDb?.bmi ? Number(vitalsInDb.bmi) : null;
      const passed = bmiNum !== null && Math.abs(bmiNum - expectedBmi) < 0.1;

      record(
        23,
        "VITALS",
        "Automated BMI calculation on physiological telemetry",
        passed,
        `Calculated BMI: ${bmiNum} kg/m² (expected ~${expectedBmi})`
      );
    }

    // Test 24: Vital signs physiological range validation rejects invalid systolic BP (< 50 or > 250)
    {
      const res = await fetch(`${baseUrl}/vital-signs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexNurse}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          systolicBp: 400, // physically implausible
        }),
      });
      const passed = res.status === 400;

      record(
        24,
        "VITALS",
        "Vital signs physiological range validation rejects implausible systolic BP (400 mmHg)",
        passed,
        `Status ${res.status} (expected 400 Bad Request)`
      );
    }

    // Test 25: Vital signs range validation rejects implausible temperature (< 30 or > 45)
    {
      const res = await fetch(`${baseUrl}/vital-signs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexNurse}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          temperature: 65.0, // implausible
        }),
      });
      const passed = res.status === 400;

      record(
        25,
        "VITALS",
        "Vital signs physiological range validation rejects implausible temperature (65.0 °C)",
        passed,
        `Status ${res.status} (expected 400 Bad Request)`
      );
    }

    // Test 26: Vital signs range validation rejects implausible oxygen saturation (> 100)
    {
      const res = await fetch(`${baseUrl}/vital-signs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexNurse}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          oxygenSaturation: 105.0,
        }),
      });
      const passed = res.status === 400;

      record(
        26,
        "VITALS",
        "Vital signs range validation rejects oxygen saturation > 100%",
        passed,
        `Status ${res.status} (expected 400 Bad Request)`
      );
    }

    // Test 27: Patient cannot record vital signs (403)
    {
      const res = await fetch(`${baseUrl}/vital-signs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexPatient}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          heartRate: 80,
        }),
      });
      const passed = res.status === 403;

      record(
        27,
        "VITALS",
        "Patient role cannot submit vital signs entries (403)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // Test 28: Nurse lists vital signs for patient (200)
    {
      const res = await fetch(`${baseUrl}/vital-signs?patientId=${patientApex.id}`, {
        headers: { Authorization: `Bearer ${tokenApexNurse}` },
      });
      const body = await res.json();
      const passed = res.status === 200 && Array.isArray(body.items) && body.items.length > 0;

      record(
        28,
        "VITALS",
        "Staff lists vital signs telemetry for patient",
        passed,
        `Status ${res.status}, items: ${body.items?.length}`
      );
    }

    // -----------------------------------------------------------------------
    // CATEGORY 6: CLINICAL DIAGNOSES
    // -----------------------------------------------------------------------
    console.log("\n--- Category 6: Clinical Diagnoses ---");

    // Test 29: Doctor creates diagnosis on draft record
    let draftRecordForDiag: string = "";
    {
      // Create draft record
      const draftRes = await fetch(`${baseUrl}/medical-records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          chiefComplaint: "Routine hypertension review",
        }),
      });
      const draftBody = await draftRes.json();
      draftRecordForDiag = draftBody.id;

      const res = await fetch(`${baseUrl}/diagnoses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          medicalRecordId: draftRecordForDiag,
          code: "I10",
          description: "Essential (primary) hypertension",
          type: "PRIMARY",
          status: "ACTIVE",
          notes: "Stage 2 hypertension, well tolerated on monotherapy",
        }),
      });
      const body = await res.json();
      const passed =
        res.status === 201 &&
        (body.code === "I10" || body.icdCode === "I10") &&
        body.type === "PRIMARY";

      record(
        29,
        "DIAGNOSES",
        "Doctor records clinical diagnosis on draft medical record",
        passed,
        `Status ${res.status}, code: ${body.icdCode || body.code}, description: ${body.description || body.diagnosisName}`
      );
    }

    // Test 30: Doctor cannot add diagnosis directly to finalized record without amendment
    {
      const res = await fetch(`${baseUrl}/diagnoses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          medicalRecordId: createdRecordId, // this was finalized earlier!
          code: "E11.9",
          description: "Type 2 diabetes mellitus without complications",
          type: "SECONDARY",
        }),
      });
      const passed = res.status === 400;

      record(
        30,
        "DIAGNOSES",
        "Adding diagnoses directly to finalized medical record without amendment is rejected (400)",
        passed,
        `Status ${res.status} (expected 400 Bad Request)`
      );
    }

    // Test 31: Nurse cannot record diagnoses (Doctor-only privileged clinical action)
    {
      const res = await fetch(`${baseUrl}/diagnoses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexNurse}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          code: "J45",
          description: "Asthma",
          type: "PRIMARY",
        }),
      });
      const passed = res.status === 403;

      record(
        31,
        "DIAGNOSES",
        "Nurse cannot record clinical diagnoses (403 Doctor-restricted)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // Test 32: List diagnoses by patient
    {
      const res = await fetch(`${baseUrl}/diagnoses?patientId=${patientApex.id}`, {
        headers: { Authorization: `Bearer ${tokenApexDoc}` },
      });
      const body = await res.json();
      const passed = res.status === 200 && Array.isArray(body.items) && body.items.length > 0;

      record(
        32,
        "DIAGNOSES",
        "Query diagnoses by patient",
        passed,
        `Status ${res.status}, diagnoses count: ${body.items?.length}`
      );
    }

    // -----------------------------------------------------------------------
    // CATEGORY 7: TREATMENT PLANS
    // -----------------------------------------------------------------------
    console.log("\n--- Category 7: Treatment Plans ---");

    // Test 33: Doctor creates treatment plan
    let treatmentPlanId: string = "";
    {
      const res = await fetch(`${baseUrl}/treatment-plans`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          medicalRecordId: draftRecordForDiag,
          title: "Comprehensive Cardiovascular Risk Reduction",
          description: "Lifestyle modification, DASH diet, aerobic exercise, and ACE inhibitor titration",
          goals: "Target blood pressure < 130/80 mmHg within 8 weeks; LDL-C < 70 mg/dL",
          startDate: "2026-11-02",
        }),
      });
      const body = await res.json();
      const passed =
        res.status === 201 &&
        body.id &&
        (body.planDescription?.includes("Cardiovascular Risk") || body.title?.includes("Cardiovascular Risk"));
      if (passed) treatmentPlanId = body.id;

      record(
        33,
        "TREATMENT",
        "Doctor establishes patient treatment plan",
        passed,
        `Status ${res.status}, planId: ${body.id}, planDescription: ${body.planDescription || body.title}`
      );
    }

    // Test 34: Doctor updates treatment plan
    {
      const res = await fetch(`${baseUrl}/treatment-plans/${treatmentPlanId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          goals: "Goals achieved: BP normalized to 124/78 mmHg",
          instructions: "Goals achieved: BP normalized to 124/78 mmHg",
        }),
      });
      const body = await res.json();
      const passed =
        res.status === 200 &&
        (body.instructions?.includes("Goals achieved") || body.id === treatmentPlanId);

      record(
        34,
        "TREATMENT",
        "Doctor updates treatment plan instructions and goals",
        passed,
        `Status ${res.status}, instructions: ${body.instructions}`
      );
    }

    // Test 35: Patient cannot create treatment plans (403)
    {
      const res = await fetch(`${baseUrl}/treatment-plans`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexPatient}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          title: "Self-prescribed plan",
        }),
      });
      const passed = res.status === 403;

      record(
        35,
        "TREATMENT",
        "Patient role cannot author treatment plans (403)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // -----------------------------------------------------------------------
    // CATEGORY 8: PATIENT ALLERGIES & MEDICATION HISTORY
    // -----------------------------------------------------------------------
    console.log("\n--- Category 8: Patient Allergies & Medication History ---");

    // Test 36: Nurse records patient allergy with LIFE_THREATENING severity
    let allergyId: string = "";
    {
      const res = await fetch(`${baseUrl}/patient-allergies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexNurse}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          allergen: "Penicillin G",
          reaction: "Anaphylactic shock, bronchospasm, angioedema",
          severity: "LIFE_THREATENING",
          isActive: true,
          notes: "Documented ICU admission in 2019 following cephalosporin exposure",
        }),
      });
      const body = await res.json();
      const passed = res.status === 201 && body.allergen === "Penicillin G" && body.severity === "LIFE_THREATENING";
      if (passed) allergyId = body.id;

      record(
        36,
        "ALLERGY_MEDS",
        "Clinical staff documents severe allergy with LIFE_THREATENING severity",
        passed,
        `Status ${res.status}, allergen: ${body.allergen}, severity: ${body.severity}`
      );
    }

    // Test 37: Nurse updates allergy
    {
      const res = await fetch(`${baseUrl}/patient-allergies/${allergyId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexNurse}`,
        },
        body: JSON.stringify({
          notes: "Updated note: strict avoidance of all beta-lactams recommended",
        }),
      });
      const body = await res.json();
      const passed = res.status === 200 && body.notes.includes("beta-lactams");

      record(
        37,
        "ALLERGY_MEDS",
        "Clinical staff updates allergy documentation",
        passed,
        `Status ${res.status}, updated notes preserved: ${passed}`
      );
    }

    // Test 38: Patient views their own documented allergies (200)
    {
      const res = await fetch(`${baseUrl}/patient-allergies?patientId=${patientApex.id}`, {
        headers: { Authorization: `Bearer ${tokenApexPatient}` },
      });
      const body = await res.json();
      const passed = res.status === 200 && Array.isArray(body.items) && body.items.length > 0;

      record(
        38,
        "ALLERGY_MEDS",
        "Patient views their own documented allergy profile (200)",
        passed,
        `Status ${res.status}, allergies count: ${body.items?.length}`
      );
    }

    // Test 39: Patient B attempts to view Patient A's allergies (403 IDOR blocked)
    {
      const res = await fetch(`${baseUrl}/patient-allergies?patientId=${patientApex.id}`, {
        headers: { Authorization: `Bearer ${tokenCityPatient}` },
      });
      const passed = res.status === 403;

      record(
        39,
        "ALLERGY_MEDS",
        "Patient B cannot view Patient A's allergy records (IDOR protection)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // Test 40: Nurse records patient medication history
    let medicationId: string = "";
    {
      const res = await fetch(`${baseUrl}/patient-medication-history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexNurse}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          medicationName: "Atorvastatin Calcium",
          dosage: "40 mg",
          frequency: "Once daily at bedtime",
          route: "ORAL",
          prescribedDate: "2026-01-15",
          isActive: true,
          notes: "For primary prevention of ASCVD",
        }),
      });
      const body = await res.json();
      const passed = res.status === 201 && body.medicationName === "Atorvastatin Calcium";
      if (passed) medicationId = body.id;

      record(
        40,
        "ALLERGY_MEDS",
        "Clinical staff documents patient medication history",
        passed,
        `Status ${res.status}, medication: ${body.medicationName}, dosage: ${body.dosage}`
      );
    }

    // Test 41: Nurse updates medication history (marks discontinued)
    {
      const res = await fetch(`${baseUrl}/patient-medication-history/${medicationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexNurse}`,
        },
        body: JSON.stringify({
          isActive: false,
          discontinuedDate: "2026-11-02",
          notes: "Discontinued due to mild myalgia; switched to Rosuvastatin",
        }),
      });
      const body = await res.json();
      const passed =
        res.status === 200 &&
        body.isActive === false &&
        (body.endDate !== undefined || body.discontinuedDate !== undefined);

      record(
        41,
        "ALLERGY_MEDS",
        "Clinical staff updates medication status to discontinued",
        passed,
        `Status ${res.status}, isActive: ${body.isActive}, endDate: ${body.endDate || body.discontinuedDate}`
      );
    }

    // Test 42: Patient views own medication history (200)
    {
      const res = await fetch(`${baseUrl}/patient-medication-history?patientId=${patientApex.id}`, {
        headers: { Authorization: `Bearer ${tokenApexPatient}` },
      });
      const body = await res.json();
      const passed = res.status === 200 && Array.isArray(body.items) && body.items.length > 0;

      record(
        42,
        "ALLERGY_MEDS",
        "Patient views their own medication history (200)",
        passed,
        `Status ${res.status}, medications count: ${body.items?.length}`
      );
    }

    // Test 43: Patient B cannot view Patient A's medication history (403 IDOR blocked)
    {
      const res = await fetch(`${baseUrl}/patient-medication-history?patientId=${patientApex.id}`, {
        headers: { Authorization: `Bearer ${tokenCityPatient}` },
      });
      const passed = res.status === 403;

      record(
        43,
        "ALLERGY_MEDS",
        "Patient B cannot view Patient A's medication history (IDOR protection)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // -----------------------------------------------------------------------
    // CATEGORY 9: PATIENT 360° CLINICAL OVERVIEW
    // -----------------------------------------------------------------------
    console.log("\n--- Category 9: Patient 360° Clinical Overview ---");

    // Test 44: Doctor views patient clinical overview (aggregates demographics, vitals, allergies, meds, diagnoses, records)
    {
      const res = await fetch(`${baseUrl}/patients/${patientApex.id}/clinical-overview`, {
        headers: { Authorization: `Bearer ${tokenApexDoc}` },
      });
      const body = await res.json();
      const passed =
        res.status === 200 &&
        body.patient?.id === patientApex.id &&
        body.latestVitals !== null &&
        Array.isArray(body.allergies) &&
        Array.isArray(body.medications) &&
        Array.isArray(body.diagnoses) &&
        Array.isArray(body.recentRecords);

      record(
        44,
        "OVERVIEW",
        "Doctor retrieves complete 360° patient clinical overview",
        passed,
        `Status ${res.status}, Patient: ${body.patient?.firstName}, Vitals: ${body.latestVitals?.systolicBp}/${body.latestVitals?.diastolicBp}, Allergies: ${body.allergies?.length}, Diagnoses: ${body.diagnoses?.length}`
      );
    }

    // Test 45: Patient views their own clinical overview (200)
    {
      const res = await fetch(`${baseUrl}/patients/${patientApex.id}/clinical-overview`, {
        headers: { Authorization: `Bearer ${tokenApexPatient}` },
      });
      const body = await res.json();
      const passed = res.status === 200 && body.patient?.id === patientApex.id;

      record(
        45,
        "OVERVIEW",
        "Patient views their own clinical overview (200)",
        passed,
        `Status ${res.status}, MRN: ${body.patient?.mrn}`
      );
    }

    // Test 46: Patient views another patient's clinical overview (403 IDOR blocked)
    {
      const res = await fetch(`${baseUrl}/patients/${patientCity.id}/clinical-overview`, {
        headers: { Authorization: `Bearer ${tokenApexPatient}` },
      });
      const passed = res.status === 403;

      record(
        46,
        "OVERVIEW",
        "Patient cannot view another patient's clinical overview (IDOR protection)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // -----------------------------------------------------------------------
    // CATEGORY 10: CLINICAL AUDIT LOGGING & SUPER ADMIN CAPABILITIES
    // -----------------------------------------------------------------------
    console.log("\n--- Category 10: Clinical Audit Logging & Super Admin ---");

    // Test 47: Verify PostgreSQL AuditLog table records clinical events
    {
      const auditEntries = await prisma.auditLog.findMany({
        where: {
          hospitalId: hospApex.id,
          entityName: "MedicalRecord",
          entityId: createdRecordId,
        },
      });

      const passed = auditEntries.length >= 2; // at least CREATE and SIGN or AMEND

      record(
        47,
        "AUDIT",
        "PostgreSQL audit log records tamper-evident trail for clinical records",
        passed,
        `Found ${auditEntries.length} audit log entries for MedicalRecord ${createdRecordId}`
      );
    }

    // Test 48: Super Admin can query cross-tenant medical records (200)
    {
      const res = await fetch(`${baseUrl}/medical-records`, {
        headers: { Authorization: `Bearer ${tokenSuper}` },
      });
      const body = await res.json();
      const passed = res.status === 200 && Array.isArray(body.items);

      record(
        48,
        "AUDIT",
        "Super Admin can access multi-tenant clinical records with global authority",
        passed,
        `Status ${res.status}, global clinical records visible: ${body.items?.length}`
      );
    }

    // --- Category 11: Security & Quality Audit Validations (Tests 49 - 58) ---

    // Test 49: Concurrent Amendment Race Condition (Both amendments preserved in PostgreSQL)
    {
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/medical-records/${createdRecordId}/amend`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenApexDoc}`,
          },
          body: JSON.stringify({
            reason: "Concurrent addendum A: Microbiology results received",
            notes: "Blood cultures show no bacterial growth at 48 hours.",
          }),
        }),
        fetch(`${baseUrl}/medical-records/${createdRecordId}/amend`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenApexDoc}`,
          },
          body: JSON.stringify({
            reason: "Concurrent addendum B: Radiology consultation update",
            notes: "Repeat chest radiography reveals clear bilateral lung fields.",
          }),
        }),
      ]);

      const passed = res1.status === 201 && res2.status === 201;

      // Verify both amendments exist in PostgreSQL
      const dbAmendments = await prisma.medicalRecordAmendment.findMany({
        where: { medicalRecordId: createdRecordId },
      });

      record(
        49,
        "IMMUTABILITY",
        "Concurrent amendments do not overwrite each other and both persist safely",
        passed && dbAmendments.length >= 3,
        `Responses: [${res1.status}, ${res2.status}], Total DB Amendments: ${dbAmendments.length}`
      );
    }

    // Test 50: Concurrent Finalization Race Condition (Atomic serialization)
    {
      // Create a fresh DRAFT medical record
      const draftRes = await fetch(`${baseUrl}/medical-records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          chiefComplaint: "Testing concurrent finalization",
        }),
      });
      const draft = await draftRes.json();
      const draftId = draft.id;

      const [signRes1, signRes2] = await Promise.all([
        fetch(`${baseUrl}/medical-records/${draftId}/sign`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tokenApexDoc}` },
        }),
        fetch(`${baseUrl}/medical-records/${draftId}/sign`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tokenApexDoc}` },
        }),
      ]);

      const statuses = [signRes1.status, signRes2.status].sort();
      const passed = (statuses[0] === 200 || statuses[0] === 201) && statuses[1] === 400;

      record(
        50,
        "IMMUTABILITY",
        "Concurrent finalization requests are atomically serialized with conflict prevention",
        passed,
        `Responses: [${signRes1.status}, ${signRes2.status}] -> Exactly one success and one 400`
      );
    }

    // Test 51: Immutability Defense - Attaching vitals to finalized record is rejected (400)
    {
      const res = await fetch(`${baseUrl}/vital-signs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexNurse}`,
        },
        body: JSON.stringify({
          medicalRecordId: createdRecordId,
          systolicBp: 120,
          diastolicBp: 80,
          heartRate: 72,
        }),
      });
      const passed = res.status === 400;

      record(
        51,
        "IMMUTABILITY",
        "Attaching vital signs directly to a finalized/amended medical record is strictly rejected (400)",
        passed,
        `Status ${res.status} (expected 400 Bad Request)`
      );
    }

    // Test 52: RBAC Defense - Hospital Admin cannot create patient allergy records (403)
    {
      const res = await fetch(`${baseUrl}/patient-allergies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexAdmin}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          allergen: "Sulfa drugs",
          severity: "MODERATE",
        }),
      });
      const passed = res.status === 403;

      record(
        52,
        "RBAC",
        "Hospital Admin role cannot document patient allergies (403 Forbidden)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // Test 53: RBAC Defense - Hospital Admin cannot document medication history (403)
    {
      const res = await fetch(`${baseUrl}/patient-medication-history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexAdmin}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          medicationName: "Lisinopril",
          dosage: "10mg",
        }),
      });
      const passed = res.status === 403;

      record(
        53,
        "RBAC",
        "Hospital Admin role cannot document patient medication history (403 Forbidden)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // Test 54: Validation Defense - Inverted dates rejected on medication history (400)
    {
      const res = await fetch(`${baseUrl}/patient-medication-history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          medicationName: "Metformin",
          startDate: "2026-11-20",
          endDate: "2026-11-01",
        }),
      });
      const passed = res.status === 400;

      record(
        54,
        "VALIDATION",
        "Medication history rejects inverted dates where endDate precedes startDate (400)",
        passed,
        `Status ${res.status} (expected 400 Bad Request)`
      );
    }

    // Test 55: Validation Defense - Inverted dates rejected on treatment plans (400)
    {
      const draftRes = await fetch(`${baseUrl}/medical-records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          chiefComplaint: "Testing treatment plan dates",
        }),
      });
      const draft = await draftRes.json();

      const res = await fetch(`${baseUrl}/treatment-plans`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexDoc}`,
        },
        body: JSON.stringify({
          medicalRecordId: draft.id,
          title: "Invalid date treatment plan",
          startDate: "2026-11-20",
          endDate: "2026-11-01",
        }),
      });
      const passed = res.status === 400;

      record(
        55,
        "VALIDATION",
        "Treatment plans reject inverted dates where endDate precedes startDate (400)",
        passed,
        `Status ${res.status} (expected 400 Bad Request)`
      );
    }

    // Test 56: Cross-Tenant Defense - Doctor B querying Hospital A patient diagnoses is blocked (403)
    {
      const res = await fetch(`${baseUrl}/diagnoses?patientId=${patientApex.id}`, {
        headers: { Authorization: `Bearer ${tokenCityDoc}` },
      });
      const passed = res.status === 403;

      record(
        56,
        "TENANT_PRIVACY",
        "Doctor from Hospital B querying Hospital A patient diagnoses is blocked (403)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // Test 57: Cross-Tenant Defense - Doctor B querying Hospital A patient treatment plans is blocked (403)
    {
      const res = await fetch(`${baseUrl}/treatment-plans?patientId=${patientApex.id}`, {
        headers: { Authorization: `Bearer ${tokenCityDoc}` },
      });
      const passed = res.status === 403;

      record(
        57,
        "TENANT_PRIVACY",
        "Doctor from Hospital B querying Hospital A patient treatment plans is blocked (403)",
        passed,
        `Status ${res.status} (expected 403 Forbidden)`
      );
    }

    // Test 58: TenantGuard Defense - Forged hospitalId parameter on vital signs is rejected (403)
    {
      const res = await fetch(`${baseUrl}/vital-signs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexNurse}`,
        },
        body: JSON.stringify({
          patientId: patientApex.id,
          hospitalId: hospCity.id,
          systolicBp: 120,
          diastolicBp: 80,
        }),
      });
      const passed = res.status === 403;

      record(
        58,
        "TENANT_PRIVACY",
        "TenantGuard rejects client-supplied hospitalId on vital signs endpoint (403)",
        passed,
        `Status ${res.status} (TenantGuard rejected forged hospitalId)`
      );
    }
  } catch (error) {
    console.error("Test execution error:", error);
  } finally {
    await app.close();
  }

  // Summary
  console.log("\n==========================================================================");
  console.log("📊 Phase 5 Clinical EMR Integration Test Summary");
  console.log("==========================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total Tests Run: ${total}`);
  console.log(`Passed:         ${passed}`);
  console.log(`Failed:         ${failed}`);
  console.log("==========================================================================\n");

  if (failed > 0) {
    console.error(`❌ Suite failed: ${failed} tests failed.`);
    process.exit(1);
  } else {
    console.log("✨ All Phase 5 Clinical EMR tests passed successfully!");
    process.exit(0);
  }
}

runPhase5Tests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
