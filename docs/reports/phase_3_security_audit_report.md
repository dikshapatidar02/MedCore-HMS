# MedCore HMS — Phase 3 Security Audit Report

**Audit Date:** November 1, 2026  
**Auditor:** Senior Security Architect & Backend Engineering Agent  
**Target:** MedCore HMS — Phase 3 (Authentication, RBAC & Tenant Security Subsystem)  
**Environment:** Windows (PowerShell), Node.js v20.18.3, PostgreSQL 16 (Docker), Redis 7 (Docker), Prisma 6.19.3, NestJS 11, Next.js 15.5.28  

---

## 1. Executive Summary

A comprehensive, defense-in-depth security audit was conducted on the Phase 3 implementation of MedCore HMS. The audit scrutinized:
1. **Multi-Tenant Isolation**: Ensuring every database query and mutation enforces tenant boundaries at the service layer, preventing cross-tenant leakage even if controller-level guards are bypassed.
2. **Role-Based Access Control (RBAC)**: Validating endpoint authorization, role decoration, and permission bounds across all 9 roles.
3. **Authentication Security & Secret Management**: Auditing token hashing, rotation, revocation, credential protection, and eliminating hardcoded fallback secrets.
4. **Automated Test Quality**: Reviewing negative tests to eliminate in-memory assertions and verify real HTTP/service-level execution against PostgreSQL.

All identified vulnerabilities have been remediated, verified, and regression-tested. **The Phase 3 implementation now achieves a 100% PASS rating across all security criteria.**

---

## 2. Files Inspected

The following backend services, controllers, guards, strategies, configuration files, and test suites were audited:

1. `backend/src/hospitals/hospitals.service.ts` (Service-level Prisma queries, tenant boundary checks, patient record filtering)
2. `backend/src/hospitals/hospitals.controller.ts` (Route handlers, `@Roles` decorators, guard application, parameter binding)
3. `backend/src/auth/auth.service.ts` (Password comparison, token generation, refresh rotation, logout revocation, audit logging)
4. `backend/src/auth/auth.controller.ts` (Public vs protected auth endpoints, DTO validation)
5. `backend/src/auth/guards/tenant.guard.ts` (HTTP boundary tenant verification, client-supplied `hospitalId` validation)
6. `backend/src/auth/guards/roles.guard.ts` (Reflector role extraction, 9-role authorization)
7. `backend/src/auth/guards/jwt-auth.guard.ts` (Public route bypass, JWT signature and expiration enforcement)
8. `backend/src/auth/strategies/jwt.strategy.ts` (Bearer token extraction, database user verification, active status check)
9. `backend/src/auth/auth.module.ts` (Passport and JwtModule configuration, dependency injection)
10. `backend/src/common/filters/http-exception.filter.ts` (Exception handling, status translation, stack trace suppression)
11. `backend/src/common/permissions/role-permissions.ts` (Typed permission matrix for 9 roles across 17 resources)
12. `backend/prisma/schema.prisma` (PostgreSQL models, indexes, compound constraints, `RefreshToken` table)
13. `backend/test/phase3-auth-rbac-tenant.test.ts` (22 automated test scenarios)
14. `.env` and `.env.example` (Local environment variables and secret hygiene)

---

## 3. Actual Vulnerabilities Found & Remediations Applied

### Vulnerability 1: Hardcoded Fallback Secrets in Authentication Subsystem (HIGH)
- **Finding**: In `AuthService`, `JwtStrategy`, and `AuthModule`, secrets loaded with fallback defaults:
  `process.env.JWT_ACCESS_SECRET || "default_fallback_access_secret_do_not_use"`
  If an environment variable was accidentally omitted or unset in production, the application would silently authenticate sessions using an insecure, publicly known static secret.
