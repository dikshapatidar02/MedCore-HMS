import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { HospitalsService } from "../src/hospitals/hospitals.service";

interface TestResult {
  id: number;
  category: "AUTH" | "RBAC" | "TENANT";
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(
  id: number,
  category: "AUTH" | "RBAC" | "TENANT",
  name: string,
  passed: boolean,
  details: string
) {
  results.push({ id, category, name, passed, details });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} [${category} Test ${id}] ${name}: ${details}`);
}

async function runPhase3Tests() {
  console.log("=================================================================");
  console.log("🔬 MedCore HMS — Phase 3 Auth, RBAC & Tenant Security Test Suite");
  console.log("=================================================================\n");

  const app = await NestFactory.create(AppModule, { logger: false });
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
  const hospitalsService = app.get(HospitalsService);

  // Retrieve test fixtures from seeded database
  const hospApex = await prisma.hospital.findUnique({ where: { code: "APEX-MAIN" } });
  const hospCity = await prisma.hospital.findUnique({ where: { code: "CITY-CARE" } });
  if (!hospApex || !hospCity) {
    throw new Error("Seeded hospitals not found in database. Please run prisma db seed first.");
  }

  // -------------------------------------------------------------
  // SECTION 1: AUTHENTICATION TESTS (Tests 1 - 10)
  // -------------------------------------------------------------
  let loginAccessToken = "";
  let loginRefreshToken = "";
  let rotatedRefreshToken = "";

  // Test 1: Valid login succeeds
  try {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin.apex@medcore.io",
        password: "DemoPassword@123",
      }),
    });
    const json: any = await res.json();
    const passed =
      res.status === 200 &&
      json.success === true &&
      typeof json.data.accessToken === "string" &&
      typeof json.data.refreshToken === "string" &&
      json.data.user.email === "admin.apex@medcore.io";

    loginAccessToken = json.data?.accessToken;
    loginRefreshToken = json.data?.refreshToken;

    record(
      1,
      "AUTH",
      "Valid login succeeds",
      passed,
      `Returned 200 OK with Bearer access token (${loginAccessToken.substring(0, 15)}...)`
    );
  } catch (e: any) {
    record(1, "AUTH", "Valid login succeeds", false, e.message);
  }

  // Test 2: Incorrect password is rejected
  try {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin.apex@medcore.io",
        password: "WrongPassword!999",
      }),
    });
    const json: any = await res.json();
    const passed = res.status === 401 && json.success === false && json.error.code === "UNAUTHORIZED";
    record(
      2,
      "AUTH",
      "Incorrect password is rejected",
      passed,
      `Rejected with 401 Unauthorized (${json.error?.message})`
    );
  } catch (e: any) {
    record(2, "AUTH", "Incorrect password is rejected", false, e.message);
  }

  // Test 3: Unknown account is rejected
  try {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nonexistent.doctor@medcore.io",
        password: "DemoPassword@123",
      }),
    });
    const json: any = await res.json();
    const passed = res.status === 401 && json.success === false && json.error.code === "UNAUTHORIZED";
    record(
      3,
      "AUTH",
      "Unknown account is rejected",
      passed,
      `Rejected with 401 Unauthorized without leaking account existence`
    );
  } catch (e: any) {
    record(3, "AUTH", "Unknown account is rejected", false, e.message);
  }

  // Test 4: Inactive account is rejected
  try {
    // Temporarily create an inactive user
    const inactiveUser = await prisma.user.create({
      data: {
        email: "inactive.test@apexhealth.org",
        passwordHash: bcrypt.hashSync("DemoPassword@123", 10),
        firstName: "Inactive",
        lastName: "Tester",
        role: UserRole.NURSE,
        hospitalId: hospApex.id,
        isActive: false,
      },
    });

    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "inactive.test@apexhealth.org",
        password: "DemoPassword@123",
      }),
    });
    const json: any = await res.json();
    const passed =
      res.status === 401 &&
      json.success === false &&
      json.error?.message?.toLowerCase().includes("inactive");

    // Clean up
    await prisma.user.delete({ where: { id: inactiveUser.id } });

    record(
      4,
      "AUTH",
      "Inactive account is rejected",
      passed,
      `Blocked with 401 Unauthorized: "${json.error?.message}"`
    );
  } catch (e: any) {
    record(4, "AUTH", "Inactive account is rejected", false, e.message);
  }

  // Test 5: Missing access token is rejected
  try {
    const res = await fetch(`${baseUrl}/auth/me`, {
      method: "GET",
    });
    const json: any = await res.json();
    const passed = res.status === 401 && json.success === false;
    record(5, "AUTH", "Missing access token is rejected", passed, `Protected /auth/me rejected with 401`);
  } catch (e: any) {
    record(5, "AUTH", "Missing access token is rejected", false, e.message);
  }

  // Test 6: Invalid token is rejected
  try {
    const res = await fetch(`${baseUrl}/auth/me`, {
      method: "GET",
      headers: { Authorization: "Bearer forged.invalid.token" },
    });
    const json: any = await res.json();
    const passed = res.status === 401 && json.success === false;
    record(6, "AUTH", "Invalid token is rejected", passed, `Malformed token rejected with 401`);
  } catch (e: any) {
    record(6, "AUTH", "Invalid token is rejected", false, e.message);
  }

  // Test 7: Expired token is rejected
  try {
    const accessSecret = process.env.JWT_ACCESS_SECRET || "default_fallback_access_secret_do_not_use";
    const expiredToken = jwtService.sign(
      { sub: "user-superadmin-001", email: "superadmin@medcore.io", role: "SUPER_ADMIN" },
      { secret: accessSecret, expiresIn: "-10s" }
    );

    const res = await fetch(`${baseUrl}/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const json: any = await res.json();
    const passed =
      res.status === 401 &&
      json.success === false &&
      json.error?.message?.toLowerCase().includes("expired");

