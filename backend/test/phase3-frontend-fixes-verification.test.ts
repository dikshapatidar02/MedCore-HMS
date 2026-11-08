/**
 * MedCore HMS — Phase 3 Frontend Fixes Verification Suite
 *
 * Verifies:
 * 1. Successful token refresh on HTTP 401.
 * 2. Refresh-token rotation storage.
 * 3. Failed refresh clears both tokens and session.
 * 4. Concurrent 401 requests share a single in-flight refresh operation.
 * 5. Original request is retried at most once (no infinite loop).
 * 6. Patient portal uses getStoredToken() helper (no direct localStorage access).
 */

import * as fs from "fs";
import * as path from "path";

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

// In-memory mock localStorage implementation
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }
}

async function runPhase3FrontendFixesTests() {
  console.log("=====================================================================");
  console.log("MEDCORE HMS — PHASE 3 TARGETED FRONTEND FIXES VERIFICATION");
  console.log("=====================================================================\n");

  // Setup DOM / browser mocks for Node environment
  const mockStorage = new MockLocalStorage();
  const mockWindowEvents: { type: string; detail?: any }[] = [];

  (global as any).window = {
    addEventListener: (type: string, listener: any) => {},
    removeEventListener: (type: string, listener: any) => {},
    dispatchEvent: (event: any) => {
      mockWindowEvents.push({ type: event.type, detail: event.detail });
      return true;
    },
  };
  (global as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, params: any = {}) {
      this.type = type;
      this.detail = params.detail;
    }
  };
  (global as any).localStorage = mockStorage;

  // Import frontend api module after window & localStorage are mocked
  const {
    apiRequest,
    getStoredToken,
    setStoredToken,
    getStoredRefreshToken,
    setStoredRefreshToken,
    clearStoredAuth,
    refreshAccessToken,
    ApiError,
  } = await import("../../frontend/app/lib/api");

  // ─────────────────────────────────────────────────────────────────
  // CATEGORY 1: Token Storage, Sanitization & SSR Safety
  // ─────────────────────────────────────────────────────────────────
  console.log("--- Category 1: Token Storage & Sanitization ---");
  mockStorage.clear();

  setStoredToken("test_access_token_123");
  setStoredRefreshToken("test_refresh_token_456");
  assert(getStoredToken() === "test_access_token_123", "Stores and retrieves valid access token");
  assert(getStoredRefreshToken() === "test_refresh_token_456", "Stores and retrieves valid refresh token");

  // Sanitization of undefined, null, or empty string tokens
  setStoredToken("undefined");
  assert(getStoredToken() === null, "Sanitizes 'undefined' string access token to null");
  setStoredRefreshToken("null");
  assert(getStoredRefreshToken() === null, "Sanitizes 'null' string refresh token to null");

  setStoredToken("   ");
  assert(getStoredToken() === null, "Sanitizes whitespace-only access token to null");

  setStoredToken("valid_token");
  setStoredRefreshToken("valid_refresh");
  clearStoredAuth();
  assert(getStoredToken() === null, "clearStoredAuth() clears access token");
  assert(getStoredRefreshToken() === null, "clearStoredAuth() clears refresh token");

  // ─────────────────────────────────────────────────────────────────
  // CATEGORY 2: Successful Token Refresh on 401 & Request Retry
  // ─────────────────────────────────────────────────────────────────
  console.log("\n--- Category 2: Successful Token Refresh on HTTP 401 ---");
  mockStorage.clear();
  setStoredToken("expired_access_token");
  setStoredRefreshToken("valid_refresh_token_abc");

  let authRefreshCalls = 0;
  let appointmentsCalls = 0;

  // Mock global.fetch
  (global as any).fetch = async (url: string, init?: RequestInit) => {
    const urlStr = String(url);

    if (urlStr.endsWith("/auth/refresh")) {
      authRefreshCalls++;
      const body = JSON.parse(init?.body as string || "{}");
      if (body.refreshToken === "valid_refresh_token_abc") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            success: true,
            data: {
              accessToken: "new_rotated_access_token_999",
              refreshToken: "new_rotated_refresh_token_888",
              expiresIn: 900,
            },
            message: "Session token refreshed successfully",
          }),
        };
      }
      return {
        ok: false,
        status: 401,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "Invalid refresh token" }),
      };
    }

    if (urlStr.endsWith("/appointments")) {
      appointmentsCalls++;
      const authHeader = (init?.headers as any)?.get?.("Authorization") || (init?.headers as any)?.["Authorization"];
      // First attempt with expired token fails with 401
      if (authHeader === "Bearer expired_access_token") {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ message: "Unauthorized - Token expired" }),
        };
      }
      // Retried attempt with refreshed token succeeds
      if (authHeader === "Bearer new_rotated_access_token_999") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ items: [{ id: "apt-1" }], total: 1 }),
        };
      }
      return {
        ok: false,
        status: 403,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "Forbidden" }),
      };
    }

    return {
      ok: false,
      status: 404,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ message: "Not found" }),
    };
  };

  const appointmentsRes = await apiRequest("/appointments");
  assert(appointmentsRes?.total === 1, "Original request succeeds after transparent token refresh");
  assert(authRefreshCalls === 1, "Calls /auth/refresh exactly once on 401");
  assert(appointmentsCalls === 2, "Original request retried with refreshed token (initial 401 + retry 200)");
  assert(getStoredToken() === "new_rotated_access_token_999", "Storage updated with new access token");

  // ─────────────────────────────────────────────────────────────────
  // CATEGORY 3: Refresh-Token Rotation
  // ─────────────────────────────────────────────────────────────────
  console.log("\n--- Category 3: Refresh-Token Rotation Storage ---");
  assert(
    getStoredRefreshToken() === "new_rotated_refresh_token_888",
    "Rotated refresh token saved to storage for subsequent sessions"
  );

  // ─────────────────────────────────────────────────────────────────
  // CATEGORY 4: Failed Refresh Clears Both Tokens & Dispatches Event
  // ─────────────────────────────────────────────────────────────────
  console.log("\n--- Category 4: Failed Refresh Clears Tokens & Dispatches Unauthorized ---");
  mockStorage.clear();
  setStoredToken("expired_access_token");
  setStoredRefreshToken("revoked_refresh_token");
  mockWindowEvents.length = 0;

  let failedRefreshCalls = 0;
  (global as any).fetch = async (url: string) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/auth/refresh")) {
      failedRefreshCalls++;
      return {
        ok: false,
        status: 401,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "Compromised session detected. Token revoked." }),
      };
    }
    return {
      ok: false,
      status: 401,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ message: "Unauthorized" }),
    };
  };

  let threwExpectedApiError = false;
  try {
    await apiRequest("/patients");
  } catch (err: any) {
    if (err instanceof ApiError && err.status === 401) {
      threwExpectedApiError = true;
    }
  }

  assert(threwExpectedApiError, "Throws ApiError(401) when refresh operation fails");
  assert(getStoredToken() === null, "Access token cleared from storage on failed refresh");
  assert(getStoredRefreshToken() === null, "Refresh token cleared from storage on failed refresh");
  assert(
    mockWindowEvents.some((e) => e.type === "medcore:unauthorized"),
    "Dispatches 'medcore:unauthorized' window event for workspace recovery"
  );

  // ─────────────────────────────────────────────────────────────────
  // CATEGORY 5: Concurrent 401 Requests Share Single Refresh Promise
  // ─────────────────────────────────────────────────────────────────
  console.log("\n--- Category 5: Concurrent 401 Single-Flight Deduplication ---");
  mockStorage.clear();
  setStoredToken("shared_expired_token");
  setStoredRefreshToken("valid_shared_refresh");

  let singleFlightRefreshCounter = 0;
  (global as any).fetch = async (url: string, init?: RequestInit) => {
    const urlStr = String(url);
    const authHeader = (init?.headers as any)?.get?.("Authorization") || (init?.headers as any)?.["Authorization"];

    if (urlStr.endsWith("/auth/refresh")) {
      singleFlightRefreshCounter++;
      // Simulate 50ms network delay for refresh
      await new Promise((r) => setTimeout(r, 50));
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: true,
          data: {
            accessToken: "shared_fresh_token",
            refreshToken: "shared_fresh_refresh",
          },
        }),
      };
    }

    if (authHeader === "Bearer shared_expired_token") {
      return {
        ok: false,
        status: 401,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "Token expired" }),
      };
    }

    if (authHeader === "Bearer shared_fresh_token") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ result: "success", endpoint: urlStr }),
      };
    }

    return {
      ok: false,
      status: 401,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ message: "Unauthorized" }),
    };
  };

  // Launch 3 simultaneous requests that all hit 401
  const [resA, resB, resC] = await Promise.all([
    apiRequest("/notifications"),
    apiRequest("/billing"),
    apiRequest("/departments"),
  ]);

  assert(resA?.result === "success", "Concurrent request A resolved successfully");
  assert(resB?.result === "success", "Concurrent request B resolved successfully");
  assert(resC?.result === "success", "Concurrent request C resolved successfully");
  assert(
    singleFlightRefreshCounter === 1,
    `Only 1 /auth/refresh call made across 3 concurrent 401 requests (Actual: ${singleFlightRefreshCounter})`
  );

  // ─────────────────────────────────────────────────────────────────
  // CATEGORY 6: Retry Limit (Original Request Retried at Most Once)
  // ─────────────────────────────────────────────────────────────────
  console.log("\n--- Category 6: Retry Limit Verification ---");
  mockStorage.clear();
  setStoredToken("token_that_will_always_401");
  setStoredRefreshToken("refresh_that_always_succeeds");

  let persistent401EndpointAttempts = 0;
  (global as any).fetch = async (url: string) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/auth/refresh")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: true,
          data: {
            accessToken: "new_token_still_rejected",
            refreshToken: "new_refresh",
          },
        }),
      };
    }
    // Endpoint always rejects with 401 even after refresh
    persistent401EndpointAttempts++;
    return {
      ok: false,
      status: 401,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ message: "User account suspended" }),
    };
  };

  let retryLimitedThrew = false;
  try {
    await apiRequest("/doctors");
  } catch (err: any) {
    if (err instanceof ApiError && err.status === 401) {
      retryLimitedThrew = true;
    }
  }

  assert(retryLimitedThrew, "Throws ApiError when retried request returns 401");
  assert(
    persistent401EndpointAttempts === 2,
    `Endpoint called at most twice: initial attempt + 1 retry (Actual: ${persistent401EndpointAttempts})`
  );

  // ─────────────────────────────────────────────────────────────────
  // CATEGORY 7: Patient Portal Uses getStoredToken() Code Audit
  // ─────────────────────────────────────────────────────────────────
  console.log("\n--- Category 7: Patient Portal Token Access Audit ---");
  const portalPath = path.resolve(__dirname, "../../frontend/app/portal/page.tsx");
  const portalContent = fs.readFileSync(portalPath, "utf-8");

  const hasDirectLocalStorageToken = portalContent.includes('localStorage.getItem("medcore_token")');
  const importsGetStoredToken = portalContent.includes("getStoredToken");
  const callsGetStoredToken = /const\s+token\s*=\s*getStoredToken\(\)/.test(portalContent);

  assert(!hasDirectLocalStorageToken, "frontend/app/portal/page.tsx has NO direct localStorage.getItem('medcore_token')");
  assert(importsGetStoredToken, "frontend/app/portal/page.tsx imports getStoredToken from lib/api");
  assert(callsGetStoredToken, "downloadPrescriptionPdf uses getStoredToken() for prescription download");

  // ─────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────
  console.log("\n=====================================================================");
  console.log(`PHASE 3 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("=====================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3FrontendFixesTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