- **Remediation**:
  - Removed all hardcoded fallback strings.
  - Implemented strict startup validation in `AuthService`, `JwtStrategy`, and `JwtModule.registerAsync`. If `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` is missing or shorter than 32 characters, the application throws a fatal configuration error immediately.
  - Rotated `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in `.env` with newly generated, cryptographically secure 256-bit (64-character hex) keys.
  - Revoked all existing active refresh token records in PostgreSQL (`UPDATE "RefreshToken" SET "isRevoked" = true`).

### Vulnerability 2: Insufficient Patient Privacy on Billing Invoices (HIGH)
- **Finding**: In `HospitalsService.getInvoice`, the tenant check only validated:
  `if (user.role !== UserRole.SUPER_ADMIN && invoice.hospitalId !== user.hospitalId)`
  If Patient A requested an invoice belonging to Patient B within the *same* hospital (`hosp-apex-001`), the hospital IDs matched, allowing Patient A to view Patient B's financial and billing details.
- **Remediation**:
  - Added relation `{ include: { patient: true } }` in the invoice query.
  - Added explicit patient ownership validation:
    ```typescript
    if (user.role === UserRole.PATIENT) {
      if (!invoice.patient || invoice.patient.userId !== user.id) {
        throw new ForbiddenException(
          "Access denied: Patients are strictly restricted to accessing their own invoices."
        );
      }
    }
    ```

### Vulnerability 3: Service-Level Tenant Bypass in `getDepartments` and `getPatients` (MEDIUM)
- **Finding**: `HospitalsService.getDepartments(hospitalId)` and `getPatients(hospitalId)` accepted `hospitalId` directly as an unauthenticated method parameter without inspecting the caller's `AuthenticatedUser` context. If invoked directly by internal services without `TenantGuard`, queries were not scoped by the authenticated user's hospital.
- **Remediation**:
  - Updated both methods to require `user: AuthenticatedUser`.
  - Added service-level tenant checks:
    ```typescript
    if (user.role !== UserRole.SUPER_ADMIN && hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Tenant isolation violation: Access to records from another hospital is forbidden.");
    }
    ```
  - In `getPatients`, query filter forcibly applies `effectiveHospitalId = user.role === UserRole.SUPER_ADMIN ? hospitalId : user.hospitalId!`.
  - Updated `HospitalsController` to pass `@CurrentUser() user: AuthenticatedUser` to both methods.

### Vulnerability 4: In-Memory Mocking in Negative Appointment Test (MEDIUM)
- **Finding**: In `backend/test/phase3-auth-rbac-tenant.test.ts`, Test 17 (cross-hospital appointment segregation) evaluated:
  `const isBlocked = cityApt.hospitalId !== docApex?.hospitalId;`
  This test compared two database fields in memory without exercising a live HTTP endpoint or service-level database operation.
- **Remediation**:
  - Added `getAppointment(user: AuthenticatedUser, appointmentId: string)` in `HospitalsService` and `GET /api/v1/hospitals/appointments/:appointmentId` in `HospitalsController` with `@Roles(SUPER_ADMIN, HOSPITAL_ADMIN, DOCTOR, NURSE, RECEPTIONIST, PATIENT)`.
  - Refactored Test 17 in the test suite to execute a live HTTP request from an Apex Doctor targeting a CityCare appointment, asserting the service rejects the request with HTTP `403 Forbidden` (`code: "FORBIDDEN"`).

### Vulnerability 5: Unkeyed Refresh Token Hashing (LOW)
- **Finding**: Refresh tokens were hashed using simple SHA-256 (`crypto.createHash('sha256')`). While secure against plaintext exposure, they were not bound to the server's secret key.
- **Remediation**:
  - Upgraded token hashing in `AuthService` to HMAC-SHA256 keyed with `JWT_REFRESH_SECRET`:
    ```typescript
    private hashToken(token: string): string {
      return crypto.createHmac("sha256", this.refreshSecret).update(token).digest("hex");
    }
    ```

---

## 4. Test Verification & Actual Outputs

### A. Phase 3 Auth, RBAC & Tenant Security Suite (`pnpm --filter @medcore/backend test:auth`)

```text
=================================================================
🔬 MedCore HMS — Phase 3 Auth, RBAC & Tenant Security Test Suite
=================================================================

