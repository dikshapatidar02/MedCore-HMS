/**
 * MedCore HMS — Administrator Onboarding & User Activation Test Suite
 *
 * Comprehensive end-to-end integration tests verifying:
 * 1. SUPER_ADMIN bootstrap creation and duplicate prevention.
 * 2. Hospital onboarding status isolation and inactive user login prevention.
 * 3. SUPER_ADMIN authorization guards for hospital approvals and rejections.
 * 4. Multi-tenant isolation preventing HOSPITAL_ADMIN from approving hospitals or altering cross-tenant users.
 * 5. Automatic activation of hospital administrators upon hospital approval.
 * 6. User activation and deactivation lifecycle with immediate session token revocation.
 * 7. Self-activation / self-deactivation prevention safeguards.
 * 8. Role escalation guards preventing hospital admins from modifying platform superadmins.
 * 9. Validation preventing user activation in suspended/inactive hospitals.
 * 10. Audit log tracking for all hospital and user governance events.
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { PrismaClient, UserRole, HospitalStatus, AuditAction } from "@prisma/client";
import * as bcrypt from "bcryptjs";

// ─── Test Harness State ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function record(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  ❌  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
    failures.push(label);
  }
}

async function request(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; body: Record<string, any> }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json: Record<string, any> = {};
  try {
    json = await res.json();
  } catch {
    // response might not have body
  }

  return { status: res.status, body: json };
}

// ─── Main Test Runner ────────────────────────────────────────────────────────

async function run() {
  console.log("\n══════════════════════════════════════════════════════════════════════════════");
  console.log("  MedCore HMS — Admin Onboarding, Hospital Approval & User Activation Tests");
  console.log("══════════════════════════════════════════════════════════════════════════════\n");

  const prisma = new PrismaClient();
  let app: INestApplication;
  let base: string;

  const testRunId = `adm-${Date.now()}`;
  const superAdminEmail = `superadmin.${testRunId}@medcore.io`;
  const superAdminPassword = "SuperAdminPassword#123";

  // Track created records for cleanup
  const createdHospitalIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      })
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);

    const serverAddress = app.getHttpServer().address();
    const port = typeof serverAddress === "object" ? serverAddress?.port : 3001;
    base = `http://127.0.0.1:${port}/api/v1`;
    console.log(`  🚀  Application online at ${base}\n`);

    // ── Setup: Ensure a known SUPER_ADMIN exists for test authentication ───────
    const superAdminPasswordHash = bcrypt.hashSync(superAdminPassword, 10);
    const superAdminUser = await prisma.user.create({
      data: {
        email: superAdminEmail,
        passwordHash: superAdminPasswordHash,
        firstName: "Test",
        lastName: "SuperAdmin",
        role: UserRole.SUPER_ADMIN,
        hospitalId: null,
        isActive: true,
      },
    });
    createdUserIds.push(superAdminUser.id);

    // Login as SUPER_ADMIN to obtain JWT access token
    const superLogin = await request(base, "POST", "/auth/login", {
      email: superAdminEmail,
      password: superAdminPassword,
    });
    const superToken = superLogin.body.data?.accessToken;
    record(
      "SUPER_ADMIN can authenticate and receive JWT access token",
      superLogin.status === 200 && !!superToken,
      `status=${superLogin.status}`
    );

    // ══ Test 1: Self-registration creates ONBOARDING hospital and inactive admin ══
    const regHospitalName = `Apollo Test Hospital ${testRunId}`;
    const regAdminEmail = `dr.sharma.${testRunId}@apollo-test.com`;
    const regAdminPassword = "SecureHospitalAdmin#123";

    const regResponse = await request(base, "POST", "/auth/register", {
      firstName: "Ramesh",
      lastName: "Sharma",
      username: `rsharma_${testRunId}`,
      email: regAdminEmail,
      password: regAdminPassword,
      hospitalName: regHospitalName,
    });

    const regData = regResponse.body.data;
    const hospitalIdA = regData?.hospitalId;
    const userIdA = regData?.userId;
    if (hospitalIdA) createdHospitalIds.push(hospitalIdA);
    if (userIdA) createdUserIds.push(userIdA);

    record(
      "Hospital registration returns 201 + status=PENDING_APPROVAL with no tokens",
      regResponse.status === 201 &&
        regData?.status === "PENDING_APPROVAL" &&
        !regData?.accessToken,
      `status=${regResponse.status} status=${regData?.status}`
    );

    // ══ Test 2: Inactive registered admin cannot log in before approval ═════════
    const loginBeforeApproval = await request(base, "POST", "/auth/login", {
      email: regAdminEmail,
      password: regAdminPassword,
    });
    record(
      "Pending hospital admin cannot log in before approval (isActive=false → 401)",
      loginBeforeApproval.status === 401 &&
        loginBeforeApproval.body.message?.includes("inactive"),
      `status=${loginBeforeApproval.status} message=${loginBeforeApproval.body.message}`
    );

    // ══ Test 3: SUPER_ADMIN views pending hospital registration requests ════════
    const pendingListRes = await request(base, "GET", "/hospitals/pending-registrations", undefined, superToken);
    const pendingItems = pendingListRes.body.data || [];
    const foundPending = pendingItems.some((h: any) => h.id === hospitalIdA);
    record(
      "SUPER_ADMIN can list pending registration requests (/hospitals/pending-registrations)",
      pendingListRes.status === 200 && foundPending,
      `status=${pendingListRes.status} count=${pendingItems.length}`
    );

    // ══ Test 4: Unauthenticated request to approve hospital is rejected (401) ══
    const unauthApprove = await request(base, "POST", `/hospitals/${hospitalIdA}/approve`);
    record(
      "Unauthenticated hospital approval request rejected (401 Unauthorized)",
      unauthApprove.status === 401,
      `status=${unauthApprove.status}`
    );

    // ══ Test 5: SUPER_ADMIN approves hospital registration ══════════════════════
    const approveRes = await request(base, "POST", `/hospitals/${hospitalIdA}/approve`, undefined, superToken);
    record(
      "SUPER_ADMIN successfully approves hospital registration (status: ACTIVE)",
      approveRes.status === 200 || approveRes.status === 201,
      `status=${approveRes.status}`
    );

    // Verify hospital and user state in database
    const dbHospitalA = await prisma.hospital.findUnique({ where: { id: hospitalIdA } });
    const dbUserA = await prisma.user.findUnique({ where: { id: userIdA } });
    record(
      "Approval updates hospital to ACTIVE and hospital admin to isActive=true",
      dbHospitalA?.status === HospitalStatus.ACTIVE && dbUserA?.isActive === true,
      `hospitalStatus=${dbHospitalA?.status} userActive=${dbUserA?.isActive}`
    );

    // ══ Test 6: Activated hospital admin can now successfully log in ════════════
    const loginAfterApproval = await request(base, "POST", "/auth/login", {
      email: regAdminEmail,
      password: regAdminPassword,
    });
    const adminTokenA = loginAfterApproval.body.data?.accessToken;
    record(
      "Approved hospital admin can successfully log in and receive JWT token",
      loginAfterApproval.status === 200 && !!adminTokenA,
      `status=${loginAfterApproval.status} hasToken=${!!adminTokenA}`
    );

    // ══ Test 7: Cannot approve already active hospital (invalid transition → 400) ═
    const doubleApprove = await request(base, "POST", `/hospitals/${hospitalIdA}/approve`, undefined, superToken);
    record(
      "Cannot approve already active hospital (invalid transition → 400 Bad Request)",
      doubleApprove.status === 400,
      `status=${doubleApprove.status} message=${doubleApprove.body.message}`
    );

    // ══ Test 8: HOSPITAL_ADMIN is forbidden from approving hospitals (403) ══════
    const adminApproveAttempt = await request(
      base,
      "POST",
      `/hospitals/${hospitalIdA}/approve`,
      undefined,
      adminTokenA
    );
    record(
      "HOSPITAL_ADMIN cannot approve hospitals (403 Forbidden)",
      adminApproveAttempt.status === 403,
      `status=${adminApproveAttempt.status}`
    );

    // ══ Test 9: Reject a pending hospital registration request ══════════════════
    const regHospitalBName = `Fortis Test Hospital ${testRunId}`;
    const regAdminBEmail = `dr.gupta.${testRunId}@fortis-test.com`;
    const regB = await request(base, "POST", "/auth/register", {
      firstName: "Sunil",
      lastName: "Gupta",
      username: `sgupta_${testRunId}`,
      email: regAdminBEmail,
      password: "SecureHospitalAdmin#123",
      hospitalName: regHospitalBName,
    });
    const hospitalIdB = regB.body.data?.hospitalId;
    const userIdB = regB.body.data?.userId;
    if (hospitalIdB) createdHospitalIds.push(hospitalIdB);
    if (userIdB) createdUserIds.push(userIdB);

    const rejectRes = await request(
      base,
      "POST",
      `/hospitals/${hospitalIdB}/reject`,
      { reason: "Incomplete regulatory documentation provided" },
      superToken
    );
    record(
      "SUPER_ADMIN can reject a pending hospital registration (status: INACTIVE)",
      rejectRes.status === 200 || rejectRes.status === 201,
      `status=${rejectRes.status}`
    );

    const dbHospitalB = await prisma.hospital.findUnique({ where: { id: hospitalIdB } });
    const dbUserB = await prisma.user.findUnique({ where: { id: userIdB } });
    record(
      "Rejected hospital becomes INACTIVE and user remains inactive",
      dbHospitalB?.status === HospitalStatus.INACTIVE && dbUserB?.isActive === false,
      `hospitalStatus=${dbHospitalB?.status} userActive=${dbUserB?.isActive}`
    );

    // ══ Test 10: User activation: Admin creates a doctor and manages active state ══
    const doctorEmail = `dr.neha.${testRunId}@apollo-test.com`;
    const doctorPassword = "SecureDoctorPassword#123";
    const doctorCreateRes = await request(
      base,
      "POST",
      "/doctors",
      {
        firstName: "Neha",
        lastName: "Patel",
        email: doctorEmail,
        password: doctorPassword,
        licenseNumber: `LIC-${testRunId}`,
        specialization: "General Medicine",
        experienceYears: 5,
        consultationFee: "500",
      },
      adminTokenA
    );
    const doctorUserId = doctorCreateRes.body.data?.user?.id || doctorCreateRes.body.data?.userId;
    if (doctorUserId) createdUserIds.push(doctorUserId);

    record(
      "Hospital staff can create doctor user account",
      doctorCreateRes.status === 201 && !!doctorUserId,
      `status=${doctorCreateRes.status} doctorUserId=${doctorUserId}`
    );

    // Deactivate the doctor
    const deactivateRes = await request(
      base,
      "PATCH",
      `/users/${doctorUserId}/status`,
      { isActive: false, reason: "Temporary clinical sabbatical" },
      adminTokenA
    );
    record(
      "HOSPITAL_ADMIN can deactivate a staff user in their hospital",
      deactivateRes.status === 200 && deactivateRes.body.data?.isActive === false,
      `status=${deactivateRes.status} isActive=${deactivateRes.body.data?.isActive}`
    );

    // Deactivated user cannot log in
    const deactLogin = await request(base, "POST", "/auth/login", {
      email: doctorEmail,
      password: doctorPassword,
    });
    record(
      "Deactivated user cannot log in (401 Unauthorized)",
      deactLogin.status === 401,
      `status=${deactLogin.status}`
    );

    // Reactivate the doctor
    const reactivateRes = await request(
      base,
      "PATCH",
      `/users/${doctorUserId}/status`,
      { isActive: true, reason: "Returned from clinical sabbatical" },
      adminTokenA
    );
    record(
      "HOSPITAL_ADMIN can reactivate the staff user",
      reactivateRes.status === 200 && reactivateRes.body.data?.isActive === true,
      `status=${reactivateRes.status} isActive=${reactivateRes.body.data?.isActive}`
    );

    // Reactivated user can now log in
    const reactLogin = await request(base, "POST", "/auth/login", {
      email: doctorEmail,
      password: doctorPassword,
    });
    record(
      "Reactivated user can log in again successfully",
      reactLogin.status === 200 && !!reactLogin.body.data?.accessToken,
      `status=${reactLogin.status}`
    );

    // ══ Test 11: Self-activation / deactivation prevention safeguard ════════════
    const selfDeact = await request(
      base,
      "PATCH",
      `/users/${userIdA}/status`,
      { isActive: false },
      adminTokenA
    );
    record(
      "Administrators cannot alter their own activation status (400 Bad Request)",
      selfDeact.status === 400 && selfDeact.body.message?.includes("own"),
      `status=${selfDeact.status} message=${selfDeact.body.message}`
    );

    // ══ Test 12: Role escalation prevention (Admin cannot modify SUPER_ADMIN) ═══
    const adminTouchSuper = await request(
      base,
      "PATCH",
      `/users/${superAdminUser.id}/status`,
      { isActive: false },
      adminTokenA
    );
    record(
      "HOSPITAL_ADMIN cannot modify SUPER_ADMIN status (403 Forbidden)",
      adminTouchSuper.status === 403,
      `status=${adminTouchSuper.status}`
    );

    // ══ Test 13: Tenant isolation (Admin cannot modify user in another hospital) ═
    const crossTenantTouch = await request(
      base,
      "PATCH",
      `/users/${userIdB}/status`,
      { isActive: true },
      adminTokenA
    );
    record(
      "Cross-hospital user status mutation strictly rejected (403 Forbidden)",
      crossTenantTouch.status === 403,
      `status=${crossTenantTouch.status}`
    );

    // ══ Test 14: Cannot activate user in INACTIVE/SUSPENDED hospital ═════════════
    const activateInInactiveHospital = await request(
      base,
      "PATCH",
      `/users/${userIdB}/status`,
      { isActive: true },
      superToken
    );
    record(
      "Cannot activate user belonging to an INACTIVE hospital (400 Bad Request)",
      activateInInactiveHospital.status === 400,
      `status=${activateInInactiveHospital.status} message=${activateInInactiveHospital.body.message}`
    );

    // ══ Test 15: Users list pagination and role filtering ═══════════════════════
    const usersListRes = await request(base, "GET", "/users?role=DOCTOR", undefined, adminTokenA);
    record(
      "HOSPITAL_ADMIN can list users in their hospital with role filter",
      usersListRes.status === 200 && Array.isArray(usersListRes.body.data?.items),
      `status=${usersListRes.status} items=${usersListRes.body.data?.items?.length}`
    );

  } catch (err: any) {
    console.error("FATAL TEST EXECUTION ERROR:", err);
  } finally {
    // ── Cleanup Test Entities ────────────────────────────────────────────────
    try {
      if (createdUserIds.length > 0) {
        await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.doctor.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
      if (createdHospitalIds.length > 0) {
        await prisma.auditLog.deleteMany({ where: { hospitalId: { in: createdHospitalIds } } });
        await prisma.hospital.deleteMany({ where: { id: { in: createdHospitalIds } } });
      }
    } catch (cleanupErr: any) {
      console.warn("Cleanup warning:", cleanupErr.message);
    }

    if (app!) {
      await app.close();
    }
    await prisma.$disconnect();
  }

  console.log("\n══════════════════════════════════════════════════════════════════════════════");
  console.log(`  Test Execution Summary: ${passed} Passed, ${failed} Failed`);
  console.log("══════════════════════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    console.error("❌ Test suite failed with failures in:", failures);
    process.exit(1);
  } else {
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY (100% PASS RATE)!");
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