    record(7, "AUTH", "Expired token is rejected", passed, `Expired token safely rejected with 401`);
  } catch (e: any) {
    record(7, "AUTH", "Expired token is rejected", false, e.message);
  }

  // Test 8: Refresh token works
  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: loginRefreshToken }),
    });
    const json: any = await res.json();
    const passed =
      res.status === 200 &&
      json.success === true &&
      typeof json.data?.accessToken === "string" &&
      typeof json.data?.refreshToken === "string" &&
      json.data?.refreshToken !== loginRefreshToken;

    rotatedRefreshToken = json.data?.refreshToken;

    record(
      8,
      "AUTH",
      "Refresh token works with rotation",
      passed,
      `Issued new access token and rotated refresh token`
    );
  } catch (e: any) {
    record(8, "AUTH", "Refresh token works with rotation", false, e.message);
  }

  // Test 9: Logout invalidates the refresh token
  try {
    // Call logout
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loginAccessToken}`,
      },
      body: JSON.stringify({ refreshToken: rotatedRefreshToken }),
    });
    const logoutJson: any = await logoutRes.json();

    // Now attempt to use the logged-out refresh token
    const reuseRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rotatedRefreshToken }),
    });
    const reuseJson: any = await reuseRes.json();

    const passed =
      logoutRes.status === 200 &&
      logoutJson.success === true &&
      reuseRes.status === 401 &&
      reuseJson.success === false;

    record(
      9,
      "AUTH",
      "Logout invalidates the refresh token",
      passed,
      `Logout succeeded; subsequent refresh attempt returned 401 Unauthorized`
    );
  } catch (e: any) {
    record(9, "AUTH", "Logout invalidates the refresh token", false, e.message);
  }

  // Test 10: Password hashes are never returned
  try {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "superadmin@medcore.io",
        password: "DemoPassword@123",
      }),
    });
    const json: any = await res.json();
    const token = json.data?.accessToken;

    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meJson: any = await meRes.json();

    const passed =
      json.data.user.passwordHash === undefined &&
      json.data.user.password === undefined &&
      meJson.data.passwordHash === undefined &&
      meJson.data.password === undefined;

    record(
      10,
      "AUTH",
      "Password hashes are never returned",
      passed,
      `Both /auth/login and /auth/me sanitize credentials from payload`
    );
  } catch (e: any) {
    record(10, "AUTH", "Password hashes are never returned", false, e.message);
  }

  // -------------------------------------------------------------
  // SECTION 2: NINE-ROLE RBAC TESTS (Tests 11 - 14)
  // -------------------------------------------------------------
  const roleAccounts = [
    { role: UserRole.SUPER_ADMIN, email: "superadmin@medcore.io" },
    { role: UserRole.HOSPITAL_ADMIN, email: "admin.apex@medcore.io" },
    { role: UserRole.DOCTOR, email: "dr.arun.sharma@apexhealth.org" },
    { role: UserRole.NURSE, email: "nurse.apex@medcore.io" },
    { role: UserRole.RECEPTIONIST, email: "reception.apex@medcore.io" },
    { role: UserRole.LAB_TECHNICIAN, email: "lab.apex@medcore.io" },
    { role: UserRole.PHARMACIST, email: "pharma.apex@medcore.io" },
    { role: UserRole.ACCOUNTANT, email: "billing.apex@medcore.io" },
    { role: UserRole.PATIENT, email: "patient.rajesh.sharma0@example.com" },
  ];

  const roleTokens: Record<string, string> = {};

  // Test 11: Each of the nine roles is recognized
  try {
    let allRecognized = true;
    for (const acc of roleAccounts) {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: acc.email, password: "DemoPassword@123" }),
      });
      const json: any = await res.json();
      if (res.status === 200 && json.data?.user?.role === acc.role) {
        roleTokens[acc.role] = json.data.accessToken;
      } else {
        allRecognized = false;
        break;
      }
    }

    record(
      11,
      "RBAC",
      "Each of the nine roles is recognized",
      allRecognized,
      `Successfully authenticated and validated roles for all 9 system actors`
    );
  } catch (e: any) {
    record(11, "RBAC", "Each of the nine roles is recognized", false, e.message);
  }

  // Test 12: Unauthorized roles cannot access restricted endpoints
  try {
    // Attempt to access Super Admin platform overview using a DOCTOR token
    const res = await fetch(`${baseUrl}/hospitals/platform/overview`, {
      headers: { Authorization: `Bearer ${roleTokens[UserRole.DOCTOR]}` },
    });
    const json: any = await res.json();
    const passed = res.status === 403 && json.success === false && json.error?.code === "FORBIDDEN";
    record(
      12,
      "RBAC",
      "Unauthorized roles cannot access restricted endpoints",
      passed,
      `Doctor blocked from Super Admin endpoint with 403 Forbidden`
    );
  } catch (e: any) {
    record(12, "RBAC", "Unauthorized roles cannot access restricted endpoints", false, e.message);
  }

  // Test 13: Authorized roles can access permitted endpoints
  try {
    // Doctor accesses departments of their hospital
    const res = await fetch(`${baseUrl}/hospitals/${hospApex.id}/departments`, {
      headers: { Authorization: `Bearer ${roleTokens[UserRole.DOCTOR]}` },
    });
    const json: any = await res.json();
    const passed = res.status === 200 && json.success === true && Array.isArray(json.data);
    record(
      13,
      "RBAC",
      "Authorized roles can access permitted endpoints",
      passed,
      `Doctor successfully retrieved departments list (${json.data?.length} departments)`
    );
  } catch (e: any) {
    record(13, "RBAC", "Authorized roles can access permitted endpoints", false, e.message);
  }

  // Test 14: SUPER_ADMIN permissions work as documented
  try {
    // Super admin accesses platform overview
    const overviewRes = await fetch(`${baseUrl}/hospitals/platform/overview`, {
      headers: { Authorization: `Bearer ${roleTokens[UserRole.SUPER_ADMIN]}` },
    });
    const overviewJson: any = await overviewRes.json();

    // Super admin accesses CityCare hospital departments without belonging to CityCare
    const deptRes = await fetch(`${baseUrl}/hospitals/${hospCity.id}/departments`, {
      headers: { Authorization: `Bearer ${roleTokens[UserRole.SUPER_ADMIN]}` },
    });
    const deptJson: any = await deptRes.json();

    const passed =
      overviewRes.status === 200 &&
      overviewJson.success === true &&
      deptRes.status === 200 &&
      deptJson.success === true;

    record(
      14,
      "RBAC",
      "SUPER_ADMIN permissions work as documented",
      passed,
      `Super Admin accessed platform overview and cross-hospital departments`
    );
  } catch (e: any) {
    record(14, "RBAC", "SUPER_ADMIN permissions work as documented", false, e.message);
  }

  // -------------------------------------------------------------
  // SECTION 3: MULTI-TENANT SECURITY TESTS (Tests 15 - 22)
  // -------------------------------------------------------------

  // Test 15: Hospital A administrator cannot access Hospital B data
  try {
    const res = await fetch(`${baseUrl}/hospitals/${hospCity.id}/departments`, {
      headers: { Authorization: `Bearer ${roleTokens[UserRole.HOSPITAL_ADMIN]}` }, // Apex Admin
    });
    const json: any = await res.json();
    const passed =
      res.status === 403 &&
      json.success === false &&
      json.error?.message?.toLowerCase().includes("tenant");

    record(
      15,
      "TENANT",
      "Hospital A administrator cannot access Hospital B data",
      passed,
      `Apex Admin blocked from CityCare data: 403 Forbidden`
    );
  } catch (e: any) {
    record(15, "TENANT", "Hospital A administrator cannot access Hospital B data", false, e.message);
  }

  // Test 16: Hospital A doctor cannot access Hospital B patients
  try {
    const res = await fetch(`${baseUrl}/hospitals/${hospCity.id}/patients`, {
      headers: { Authorization: `Bearer ${roleTokens[UserRole.DOCTOR]}` }, // Apex Doctor
    });
    const json: any = await res.json();
    const passed = res.status === 403 && json.success === false;

    record(
      16,
      "TENANT",
      "Hospital A doctor cannot access Hospital B patients",
      passed,
      `Apex Doctor blocked from CityCare patients list: 403 Forbidden`
    );
  } catch (e: any) {
    record(16, "TENANT", "Hospital A doctor cannot access Hospital B patients", false, e.message);
  }

  // Test 17: Hospital A doctor cannot access Hospital B appointments
  try {
    // Find an appointment in CityCare
    const cityApt = await prisma.appointment.findFirst({
      where: { hospitalId: hospCity.id },
    });
    if (!cityApt) throw new Error("CityCare appointment not found");

    // Apex Doctor attempts to query CityCare appointment via HTTP API
    const res = await fetch(`${baseUrl}/hospitals/appointments/${cityApt.id}`, {
      headers: { Authorization: `Bearer ${roleTokens[UserRole.DOCTOR]}` }, // Apex Doctor
    });
    const json: any = await res.json();
    const passed = res.status === 403 && json.success === false && json.error?.code === "FORBIDDEN";

    record(
      17,
      "TENANT",
      "Hospital A doctor cannot access Hospital B appointments",
      passed,
      `Apex Doctor blocked from CityCare Appointment ${cityApt.id} with 403 Forbidden`
    );
  } catch (e: any) {
    record(17, "TENANT", "Hospital A doctor cannot access Hospital B appointments", false, e.message);
  }

  // Test 18: A patient cannot access another patient's records
  try {
    // Patient 1 (Rajesh) attempts to access Patient 2's records
    const otherPatient = await prisma.patient.findFirst({
      where: { mrn: "MRN-APEX-0002" },
    });
    if (!otherPatient) throw new Error("Target patient not found");

    const res = await fetch(
      `${baseUrl}/hospitals/patients/${otherPatient.id}/clinical-records`,
      {
        headers: { Authorization: `Bearer ${roleTokens[UserRole.PATIENT]}` }, // Patient 1 token
      }
    );
    const json: any = await res.json();
    const passed = res.status === 403 && json.success === false;

    record(
      18,
      "TENANT",
      "A patient cannot access another patient's records",
      passed,
      `Patient denied access to another patient's clinical file with 403 Forbidden`
    );
  } catch (e: any) {
    record(18, "TENANT", "A patient cannot access another patient's records", false, e.message);
  }

  // Test 19: A patient cannot modify another patient's profile
  try {
    const otherPatient = await prisma.patient.findFirst({
      where: { mrn: "MRN-APEX-0002" },
    });
    if (!otherPatient) throw new Error("Target patient not found");

    const res = await fetch(`${baseUrl}/hospitals/patients/${otherPatient.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${roleTokens[UserRole.PATIENT]}` }, // Patient 1 token
      body: JSON.stringify({ phone: "+91-9999999999" }),
    });
    const json: any = await res.json();
    const passed = res.status === 403 && json.success === false;

    record(
      19,
      "TENANT",
      "A patient cannot modify another patient's profile",
      passed,
      `Patient profile modification blocked with 403 Forbidden`
    );
  } catch (e: any) {
    record(19, "TENANT", "A patient cannot modify another patient's profile", false, e.message);
  }

  // Test 20: Cross-hospital appointment relationships are rejected
  try {
    // Apex Patient and CityCare Doctor
    const apexPatient = await prisma.patient.findFirst({ where: { hospitalId: hospApex.id } });
    const cityDoctor = await prisma.doctor.findFirst({ where: { hospitalId: hospCity.id } });

    let crossHospitalRejected = false;
    try {
      await hospitalsService.validateAppointmentTenant(
        hospApex.id,
        apexPatient!.id,
        cityDoctor!.id
      );
    } catch (err: any) {
      crossHospitalRejected = err.status === 403 || err.message.includes("Cross-hospital");
    }

    record(
      20,
      "TENANT",
      "Cross-hospital appointment relationships are rejected",
      crossHospitalRejected,
      `Attempt to link Apex Patient with CityCare Doctor rejected by service guard`
    );
  } catch (e: any) {
    record(20, "TENANT", "Cross-hospital appointment relationships are rejected", false, e.message);
  }

  // Test 21: Cross-hospital invoice access and patient privacy are strictly enforced
  try {
    const cityInvoice = await prisma.invoice.findFirst({
      where: { hospitalId: hospCity.id },
    });
    if (!cityInvoice) throw new Error("CityCare invoice not found");

    // Apex Accountant calls invoice endpoint for CityCare invoice
    const res = await fetch(`${baseUrl}/hospitals/invoices/${cityInvoice.id}`, {
      headers: { Authorization: `Bearer ${roleTokens[UserRole.ACCOUNTANT]}` }, // Apex Accountant
    });
    const json: any = await res.json();
    const crossHospitalBlocked = res.status === 403 && json.success === false;

    // Patient 1 (Rajesh) attempts to view another patient's invoice (Patient 2's invoice in Apex)
    const otherPatient = await prisma.patient.findFirst({
      where: { mrn: "MRN-APEX-0002" },
      include: { invoices: true },
    });
    const otherInvoice = otherPatient?.invoices?.[0];
    let crossPatientBlocked = true;
    if (otherInvoice) {
      const patientRes = await fetch(`${baseUrl}/hospitals/invoices/${otherInvoice.id}`, {
        headers: { Authorization: `Bearer ${roleTokens[UserRole.PATIENT]}` }, // Patient 1 token
      });
      const patientJson: any = await patientRes.json();
      crossPatientBlocked = patientRes.status === 403 && patientJson.success === false;
    }

    const passed = crossHospitalBlocked && crossPatientBlocked;

    record(
      21,
      "TENANT",
      "Cross-hospital and cross-patient invoice access is rejected",
      passed,
      `Apex Accountant blocked from CityCare invoice; Patient blocked from other patient's invoice with 403 Forbidden`
    );
  } catch (e: any) {
    record(21, "TENANT", "Cross-hospital and cross-patient invoice access is rejected", false, e.message);
  }

  // Test 22: Client-supplied hospitalId cannot bypass tenant isolation
  try {
    // Apex staff user calls endpoint with client-supplied hospitalId parameter pointing to CityCare
    const res = await fetch(`${baseUrl}/hospitals/${hospCity.id}/departments`, {
      headers: { Authorization: `Bearer ${roleTokens[UserRole.RECEPTIONIST]}` }, // Apex Receptionist
    });
    const json: any = await res.json();
    const passed =
      res.status === 403 &&
      json.success === false &&
      json.error?.message?.toLowerCase().includes("tenant");

    record(
      22,
      "TENANT",
      "Client-supplied hospitalId cannot bypass tenant isolation",
      passed,
      `TenantGuard rejected forged hospitalId parameter with 403 Forbidden`
    );
  } catch (e: any) {
    record(22, "TENANT", "Client-supplied hospitalId cannot bypass tenant isolation", false, e.message);
  }

  console.log("\n=================================================================");
  const allPassed = results.every((r) => r.passed);
  console.log(
    `TOTAL TESTS: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${
      results.filter((r) => !r.passed).length
    }`
  );
  console.log(`SUITE RESULT: ${allPassed ? "ALL 22 TESTS PASSED 🎉" : "TEST FAILURES DETECTED ❌"}`);
  console.log("=================================================================");

  await app.close();

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase3Tests().catch((e) => {
  console.error("Test runner execution error:", e);
  process.exit(1);
});