✅ PASS [AUTH Test 1] Valid login succeeds: Returned 200 OK with Bearer access token (eyJhbGciOiJIUzI...)
✅ PASS [AUTH Test 2] Incorrect password is rejected: Rejected with 401 Unauthorized (Invalid email or password.)
✅ PASS [AUTH Test 3] Unknown account is rejected: Rejected with 401 Unauthorized without leaking account existence
✅ PASS [AUTH Test 4] Inactive account is rejected: Blocked with 401 Unauthorized: "User account is inactive. Please contact your hospital administrator."
✅ PASS [AUTH Test 5] Missing access token is rejected: Protected /auth/me rejected with 401
✅ PASS [AUTH Test 6] Invalid token is rejected: Malformed token rejected with 401
✅ PASS [AUTH Test 7] Expired token is rejected: Expired token safely rejected with 401
✅ PASS [AUTH Test 8] Refresh token works with rotation: Issued new access token and rotated refresh token
✅ PASS [AUTH Test 9] Logout invalidates the refresh token: Logout succeeded; subsequent refresh attempt returned 401 Unauthorized
✅ PASS [AUTH Test 10] Password hashes are never returned: Both /auth/login and /auth/me sanitize credentials from payload
✅ PASS [RBAC Test 11] Each of the nine roles is recognized: Successfully authenticated and validated roles for all 9 system actors
✅ PASS [RBAC Test 12] Unauthorized roles cannot access restricted endpoints: Doctor blocked from Super Admin endpoint with 403 Forbidden
✅ PASS [RBAC Test 13] Authorized roles can access permitted endpoints: Doctor successfully retrieved departments list (4 departments)
✅ PASS [RBAC Test 14] SUPER_ADMIN permissions work as documented: Super Admin accessed platform overview and cross-hospital departments
✅ PASS [TENANT Test 15] Hospital A administrator cannot access Hospital B data: Apex Admin blocked from CityCare data: 403 Forbidden
✅ PASS [TENANT Test 16] Hospital A doctor cannot access Hospital B patients: Apex Doctor blocked from CityCare patients list: 403 Forbidden
✅ PASS [TENANT Test 17] Hospital A doctor cannot access Hospital B appointments: Apex Doctor blocked from CityCare Appointment apt-CITY-CARE-12 with 403 Forbidden
✅ PASS [TENANT Test 18] A patient cannot access another patient's records: Patient denied access to another patient's clinical file with 403 Forbidden
✅ PASS [TENANT Test 19] A patient cannot modify another patient's profile: Patient profile modification blocked with 403 Forbidden
✅ PASS [TENANT Test 20] Cross-hospital appointment relationships are rejected: Attempt to link Apex Patient with CityCare Doctor rejected by service guard
✅ PASS [TENANT Test 21] Cross-hospital and cross-patient invoice access is rejected: Apex Accountant blocked from CityCare invoice; Patient blocked from other patient's invoice with 403 Forbidden
✅ PASS [TENANT Test 22] Client-supplied hospitalId cannot bypass tenant isolation: TenantGuard rejected forged hospitalId parameter with 403 Forbidden

=================================================================
TOTAL TESTS: 22 | PASSED: 22 | FAILED: 0
SUITE RESULT: ALL 22 TESTS PASSED 🎉
=================================================================
```

### B. Phase 2 Database Regression Suite (`pnpm --filter @medcore/backend test:db`)

```text
=================================================
🔬 MedCore HMS — Phase 2 Database Verification Suite
=================================================

✅ PASS [Test 1] Prisma connects to PostgreSQL: Connection active, query executed
✅ PASS [Test 2] All migrations apply successfully: Found 2 applied migration(s)
✅ PASS [Test 3] Prisma Client generates successfully: All core model delegates present on PrismaClient
✅ PASS [Test 4] Hospital records can be created: Verified 2 seeded hospital record(s)
✅ PASS [Test 5] Hospital-specific users can be created: User admin.apex@medcore.io scoped to hospital Apex Multispecialty Hospital & Research Institute
✅ PASS [Test 6] Doctor and patient relationships work: Doctor MCI-CARD-10291 linked to Cardiology; Patient MRN-APEX-0001 linked to hospital
✅ PASS [Test 7] Appointment relationships work: Appointment apt-APEX-MAIN-3 linked to Dr. Gupta and Patient Verma
✅ PASS [Test 8] Medical records are linked correctly: MedicalRecord medrec-apt-APEX-MAIN-2 linked 1:1 with Appointment apt-APEX-MAIN-2
✅ PASS [Test 9] PrescriptionItem relationships work: Prescription rx-medrec-apt-APEX-MAIN-2 links Medicine Dolo 650 via PrescriptionItem
✅ PASS [Test 10] Lab orders and lab tests work: LabOrder labord-medrec-apt-APEX-MAIN-2 has result 185 mg/dL for Liver Function Test (LFT)
✅ PASS [Test 11] Invoice and InvoiceItem relationships work: Invoice INV-APEX-MAIN-0002 has 2 items and total ₹2047.5
✅ PASS [Test 12] Unique constraints work: Duplicate hospital code rejected with Prisma P2002
✅ PASS [Test 13] Foreign-key constraints work: Invalid foreign key rejected with Prisma P2003
✅ PASS [Test 14] Required indexes exist: Found 51 tenant/relational indexes on postgres tables
✅ PASS [Test 15] Soft-delete fields behave as expected: Soft deletion timestamp successfully updated and restored
✅ PASS [Test 16] Medical records protected from deletion: Referential integrity constraint prevents deletion of linked appointment/EMR
✅ PASS [Test 17] Cross-tenant compound constraints work: MRN is scoped per-hospital via @@unique([hospitalId, mrn])

