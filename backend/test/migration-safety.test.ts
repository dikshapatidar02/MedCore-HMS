/**
 * MedCore HMS — Production Migration Safety Guard Verification
 *
 * This test suite validates all preflight guards of deploy-migrations.ts:
 * 1. Missing / empty DATABASE_URL rejection.
 * 2. Invalid URL format rejection.
 * 3. Non-PostgreSQL protocol rejection.
 * 4. Localhost and local development hostnames rejection (127.0.0.1, ::1, localhost, host.docker.internal).
 * 5. Non-Neon cloud hostnames rejection.
 * 6. Pooled connection string (-pooler) rejection.
 * 7. Insecure SSL configuration (sslmode=disable) rejection.
 * 8. Valid direct Neon PostgreSQL URL acceptance and extraction of sanitized target details.
 * 9. Sensitive credential non-exposure in sanitized target output.
 * 10. Confirmation guard behavior (flag-based and non-interactive handling).
 *
 * SAFETY GUARANTEE: Zero database connections or migrations are executed by this test suite.
 */

import { validateDatabaseUrl, promptConfirmation } from "../scripts/deploy-migrations";

let passed = 0;
let failed = 0;

function assert(condition: unknown, label: string, detail?: string) {
  if (Boolean(condition)) {
    console.log(`  ✅  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  ❌  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function runMigrationSafetyTests() {
  console.log("==========================================================================");
  console.log("🛡️  MedCore HMS Migration Safety Guard Test Suite");
  console.log("==========================================================================\n");

  // 1. Missing and Empty DATABASE_URL Rejection
  console.log("--- 1. Missing Environment Variable Rejection ---");
  const missingResult = validateDatabaseUrl(undefined);
  assert(
    !missingResult.valid && missingResult.error?.includes("DATABASE_URL is missing"),
    "Rejects undefined DATABASE_URL with missing environment message"
  );

  const emptyResult = validateDatabaseUrl("   ");
  assert(
    !emptyResult.valid && emptyResult.error?.includes("DATABASE_URL is missing"),
    "Rejects whitespace-only DATABASE_URL"
  );

  // 2. Malformed URL Rejection
  console.log("\n--- 2. Malformed URL Rejection ---");
  const malformedResult = validateDatabaseUrl("not-a-valid-connection-string");
  assert(
    !malformedResult.valid && malformedResult.error?.includes("not a valid URL format"),
    "Rejects non-URL string"
  );

  // 3. Non-PostgreSQL Protocol Rejection
  console.log("\n--- 3. Protocol Validation ---");
  const mysqlResult = validateDatabaseUrl("mysql://user:pass@ep-test-123.us-east-2.aws.neon.tech/medcore");
  assert(
    !mysqlResult.valid && mysqlResult.error?.includes("Invalid protocol 'mysql:'"),
    "Rejects MySQL protocol"
  );

  const httpResult = validateDatabaseUrl("https://ep-test-123.us-east-2.aws.neon.tech/medcore");
  assert(
    !httpResult.valid && httpResult.error?.includes("Invalid protocol 'https:'"),
    "Rejects HTTP/HTTPS protocol"
  );

  // 4. Localhost and Development Hostname Rejection
  console.log("\n--- 4. Localhost & Development Hostname Rejection ---");
  const localHosts = [
    "postgresql://postgres:secret@localhost:5432/medcore",
    "postgresql://postgres:secret@127.0.0.1:5432/medcore",
    "postgresql://postgres:secret@[::1]:5432/medcore",
    "postgresql://postgres:secret@0.0.0.0:5432/medcore",
    "postgresql://postgres:secret@host.docker.internal:5432/medcore",
    "postgresql://postgres:secret@medcore.local:5432/medcore",
  ];

  for (const url of localHosts) {
    const res = validateDatabaseUrl(url);
    const host = new URL(url).hostname;
    assert(
      !res.valid && res.error?.includes("local development address"),
      `Rejects local development host: '${host}'`
    );
  }

  // 5. Non-Neon Hostname Rejection
  console.log("\n--- 5. Non-Neon Domain Rejection ---");
  const nonNeonHosts = [
    "postgresql://user:pass@my-custom-vps.com:5432/medcore",
    "postgresql://user:pass@mydb.rds.amazonaws.com:5432/medcore",
    "postgresql://user:pass@postgres.render.com:5432/medcore",
    "postgresql://user:pass@db.supabase.co:5432/medcore",
  ];

  for (const url of nonNeonHosts) {
    const res = validateDatabaseUrl(url);
    assert(
      !res.valid && res.error?.includes("must target a Neon PostgreSQL database ending in '.neon.tech'"),
      `Rejects non-Neon cloud host: '${new URL(url).hostname}'`
    );
  }

  // 6. Neon Pooled Connection String (-pooler) Rejection
  console.log("\n--- 6. Neon Pooled (-pooler) Connection Rejection ---");
  const pooledUrl = "postgresql://user:secret@ep-solitary-123456-pooler.us-east-2.aws.neon.tech/medcore?sslmode=require";
  const pooledRes = validateDatabaseUrl(pooledUrl);
  assert(
    !pooledRes.valid && pooledRes.error?.includes("contains '-pooler' (pooled endpoint)"),
    "Rejects pooled connection string containing '-pooler' with advisory lock guidance"
  );

  // 7. Insecure SSL Mode Rejection
  console.log("\n--- 7. Insecure SSL Configuration Rejection ---");
  const insecureSslUrl = "postgresql://user:secret@ep-solitary-123456.us-east-2.aws.neon.tech/medcore?sslmode=disable";
  const insecureRes = validateDatabaseUrl(insecureSslUrl);
  assert(
    !insecureRes.valid && insecureRes.error?.includes("'sslmode=disable' is not permitted"),
    "Rejects 'sslmode=disable' for Neon cloud connection"
  );

  // 8. Valid Direct Neon PostgreSQL Connection Acceptance
  console.log("\n--- 8. Valid Direct Neon PostgreSQL Connection Acceptance ---");
  const validNeonUrl = "postgresql://medcore_owner:super_secret_password_xyz@ep-solitary-voice-998877.us-east-2.aws.neon.tech:5432/medcore?sslmode=require";
  const validRes = validateDatabaseUrl(validNeonUrl);

  assert(validRes.valid === true, "Accepts valid direct Neon PostgreSQL connection string");
  assert(validRes.target?.host === "ep-solitary-voice-998877.us-east-2.aws.neon.tech", "Extracts correct Neon host");
  assert(validRes.target?.database === "medcore", "Extracts correct database name");
  assert(validRes.target?.protocol === "postgresql", "Identifies postgresql protocol");
  assert(validRes.target?.port === "5432", "Identifies port 5432");
  assert(validRes.target?.sslMode === "require", "Extracts sslmode=require");

  // Also verify 'postgres:' shorthand protocol
  const validShorthandUrl = "postgres://medcore_owner:super_secret_password_xyz@ep-solitary-voice-998877.us-east-2.aws.neon.tech/production_hms";
  const shorthandRes = validateDatabaseUrl(validShorthandUrl);
  assert(
    shorthandRes.valid === true && shorthandRes.target?.protocol === "postgres",
    "Accepts 'postgres:' protocol shorthand"
  );

  // 9. Sensitive Credential Non-Exposure
  console.log("\n--- 9. Credential Sanitization Verification ---");
  const targetStr = JSON.stringify(validRes.target || {});
  assert(!targetStr.includes("super_secret_password_xyz"), "Password is NOT exposed in sanitized target details");
  assert(!targetStr.includes("medcore_owner"), "Username is NOT exposed in sanitized target details");
  assert(!targetStr.includes("postgresql://"), "Raw connection string is NOT exposed in sanitized target details");

  // 10. Confirmation Guard Behavior
  console.log("\n--- 10. Confirmation Guard Behavior ---");
  // Test --confirm flag
  process.argv.push("--confirm");
  const confirmedWithFlag = await promptConfirmation(validRes.target!);
  assert(confirmedWithFlag === true, "promptConfirmation returns true when --confirm flag is present");
  process.argv.pop();

  // Test MEDCORE_CONFIRM_MIGRATE=true
  process.env.MEDCORE_CONFIRM_MIGRATE = "true";
  const confirmedWithEnv = await promptConfirmation(validRes.target!);
  assert(confirmedWithEnv === true, "promptConfirmation returns true when MEDCORE_CONFIRM_MIGRATE=true");
  delete process.env.MEDCORE_CONFIRM_MIGRATE;

  // Test non-interactive rejection when no flag is supplied
  const originalIsTTY = process.stdin.isTTY;
  try {
    (process.stdin as any).isTTY = false;
    const nonInteractiveResult = await promptConfirmation(validRes.target!);
    assert(
      nonInteractiveResult === false,
      "promptConfirmation safely rejects non-interactive execution without explicit confirmation flag"
    );
  } finally {
    (process.stdin as any).isTTY = originalIsTTY;
  }

  // Summary
  console.log("\n==========================================================================");
  console.log(`MIGRATION SAFETY TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runMigrationSafetyTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
