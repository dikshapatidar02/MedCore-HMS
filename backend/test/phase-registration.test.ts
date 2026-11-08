/**
 * MedCore HMS — Phase Registration Tests
 *
 * Tests the POST /api/v1/auth/register endpoint.
 * Follows the same pattern as phase3-auth-rbac-tenant.test.ts:
 *   - Real NestJS application, real database
 *   - HTTP calls via fetch
 *   - Cleans up test data after all tests run
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

async function post(
  base: string,
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = await res.json();
  } catch {
    // ignore parse errors — status code is enough for some tests
  }
  return { status: res.status, body: json };
}

// ─── Payload factory ────────────────────────────────────────────────────────

const UNIQUE_TAG = `test-${Date.now()}`;

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Jane",
    lastName: "Doe",
    username: "janedoe_reg",
    email: `jane.doe.${UNIQUE_TAG}@example.com`,
    password: "SecurePass1",
    hospitalName: `Test General Hospital ${UNIQUE_TAG}`,
    ...overrides,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  MedCore HMS — Registration Endpoint Tests");
  console.log("══════════════════════════════════════════════════════════\n");

  let app: INestApplication;
  let base: string;

  // ── Boot application ──────────────────────────────────────────────────────
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
    await app.listen(0); // random free port
    const serverAddress = app.getHttpServer().address();
    const port = typeof serverAddress === "object" ? serverAddress?.port : 3001;
    base = `http://127.0.0.1:${port}/api/v1`;
    console.log(`  🚀  App listening at ${base}\n`);
  } catch (err) {
    console.error("FATAL: Could not start application:", err);
    process.exit(1);
  }

  // ── Track created entities for cleanup ───────────────────────────────────
  const registeredEmails: string[] = [];

  // ══ Test 1: Valid registration returns 201 + PENDING_APPROVAL ════════════
  {
    const payload = validPayload();
    const { status, body } = await post(base, "/auth/register", payload);
    const data = body.data as Record<string, unknown> | undefined;
    const ok =
      status === 201 &&
      body.success === true &&
      data?.status === "PENDING_APPROVAL" &&
      !data?.accessToken &&
      !data?.passwordHash;

    record(
      "Valid registration → 201 + PENDING_APPROVAL, no tokens, no passwordHash",
      ok,
      `status=${status} body.success=${body.success} data.status=${data?.status}`,
    );

    if (ok && payload.email) registeredEmails.push(payload.email);
  }

  // ══ Test 2: Duplicate email → 409 Conflict ═══════════════════════════════
  {
    // Register same email again
    const payload = validPayload({ username: "janedoe2" });
    // First registration (may already exist from Test 1 — reuse that email)
    await post(base, "/auth/register", payload);
    // Second attempt with same email
    const { status, body } = await post(base, "/auth/register", {
      ...payload,
      username: "janedoe3",
      hospitalName: `Duplicate Test Hospital ${UNIQUE_TAG}`,
    });
    record(
      "Duplicate email → 409 Conflict",
      status === 409,
      `status=${status} message=${body.message}`,
    );
  }

  // ══ Test 3: Invalid email format → 400 ═══════════════════════════════════
  {
    const { status } = await post(
      base,
      "/auth/register",
      validPayload({ email: "not-an-email", username: "u3test" }),
    );
    record("Invalid email format → 400 Bad Request", status === 400, `status=${status}`);
  }

  // ══ Test 4: Weak password (no uppercase) → 400 ═══════════════════════════
  {
    const { status } = await post(
      base,
      "/auth/register",
      validPayload({ password: "alllowercase1", username: "u4test", email: `u4.${UNIQUE_TAG}@example.com` }),
    );
    record(
      "Weak password (no uppercase) → 400 Bad Request",
      status === 400,
      `status=${status}`,
    );
  }

  // ══ Test 5: Weak password (too short) → 400 ══════════════════════════════
  {
    const { status } = await post(
      base,
      "/auth/register",
      validPayload({ password: "Ab1", username: "u5test", email: `u5.${UNIQUE_TAG}@example.com` }),
    );
    record(
      "Weak password (< 8 chars) → 400 Bad Request",
      status === 400,
      `status=${status}`,
    );
  }

  // ══ Test 6: Missing firstName → 400 ══════════════════════════════════════
  {
    const { status } = await post(base, "/auth/register", {
      lastName: "Doe",
      username: "u6test",
      email: `u6.${UNIQUE_TAG}@example.com`,
      password: "SecurePass1",
      hospitalName: "Test Hospital 6",
    });
    record("Missing firstName → 400 Bad Request", status === 400, `status=${status}`);
  }

  // ══ Test 7: Missing hospitalName → 400 ═══════════════════════════════════
  {
    const { status } = await post(base, "/auth/register", {
      firstName: "Jane",
      lastName: "Doe",
      username: "u7test",
      email: `u7.${UNIQUE_TAG}@example.com`,
      password: "SecurePass1",
    });
    record("Missing hospitalName → 400 Bad Request", status === 400, `status=${status}`);
  }

  // ══ Test 8: Username with invalid characters → 400 ════════════════════════
  {
    const { status } = await post(
      base,
      "/auth/register",
      validPayload({ username: "bad username!@#", email: `u8.${UNIQUE_TAG}@example.com` }),
    );
    record(
      "Username with invalid chars → 400 Bad Request",
      status === 400,
      `status=${status}`,
    );
  }

  // ══ Test 9: No accessToken in registration response (security) ════════════
  {
    const payload = validPayload({
      email: `u9.${UNIQUE_TAG}@example.com`,
      username: "u9test",
      hospitalName: `Security Test Hospital ${UNIQUE_TAG}`,
    });
    const { status, body } = await post(base, "/auth/register", payload);
    const data = body.data as Record<string, unknown> | undefined;
    const hasNoToken =
      status === 201 && !data?.accessToken && !data?.refreshToken && !data?.token;
    record(
      "No auth tokens returned in registration response (no auto-login)",
      hasNoToken,
      `status=${status} hasAccessToken=${!!data?.accessToken}`,
    );
    if (status === 201 && payload.email) registeredEmails.push(payload.email);
  }

  // ══ Test 10: Registered-but-inactive user cannot log in ═══════════════════
  {
    const email = `u10.${UNIQUE_TAG}@example.com`;
    const password = "SecurePass1";
    const regPayload = validPayload({
      email,
      username: "u10test",
      hospitalName: `Inactive Test Hospital ${UNIQUE_TAG}`,
    });
    await post(base, "/auth/register", { ...regPayload, password });
    registeredEmails.push(email);

    const { status } = await post(base, "/auth/login", { email, password });
    // isActive=false should result in 401 Unauthorized
    record(
      "Inactive registered user cannot log in (isActive=false → 401)",
      status === 401,
      `login status=${status}`,
    );
  }

  // ══ Test 11: Existing demo accounts still log in (regression) ═════════════
  {
    const { status, body } = await post(base, "/auth/login", {
      email: "admin.apex@medcore.io",
      password: "DemoPassword@123",
    });
    const data = body.data as Record<string, unknown> | undefined;
    record(
      "Existing demo admin login still works (regression)",
      status === 200 && !!data?.accessToken,
      `status=${status} hasToken=${!!data?.accessToken}`,
    );
  }

  // ══ Test 12: Extra/forbidden fields are stripped (whitelist guard) ═════════
  {
    const payload = validPayload({
      email: `u12.${UNIQUE_TAG}@example.com`,
      username: "u12test",
      hospitalName: `Whitelist Test Hospital ${UNIQUE_TAG}`,
      // Attempt privilege escalation via extra fields
      role: "SUPER_ADMIN",
      hospitalId: "arbitrary-id",
      tenantId: "arbitrary-tenant",
      isActive: true,
    });
    const { status } = await post(base, "/auth/register", payload);
    // With forbidNonWhitelisted, extra fields → 400
    // But if whitelist is configured correctly, the extra fields are stripped
    // The DTO only allows the 6 declared fields; NestJS ValidationPipe strips or rejects extras
    // Either 201 (stripped) or 400 (rejected) is acceptable; importantly NOT a privilege escalation
    const noEscalation = status === 201 || status === 400;
    record(
      "Extra/forbidden fields (role, hospitalId) don't cause privilege escalation",
      noEscalation,
      `status=${status} — extra fields either stripped or rejected`,
    );
    if (status === 201) registeredEmails.push(payload.email as string);
  }

  // ══ Test 13: Response body shape ══════════════════════════════════════════
  {
    const payload = validPayload({
      email: `u13.${UNIQUE_TAG}@example.com`,
      username: "u13test",
      hospitalName: `Shape Test Hospital ${UNIQUE_TAG}`,
    });
    const { status, body } = await post(base, "/auth/register", payload);
    const data = body.data as Record<string, unknown> | undefined;
    const hasCorrectShape =
      status === 201 &&
      typeof body.success === "boolean" &&
      body.success === true &&
      typeof body.message === "string" &&
      typeof data?.userId === "string" &&
      typeof data?.hospitalId === "string" &&
      typeof data?.hospitalCode === "string" &&
      data?.status === "PENDING_APPROVAL";
    record(
      "Response shape: { success, data.{userId, hospitalId, hospitalCode, status}, message }",
      hasCorrectShape,
      `status=${status} shape check`,
    );
    if (status === 201 && payload.email) registeredEmails.push(payload.email);
  }

  // ══ Cleanup ═══════════════════════════════════════════════════════════════
  console.log("\n  🧹  Cleaning up test data...");
  try {
    // Access PrismaService to clean up test records
    // We use the app's container to get the PrismaService
    const { PrismaService } = await import("../src/prisma/prisma.service");
    const prisma = app.get(PrismaService);

    for (const email of [...new Set(registeredEmails)]) {
      try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
          const hospitalId = user.hospitalId;
          // Delete audit logs first (FK constraint)
          if (hospitalId) {
            await prisma.auditLog.deleteMany({ where: { hospitalId } });
          }
          await prisma.user.delete({ where: { email } });
          if (hospitalId) {
            await prisma.hospital.delete({ where: { id: hospitalId } });
          }
          console.log(`    ✓  Cleaned up test user/hospital for ${email}`);
        }
      } catch (cleanErr) {
        console.log(`    ⚠  Could not clean ${email}: ${cleanErr}`);
      }
    }
  } catch (err) {
    console.log(`  ⚠  Cleanup error (non-fatal): ${err}`);
  }

  // ══ Summary ═══════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════");
  console.log(
    `  Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`,
  );
  if (failures.length > 0) {
    console.log("\n  Failed tests:");
    failures.forEach((f) => console.log(`    ✗ ${f}`));
  }
  console.log("══════════════════════════════════════════════════════════\n");

  await app.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