=================================================
TOTAL TESTS: 17 | PASSED: 17 | FAILED: 0
SUITE RESULT: ALL TESTS PASSED 🎉
=================================================
```

### C. Typecheck and Production Build Results

| Component | Command | Result |
| :--- | :--- | :---: |
| **Backend TypeScript Check** | `pnpm --filter @medcore/backend typecheck` | **PASS** (0 errors) |
| **Backend Production Build** | `pnpm --filter @medcore/backend build` | **PASS** (`nest build` clean) |
| **Frontend TypeScript Check** | `pnpm --filter @medcore/frontend typecheck` | **PASS** (0 errors) |
| **Frontend Production Build** | `pnpm --filter @medcore/frontend build` | **PASS** (`next build` clean) |

### D. Live HTTP API Verification with Rotated Keys

1. **`POST /api/v1/auth/login` (Admin)**: `200 OK` — Returns new JWT signed with rotated key and HMAC-hashed refresh token.
2. **`GET /api/v1/auth/me`**: `200 OK` — Decodes token correctly using new secret.
3. **`POST /api/v1/auth/refresh`**: `200 OK` — Validates HMAC hash, rotates refresh token, issues fresh access token.
4. **Replay Spent Token**: `401 Unauthorized` (`"Invalid or revoked refresh token. Please login again."`).
5. **`POST /api/v1/auth/logout`**: `200 OK` — Session revoked in PostgreSQL.
6. **Cross-Hospital Appointment Live Check**:
   - Caller: Dr. Arun Sharma (`hosp-apex-001`)
   - Target: `GET /api/v1/hospitals/appointments/apt-CITY-CARE-12` (`hosp-city-002`)
   - Result: `403 Forbidden` (`{"success":false,"error":{"code":"FORBIDDEN","message":"Tenant isolation violation: Access to appointment belonging to another hospital is strictly forbidden."}}`).

---

## 5. Remaining Limitations

The following items are deferred to Phase 4 or subsequent phases in accordance with the project roadmap:
1. **IP Rate Limiting**: Brute-force throttling on `/api/v1/auth/login` will be added in future iterations using `@nestjs/throttler` backed by the existing Redis container.
2. **Multi-Factor Authentication (MFA)**: TOTP-based 2FA will be introduced for clinical and administrative staff in subsequent phases.
3. **Scheduled Token Cleanup**: A periodic background cron job to purge expired and revoked refresh tokens from PostgreSQL should be added to prevent long-term table bloat.

---

## 6. PASS/FAIL Security Checklist

| # | Security Verification Criterion | Status | Notes |
| :---: | :--- | :---: | :--- |
| 1 | Every hospital-scoped query includes authenticated user's hospital context | **PASS** | Enforced at controller and service layers |
| 2 | Every update and delete validates tenant ownership and soft-delete status | **PASS** | `updatePatientProfile` enforces tenant context and `deletedAt === null` |
| 3 | Related records cannot be connected across hospitals | **PASS** | `validateAppointmentTenant` prevents cross-tenant linking |
| 4 | Patient access is restricted to the authenticated patient's own records | **PASS** | Enforced on clinical records, appointments, and invoices |
| 5 | SUPER_ADMIN cross-tenant access is explicitly authorized | **PASS** | Super Admin role bypass documented and tested |
| 6 | Client-supplied `hospitalId` cannot override authenticated context | **PASS** | Rejected by `TenantGuard` with 403 Forbidden |
| 7 | Authentication guards applied to all non-public routes | **PASS** | `JwtAuthGuard` enforced |
| 8 | Role guards applied where required | **PASS** | `RolesGuard` + `@Roles` enforced |
| 9 | Permissions match `docs/rbac-permissions.md` | **PASS** | Verified across all 9 roles |
| 10 | No endpoint exposes sensitive information to unauthorized roles | **PASS** | Role-gated and projection-filtered |
| 11 | Refresh tokens stored as cryptographic hashes | **PASS** | Stored as HMAC-SHA256 digests in PostgreSQL |
| 12 | Refresh token rotation is single-use | **PASS** | Immediate revocation on rotation |
| 13 | Reuse detection works | **PASS** | Returns 401 on spent token presentation |
| 14 | Logout revokes the session | **PASS** | Sets `isRevoked: true` |
| 15 | Inactive users cannot authenticate | **PASS** | Blocked with 401 |
| 16 | Password hashes and secrets never appear in API responses or logs | **PASS** | Projections sanitize passwordHash |
| 17 | JWT secrets loaded strictly from environment variables without fallbacks | **PASS** | Hardcoded fallbacks removed; missing secrets throw fatal startup error |
| 18 | Exposed secrets rotated and active sessions revoked | **PASS** | 256-bit keys rotated in `.env`, active DB tokens revoked |
| 19 | Negative tests exercise real service and database operations | **PASS** | Test 17 & 21 upgraded to full live API calls |
| 20 | All Phase 2 and Phase 3 automated test suites passing | **PASS** | 39 / 39 tests passing |

---

## 7. Post-Audit Final Security Cleanup Verification

Following the audit remediations, a dedicated security cleanup and key rotation procedure was executed:

1. **Cryptographic Key Generation & Safe Injection**:
   - Fresh 256-bit (32-byte / 64-hexadecimal character) CSPRNG keys were generated for both `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
   - Updated the local `.env` safely via isolated script. Secret values were completely suppressed from terminal logs and reports.
   - Verified that `.gitignore` strictly excludes `.env` and `.env.*` from version control.

