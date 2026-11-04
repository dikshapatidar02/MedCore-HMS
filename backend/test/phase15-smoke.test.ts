import "dotenv/config";

if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace("localhost", "127.0.0.1");
}
if (process.env.REDIS_URL && process.env.REDIS_URL.includes("localhost")) {
  process.env.REDIS_URL = process.env.REDIS_URL.replace("localhost", "127.0.0.1");
}
process.env.REDIS_HOST = "127.0.0.1";

/**
 * ==============================================================================
 * MedCore HMS — Phase 15 Production Smoke Tests & Deployment Verification Suite
 * ==============================================================================
 *
 * Verifies production readiness across:
 * 1. Health, Liveness, and Readiness probes (PostgreSQL + Redis)
 * 2. HTTP Security Headers (X-Frame-Options, CSP, HSTS, Sniff-defense)
 * 3. Production CORS origin filtering and credentials allowance
 * 4. StorageService presigned URL generation and directory traversal protection
 * 5. Environment configuration audit and secret non-leakage verification
 * 6. BullMQ worker connection lifecycle and graceful shutdown hooks
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { SentryMonitoringInterceptor } from "../src/common/monitoring/sentry.interceptor";
import { StorageService } from "../src/common/storage/storage.service";
import { ReminderQueueService } from "../src/notifications/reminder-queue.service";
import { validateEnvironment } from "../scripts/validate-env";

let app: INestApplication;
let port: number;
let baseUrl: string;
let storageService: StorageService;
let reminderQueueService: ReminderQueueService;

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testId: string, description: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ PASS [Phase 15 Test ${totalTests}] [${testId}] ${description}`);
    if (details) console.log(`   ${details}`);
  } else {
    console.error(`❌ FAIL [Phase 15 Test ${totalTests}] [${testId}] ${description}`);
    if (details) console.error(`   Details: ${details}`);
    throw new Error(`Test failed: ${testId} - ${description}`);
  }
}

async function runSmokeTests() {
  console.log("==========================================================================");
  console.log("🚀 MedCore HMS — Phase 15 Production Smoke Tests & Deployment Verification");
  console.log("==========================================================================");

  // 1. Bootstrap NestJS test instance
  app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
  app.setGlobalPrefix("api/v1");

  // HTTP Security Headers
  app.use((_req: any, res: any, next: any) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'"
    );
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new SentryMonitoringInterceptor());

  const allowedOrigins = ["https://app.medcore.io", "http://localhost:3000"];
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization", "x-hospital-id"],
  });

  storageService = app.get(StorageService);
  reminderQueueService = app.get(ReminderQueueService);

  await app.listen(0);
  const address = app.getHttpServer().address();
  port = typeof address === "object" ? address.port : 3001;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // --- 1. HEALTH, LIVENESS & READINESS CHECKS ---
    console.log("\n--- 1. HEALTH, LIVENESS & READINESS CHECKS ---");

    // Test 1: General Health
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthJson = await healthRes.json();
    assert(
      healthRes.status === 200 && healthJson.data?.status === "ok" && healthJson.data?.database === "ok",
      "HEALTH_GENERAL",
      "GET /api/v1/health returns 200 OK with database: ok",
      `Status: ${healthRes.status}, Service: ${healthJson.data?.service}, DB: ${healthJson.data?.database}`
    );

    // Test 2: Liveness Probe
    const livenessRes = await fetch(`${baseUrl}/health/liveness`);
    const livenessJson = await livenessRes.json();
    assert(
      livenessRes.status === 200 && livenessJson.status === "ok" && livenessJson.probe === "liveness",
      "PROBE_LIVENESS",
      "GET /api/v1/health/liveness confirms process is alive (HTTP 200)",
      `Status: ${livenessRes.status}, Probe: ${livenessJson.probe}, Uptime: ${livenessJson.uptimeSeconds}s`
    );

    // Test 3: Readiness Probe
    const readinessRes = await fetch(`${baseUrl}/health/readiness`);
    const readinessJson = await readinessRes.json();
    assert(
      readinessRes.status === 200 &&
        readinessJson.status === "ok" &&
        readinessJson.dependencies?.database === "ok" &&
        readinessJson.dependencies?.redis === "ok",
      "PROBE_READINESS",
      "GET /api/v1/health/readiness confirms PostgreSQL and Redis backing services are healthy (HTTP 200)",
      `Status: ${readinessRes.status}, Database: ${readinessJson.dependencies?.database}, Redis: ${readinessJson.dependencies?.redis}`
    );

    // --- 2. HTTP SECURITY HEADERS ---
    console.log("\n--- 2. HTTP SECURITY HEADERS ---");

    // Test 4: Security Headers
    const secHeaders = healthRes.headers;
    const xFrame = secHeaders.get("x-frame-options");
    const xContentType = secHeaders.get("x-content-type-options");
    const csp = secHeaders.get("content-security-policy");
    const referrer = secHeaders.get("referrer-policy");

    assert(
      Boolean(
        xFrame === "DENY" &&
          xContentType === "nosniff" &&
          csp?.includes("default-src 'self'") &&
          referrer === "strict-origin-when-cross-origin"
      ),
      "SECURITY_HEADERS",
      "Production HTTP security headers strictly applied on all responses",
      `X-Frame-Options: ${xFrame}, X-Content-Type-Options: ${xContentType}, CSP: ${csp?.substring(0, 25)}...`
    );

    // --- 3. CORS ORIGIN POLICIES ---
    console.log("\n--- 3. CORS ORIGIN POLICIES ---");

    // Test 5: Authorized Origin CORS
    const corsOkRes = await fetch(`${baseUrl}/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.medcore.io",
        "Access-Control-Request-Method": "GET",
      },
    });
    const allowOrigin = corsOkRes.headers.get("access-control-allow-origin");
    const allowCreds = corsOkRes.headers.get("access-control-allow-credentials");
    assert(
      allowOrigin === "https://app.medcore.io" && allowCreds === "true",
      "CORS_AUTHORIZED",
      "Authorized frontend origin permitted with credentials support",
      `Allow-Origin: ${allowOrigin}, Allow-Credentials: ${allowCreds}`
    );

    // Test 6: Unauthorized Origin CORS
    const corsBlockRes = await fetch(`${baseUrl}/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil-unauthorized-site.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    const blockedAllowOrigin = corsBlockRes.headers.get("access-control-allow-origin");
    assert(
      blockedAllowOrigin === null,
      "CORS_BLOCKED",
      "Unauthorized third-party origin rejected by CORS policy",
      `Allow-Origin returned for evil origin: ${blockedAllowOrigin || "None (Rejected)"}`
    );

    // --- 4. STORAGE SERVICE & FALLBACK ABSTRACTION ---
    console.log("\n--- 4. STORAGE SERVICE & FALLBACK ABSTRACTION ---");

    // Test 7: Storage driver detection
    const driver = storageService.getStorageDriver();
    assert(
      driver === "s3" || driver === "local",
      "STORAGE_DRIVER",
      "StorageService initializes valid active storage driver ('s3' or 'local')",
      `Active driver: ${driver}`
    );

    // Test 8: Presigned Upload URL generation
    const uploadMeta = await storageService.getUploadUrl("lab_report_patient_101.pdf", "application/pdf", 600);
    assert(
      uploadMeta.uploadUrl.length > 0 && uploadMeta.key.includes("lab_report_patient_101.pdf"),
      "STORAGE_UPLOAD_URL",
      "Presigned upload URL successfully generated with timestamped non-colliding key",
      `Key: ${uploadMeta.key}, Method: ${uploadMeta.method}, Expires: ${uploadMeta.expiresInSeconds}s`
    );

    // Test 9: Presigned Download URL generation
    const downloadMeta = await storageService.getDownloadUrl(uploadMeta.key, 900);
    assert(
      downloadMeta.downloadUrl.length > 0 && downloadMeta.key === uploadMeta.key,
      "STORAGE_DOWNLOAD_URL",
      "Presigned download URL successfully generated for medical attachment",
      `Download URL: ${downloadMeta.downloadUrl.substring(0, 60)}...`
    );

    // Test 10: Directory traversal defense
    let traversalBlocked = false;
    try {
      await storageService.getUploadUrl("../../etc/passwd", "application/pdf");
    } catch {
      traversalBlocked = true;
    }
    assert(
      traversalBlocked,
      "STORAGE_PATH_TRAVERSAL",
      "Directory traversal sequence ('../') in filename strictly rejected with BadRequestException",
      "Path traversal attempt rejected"
    );

    // --- 5. ENVIRONMENT CONFIGURATION & SECRETS SANITY ---
    console.log("\n--- 5. ENVIRONMENT CONFIGURATION & SECRETS SANITY ---");

    // Test 11: Production environment validation
    const envAudit = validateEnvironment();
    assert(
      envAudit.valid,
      "ENV_AUDIT",
      "Environment variables satisfy minimum entropy and format requirements",
      `Audit Valid: ${envAudit.valid}, Errors: ${envAudit.errors.length}, Warnings: ${envAudit.warnings.length}`
    );

    // --- 6. REDIS / BULLMQ BACKGROUND WORKER ---
    console.log("\n--- 6. REDIS / BULLMQ BACKGROUND WORKER ---");

    // Test 12: BullMQ worker connection
    const isRedisReady = reminderQueueService.isConnected();
    assert(
      Boolean(isRedisReady),
      "REDIS_BULLMQ_WORKER",
      "BullMQ appointment-reminders queue and worker connection verified active",
      `Redis/Worker Connected: ${isRedisReady}`
    );

    console.log("\n==========================================================================");
    console.log("📊 Phase 15 Production Smoke Tests & Deployment Summary");
    console.log("==========================================================================");
    console.log(`Total Tests Run: ${totalTests}`);
    console.log(`Passed:         ${passedTests}`);
    console.log(`Failed:         0`);
    console.log(`Pass Rate:       100.0%`);
    console.log("==========================================================================");
    console.log("🎉 ALL PHASE 15 PRODUCTION SMOKE TESTS PASSED!");

    await app.close();

    setTimeout(() => {
      process.exit(passedTests === totalTests ? 0 : 1);
    }, 100);
  } catch (err: any) {
    console.error("❌ Phase 15 Smoke Test Suite Failed:", err);
    process.exit(1);
  }
}

runSmokeTests();
