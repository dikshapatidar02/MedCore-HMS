/**
 * MedCore HMS — Phase 2 Targeted Fixes Verification Suite
 *
 * Verifies:
 * 1. Storage download & upload URL normalization with/without /api/v1, trailing slashes.
 * 2. Redis/BullMQ optionality: safe handling when REDIS_HOST is unconfigured.
 * 3. Redis/BullMQ configured behavior: safe connection & error handling.
 */

import { StorageService } from "../src/common/storage/storage.service";
import { ReminderQueueService } from "../src/notifications/reminder-queue.service";
import { ExpiryMonitorService } from "../src/pharmacy/expiry-monitor.service";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  ❌  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function runStorageUrlTests() {
  console.log("\n--- Category 1: Storage URL Normalization Verification ---");

  const testCases = [
    {
      envBackendUrl: "http://localhost:3001",
      expectedPrefix: "http://localhost:3001/api/v1",
      description: "Localhost without /api/v1",
    },
    {
      envBackendUrl: "http://localhost:3001/api/v1",
      expectedPrefix: "http://localhost:3001/api/v1",
      description: "Localhost with /api/v1",
    },
    {
      envBackendUrl: "https://medcore-api.onrender.com",
      expectedPrefix: "https://medcore-api.onrender.com/api/v1",
      description: "Production Render URL without /api/v1",
    },
    {
      envBackendUrl: "https://medcore-api.onrender.com/",
      expectedPrefix: "https://medcore-api.onrender.com/api/v1",
      description: "Production Render URL with trailing slash",
    },
    {
      envBackendUrl: "https://medcore-api.onrender.com/api/v1/",
      expectedPrefix: "https://medcore-api.onrender.com/api/v1",
      description: "Production Render URL with /api/v1 and trailing slash",
    },
  ];

  const originalBackendUrl = process.env.BACKEND_URL;
  const originalS3 = process.env.AWS_S3_BUCKET_NAME;
  delete process.env.AWS_S3_BUCKET_NAME; // Force local driver mode

  for (const tc of testCases) {
    process.env.BACKEND_URL = tc.envBackendUrl;
    const storageService = new StorageService();

    const upload = await storageService.getUploadUrl("test_attachment.pdf", "application/pdf");
    const download = await storageService.getDownloadUrl("attachments/sample.pdf");

    const expectedUploadPrefix = `${tc.expectedPrefix}/storage/upload?key=`;
    const expectedDownloadPrefix = `${tc.expectedPrefix}/storage/download?key=`;

    const uploadOk = upload.uploadUrl.startsWith(expectedUploadPrefix) && !upload.uploadUrl.includes("//storage");
    const downloadOk = download.downloadUrl.startsWith(expectedDownloadPrefix) && !download.downloadUrl.includes("//storage");
    const noDoubleApi = !download.downloadUrl.includes("/api/v1/api/v1");

    assert(
      uploadOk && downloadOk && noDoubleApi,
      `Storage URL Normalization: ${tc.description}`,
      `DownloadUrl: ${download.downloadUrl}`
    );
  }

  // Restore environment
  if (originalBackendUrl !== undefined) process.env.BACKEND_URL = originalBackendUrl;
  else delete process.env.BACKEND_URL;
  if (originalS3 !== undefined) process.env.AWS_S3_BUCKET_NAME = originalS3;
}

async function runRedisOptionalityTests() {
  console.log("\n--- Category 2: Redis / BullMQ Optionality Verification ---");

  const originalRedisHost = process.env.REDIS_HOST;

  // Case A: REDIS_HOST is unconfigured / empty
  delete process.env.REDIS_HOST;

  const mockPrisma = {} as any;
  const mockNotifications = { notifyExpiringBatch: async () => {} } as any;
  const mockPharmacy = { quarantineExpiredBatches: async () => ({ quarantinedCount: 0 }) } as any;

  const reminderServiceNoRedis = new ReminderQueueService(mockPrisma, mockNotifications);
  await reminderServiceNoRedis.onModuleInit();

  const reminderStatus = await reminderServiceNoRedis.getQueueStatus();
  assert(
    reminderStatus.configured === false && reminderStatus.isRedisConnected === false,
    "ReminderQueueService gracefully initializes as unconfigured when REDIS_HOST is unset",
    `configured=${reminderStatus.configured}, isRedisConnected=${reminderStatus.isRedisConnected}`
  );

  // Scheduling reminders without Redis must not claim queued
  const scheduleResult = await reminderServiceNoRedis.scheduleAppointmentReminders({
    id: "test-appt-1",
    appointmentDate: new Date(Date.now() + 86400000 * 2),
    startTime: "10:00",
  } as any);

  assert(
    scheduleResult.scheduled.length === 0,
    "scheduleAppointmentReminders does not claim queued jobs when Redis is unavailable",
    `scheduledCount=${scheduleResult.scheduled.length}`
  );

  await reminderServiceNoRedis.onModuleDestroy();

  // Case B: ExpiryMonitorService when REDIS_HOST is unconfigured
  const expiryServiceNoRedis = new ExpiryMonitorService(mockPharmacy, mockPrisma, mockNotifications);
  await expiryServiceNoRedis.onModuleInit();

  assert(
    (expiryServiceNoRedis as any).expiryQueue === null && (expiryServiceNoRedis as any).expiryWorker === null,
    "ExpiryMonitorService does not instantiate BullMQ Queue/Worker when REDIS_HOST is unset"
  );

  // Case C: When REDIS_HOST is configured (127.0.0.1)
  process.env.REDIS_HOST = "127.0.0.1";
  process.env.REDIS_PORT = "6379";

  const reminderServiceWithRedis = new ReminderQueueService(mockPrisma, mockNotifications);
  await reminderServiceWithRedis.onModuleInit();

  const reminderStatusWithRedis = await reminderServiceWithRedis.getQueueStatus();
  assert(
    reminderStatusWithRedis.configured === true && reminderStatusWithRedis.isRedisConnected === true,
    "ReminderQueueService connects cleanly and reports healthy when REDIS_HOST is configured",
    `isRedisConnected=${reminderStatusWithRedis.isRedisConnected}`
  );

  await reminderServiceWithRedis.onModuleDestroy();

  // Restore environment
  if (originalRedisHost !== undefined) process.env.REDIS_HOST = originalRedisHost;
  else delete process.env.REDIS_HOST;
}

async function main() {
  console.log("================================================================");
  console.log("  MedCore HMS — Phase 2 Targeted Fixes Verification Suite");
  console.log("================================================================");

  await runStorageUrlTests();
  await runRedisOptionalityTests();

  console.log("\n================================================================");
  console.log(`  Targeted Fixes Verification Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================\n");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