2. **Session Revocation in PostgreSQL**:
   - All previously active refresh-token sessions across the database (including those created during audit testing) were invalidated:
     `UPDATE "RefreshToken" SET "isRevoked" = true WHERE "isRevoked" = false;` (11 active sessions revoked).

3. **Backend Service Restart**:
   - The backend service process was rebooted to consume the rotated secrets.

4. **Negative & Lifecycle Token Verification**:
   - **Previously Issued Access Token**: `GET /api/v1/auth/me` with previous token returned **HTTP 401 Unauthorized** (Signature verification failed).
   - **Old / Revoked Refresh Token**: `POST /api/v1/auth/refresh` with old token returned **HTTP 401 Unauthorized** (`"Invalid or revoked refresh token. Please login again."`).
   - **Fresh Login**: `POST /api/v1/auth/login` returned **HTTP 200 OK**.
   - **Authenticated Profile**: `GET /api/v1/auth/me` returned **HTTP 200 OK**.
   - **Single-Use Refresh Rotation**: `POST /api/v1/auth/refresh` returned **HTTP 200 OK** and rotated session.
   - **Reuse of Spent Token**: `POST /api/v1/auth/refresh` returned **HTTP 401 Unauthorized**.
   - **Logout**: `POST /api/v1/auth/logout` returned **HTTP 200 OK**.
   - **Refresh After Logout**: `POST /api/v1/auth/refresh` returned **HTTP 401 Unauthorized**.

5. **Final Regression Test Totals**:
   - **Phase 3 Tests (`test:auth`)**: 22 / 22 PASSED (100%)
   - **Phase 2 Database Tests (`test:db`)**: 17 / 17 PASSED (100%)
   - **Backend Typecheck & Build**: Clean (0 errors)
   - **Frontend Typecheck & Build**: Clean (0 errors)

