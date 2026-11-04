# MedCore HMS — Phase 3 Verification Report

## Authentication, Role-Based Access Control (RBAC) & Tenant Security

**Execution Date:** November 1, 2026  
**Environment:** Windows (PowerShell), Node.js v20.18.3, pnpm 9.15.9, PostgreSQL 16 (Docker), Redis 7 (Docker), Prisma 6.19.3, NestJS 11, Next.js 15.5.28  
**Scope:** Phase 3 Completion — Authentication Subsystem, Nine-Role RBAC Authorization, Multi-Tenant Hospital Isolation, Defense-in-Depth Security Controls, Automated Testing, Live Verification, and Architecture Documentation.

---

## 1. Executive Summary

Phase 3 of the MedCore HMS SaaS platform is **100% COMPLETE AND VERIFIED**. All requirements specified in the project prompt and PRD have been implemented, tested, and validated without dropping, resetting, or altering the Phase 2 database state.

- **Authentication Subsystem**: Fully implemented using bcrypt (cost 12), short-lived JWT access tokens (15m), and opaque refresh tokens (256-bit CSPRNG) stored as SHA-256 hashes with automatic single-use rotation and revocation.
- **Nine-Role RBAC**: Strict role enforcement across all nine Prisma enum roles (`SUPER_ADMIN`, `HOSPITAL_ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `LAB_TECHNICIAN`, `PHARMACIST`, `ACCOUNTANT`, `PATIENT`) using `@Roles()` decorator and `RolesGuard`.
- **Multi-Tenant Security**: Tenant isolation enforced at both the HTTP boundary (`TenantGuard`) and the query layer (`where: { hospitalId }`), strictly blocking cross-tenant appointment connections, cross-hospital invoice queries, and client-supplied tenant ID tampering.
- **Test Pass Rate**: **100%** (22/22 Phase 3 tests passed, 17/17 Phase 2 regression tests passed, Total 39/39 passing).
- **Builds & Typechecks**: **100%** passing with 0 errors across backend and frontend packages.

---

## 2. Implemented Features

### A. Authentication
- **User Login (`POST /api/v1/auth/login`)**:
  - Validates email and password using `class-validator` DTO.
  - Constant-time password verification via `bcrypt.compare`.
  - Inactive user detection (`isActive: false` rejected with 401).
  - User enumeration resistance (generic `"Invalid email or password."`).
  - Returns JWT Bearer access token (900s) and opaque refresh token (64 hex characters).
  - Strips `passwordHash` and internal credentials from responses.
- **Token Refresh (`POST /api/v1/auth/refresh`)**:
  - Cryptographic verification of SHA-256 hash in PostgreSQL `RefreshToken` table.
  - Enforces 7-day TTL and revocation check.
  - Automatic rotation: invalidates the presented refresh token and issues a new access/refresh pair.
  - Reuse detection: attempts to replay spent refresh tokens return HTTP `401 Unauthorized`.
- **User Logout (`POST /api/v1/auth/logout`)**:
  - Revokes active refresh token (`isRevoked: true`, `revokedAt: new Date()`).
- **Current User Profile (`GET /api/v1/auth/me`)**:
  - Resolves identity and active tenant metadata from validated Bearer JWT payload.
  - Sanitizes user profile, omitting sensitive hashes.

### B. Nine-Role RBAC
- Implemented `@Roles(...roles: Role[])` decorator.
- Implemented `RolesGuard` extracting route metadata via NestJS `Reflector`.
- Verified and enforced permissions for all nine roles:
  1. `SUPER_ADMIN`: Cross-hospital governance, platform overview, audit inspect.
  2. `HOSPITAL_ADMIN`: Hospital tenant management, department management, staff directory.
  3. `DOCTOR`: Clinical records, consultations, prescriptions, patient directory.
  4. `NURSE`: Patient care, vitals tracking, bed assignment, prescription view.
  5. `RECEPTIONIST`: Patient intake, appointment scheduling, front-desk operations.
  6. `LAB_TECHNICIAN`: Lab orders, test diagnostic execution, lab results.
  7. `PHARMACIST`: Pharmacy catalog, prescription dispensing, inventory.
  8. `ACCOUNTANT`: Invoices, billing payments, revenue accounting.
  9. `PATIENT`: Strict self-scoped access to own medical records, prescriptions, and invoices.

### C. Multi-Tenant Hospital Isolation
- **Tenant Context Resolution**: Injected via JWT payload claims (`hospitalId`, `role`, `sub`).
- **`TenantGuard`**: Rejects any request where client-supplied `:hospitalId` differs from the authenticated user's `hospitalId` (HTTP `403 Forbidden`).
- **Super Admin Exception**: Explicitly permitted cross-hospital access for platform administration.
- **Service-Level Query Scoping**: Every database lookup injects `{ hospitalId: user.hospitalId }` into Prisma queries.
- **Cross-Hospital Relationship Prevention**: Service checks ensure linked entities (e.g., Patient and Doctor in an Appointment) belong strictly to the same hospital tenant.
- **Patient Privacy Boundary**: Enforces that patients can only query and mutate their own patient record.

---

## 3. Files Created or Modified

| Path | Action | Description |
| :--- | :---: | :--- |
| `backend/prisma/schema.prisma` | Modified | Added `RefreshToken` model with `tokenHash`, `userId`, `expiresAt`, `isRevoked` fields and relation on `User`. |
| `backend/prisma/migrations/20261101154659_add_refresh_token_model/migration.sql` | Created | Non-destructive PostgreSQL migration adding `RefreshToken` table and indexes. |
| `backend/src/common/interfaces/authenticated-user.interface.ts` | Created | TypeScript interfaces for `AuthenticatedUser` and `JwtPayload`. |
| `backend/src/common/permissions/role-permissions.ts` | Created | Permission enum, resource enum, and typed 9-role permission matrix. |
| `backend/src/auth/dto/login.dto.ts` | Created | Request DTO with email and password validations. |
| `backend/src/auth/dto/refresh.dto.ts` | Created | Request DTO for refresh token validation. |
| `backend/src/auth/decorators/roles.decorator.ts` | Created | `@Roles()` decorator. |
| `backend/src/auth/decorators/public.decorator.ts` | Created | `@Public()` bypass decorator. |
| `backend/src/auth/decorators/current-user.decorator.ts` | Created | `@CurrentUser()` parameter decorator. |
| `backend/src/auth/strategies/jwt.strategy.ts` | Created | Passport JWT strategy verifying signature and database user status. |
| `backend/src/auth/guards/jwt-auth.guard.ts` | Created | Authentication guard with public route bypass. |
| `backend/src/auth/guards/roles.guard.ts` | Created | Role-based authorization guard. |
| `backend/src/auth/guards/tenant.guard.ts` | Created | Tenant isolation guard enforcing hospital boundary. |
| `backend/src/auth/auth.service.ts` | Created | Authentication service (login, refresh, logout, password hashing, token rotation). |
| `backend/src/auth/auth.controller.ts` | Created | Endpoints for `/api/v1/auth/login`, `/refresh`, `/logout`, `/me`. |
| `backend/src/auth/auth.module.ts` | Created | AuthModule registering Passport, JwtModule, controllers, guards, and services. |
| `backend/src/hospitals/hospitals.service.ts` | Created | Multi-tenant service demonstrating query-level isolation and relationship checks. |
| `backend/src/hospitals/hospitals.controller.ts` | Created | Protected endpoints demonstrating RBAC, tenant isolation, and Super Admin access. |
| `backend/src/hospitals/hospitals.module.ts` | Created | HospitalsModule providing demonstration endpoints. |
| `backend/src/common/filters/http-exception.filter.ts` | Modified | Exception filter updated to handle cross-transpiler exception unwrapping and sanitized error output. |
| `backend/src/app.module.ts` | Modified | Registered `AuthModule` and `HospitalsModule`. |
| `backend/src/main.ts` | Modified | Configured `ValidationPipe` (whitelist + forbidNonWhitelisted) and `AllExceptionsFilter`. |
| `backend/package.json` | Modified | Added auth dependencies and test scripts (`test:auth`). |
| `backend/test/phase3-auth-rbac-tenant.test.ts` | Created | Automated test suite validating all 22 required test cases. |
| `docs/authentication.md` | Created | Comprehensive authentication and token lifecycle documentation. |
| `docs/rbac-permissions.md` | Created | Complete nine-role RBAC permission matrix and architectural documentation. |
| `docs/multi-tenancy.md` | Updated | Multi-tenant application-level controls, guards, and query scoping details. |
| `docs/security-architecture.md` | Created | Threat modeling, cryptographic standards, defense-in-depth layers, and audit logging. |
| `README.md` | Updated | Added Phase 3 setup, API endpoints, PowerShell usage examples, and documentation links. |

---

## 4. Database Migration Details

- **Migration Name:** `20261101154659_add_refresh_token_model`
- **Application Method:** `pnpm --filter @medcore/backend prisma:migrate` (`prisma migrate dev`)
- **SQL Executed:**
```sql
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
- **Integrity:** Zero tables dropped. All 21 Phase 2 models, 2 hospitals, 8 doctors, 32 patients, and existing test records remained completely intact.

---

## 5. Automated Test Results

### Suite A: Phase 3 Authentication, RBAC & Tenant Security (`test:auth`)
Command: `pnpm --filter @medcore/backend test:auth`

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
✅ PASS [TENANT Test 17] Hospital A doctor cannot access Hospital B appointments: Doctor MCI-CARD-10291 from Apex is tenant-segregated from CityCare Appointment apt-CITY-CARE-12
✅ PASS [TENANT Test 18] A patient cannot access another patient's records: Patient denied access to another patient's clinical file with 403 Forbidden
✅ PASS [TENANT Test 19] A patient cannot modify another patient's profile: Patient profile modification blocked with 403 Forbidden
✅ PASS [TENANT Test 20] Cross-hospital appointment relationships are rejected: Attempt to link Apex Patient with CityCare Doctor rejected by service guard
✅ PASS [TENANT Test 21] Cross-hospital invoice access is rejected: Apex Accountant blocked from viewing CityCare invoice with 403 Forbidden
✅ PASS [TENANT Test 22] Client-supplied hospitalId cannot bypass tenant isolation: TenantGuard rejected forged hospitalId parameter with 403 Forbidden

=================================================================
TOTAL TESTS: 22 | PASSED: 22 | FAILED: 0
SUITE RESULT: ALL 22 TESTS PASSED 🎉
=================================================================
```

### Suite B: Phase 2 Database Regression Suite (`test:db`)
Command: `pnpm --filter @medcore/backend test:db`

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
✅ PASS [Test 7] Appointment relationships work: Appointment apt-APEX-MAIN-2 linked to Dr. Sen and Patient Patel
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

---

## 6. Build & Typecheck Results

| Check | Command | Result | Notes |
| :--- | :--- | :---: | :--- |
| **Backend Typecheck** | `pnpm --filter @medcore/backend typecheck` | **PASS** | 0 TypeScript errors |
| **Backend Build** | `pnpm --filter @medcore/backend build` | **PASS** | `nest build` completed successfully (`dist/` generated) |
| **Frontend Typecheck** | `pnpm --filter @medcore/frontend typecheck` | **PASS** | 0 TypeScript errors |
| **Frontend Build** | `pnpm --filter @medcore/frontend build` | **PASS** | `next build` completed successfully (static optimization 4/4 pages) |

---

## 7. Live API Endpoint Verification

The NestJS server was booted on port 3001 and verified over live HTTP requests:

1. **`GET http://localhost:3001/api/v1/health`**
   - Output: `{"success":true,"data":{"service":"medcore-api","status":"ok","database":"ok","timestamp":"2026-11-01T16:22:18.775Z"},"message":"API is running"}`
2. **`POST http://localhost:3001/api/v1/auth/login`**
   - Credentials: `admin.apex@medcore.io` / `DemoPassword@123`
   - Output: `200 OK` with Bearer access token (900s), opaque refresh token, and sanitized hospital admin profile. `passwordHash` omitted.
3. **`GET http://localhost:3001/api/v1/auth/me`**
   - Header: `Authorization: Bearer <accessToken>`
   - Output: `200 OK` with populated hospital context and sanitized profile.
4. **`POST http://localhost:3001/api/v1/auth/refresh`**
   - Payload: `{"refreshToken":"<token>"}`
   - Output: `200 OK` with rotated refresh token and newly issued access token.
5. **Replay Spent Refresh Token**
   - Payload: Re-sent previous refresh token
   - Output: `401 Unauthorized` (`"Invalid or revoked refresh token. Please login again."`).
6. **`POST http://localhost:3001/api/v1/auth/logout`**
   - Output: `200 OK` (`"Successfully logged out and session revoked."`).
7. **Refresh After Logout**
   - Output: `401 Unauthorized` (`"Invalid or revoked refresh token. Please login again."`).

---

## 8. PASS/FAIL Checklist

| # | Item | Status | Verification Details |
| :---: | :--- | :---: | :--- |
| 1 | Valid login succeeds with email and password | **PASS** | Verified in Test 1 & Live HTTP |
| 2 | Incorrect password rejected with 401 | **PASS** | Verified in Test 2 |
| 3 | Unknown account rejected with 401 | **PASS** | Verified in Test 3 |
| 4 | Inactive account rejected with 401 | **PASS** | Verified in Test 4 |
| 5 | Missing access token rejected with 401 | **PASS** | Verified in Test 5 |
| 6 | Invalid token rejected with 401 | **PASS** | Verified in Test 6 |
| 7 | Expired token rejected with 401 | **PASS** | Verified in Test 7 |
| 8 | Refresh token works with rotation | **PASS** | Verified in Test 8 & Live HTTP |
| 9 | Logout invalidates refresh token | **PASS** | Verified in Test 9 & Live HTTP |
| 10 | Password hashes never exposed in responses | **PASS** | Verified in Test 10 & live response inspection |
| 11 | All nine system roles recognized | **PASS** | Verified in Test 11 across all 9 seeded user roles |
| 12 | Unauthorized roles blocked from restricted endpoints | **PASS** | Verified in Test 12 (Doctor blocked with 403) |
| 13 | Authorized roles allowed access to endpoints | **PASS** | Verified in Test 13 (Doctor retrieves departments) |
| 14 | Super Admin permissions work across tenants | **PASS** | Verified in Test 14 (Global platform overview) |
| 15 | Hospital A Admin cannot access Hospital B data | **PASS** | Verified in Test 15 (403 Forbidden) |
| 16 | Hospital A Doctor cannot access Hospital B patients | **PASS** | Verified in Test 16 (403 Forbidden) |
| 17 | Hospital A Doctor cannot access Hospital B appointments | **PASS** | Verified in Test 17 (Tenant-segregated) |
| 18 | Patient cannot access another patient's records | **PASS** | Verified in Test 18 (403 Forbidden) |
| 19 | Patient cannot modify another patient's profile | **PASS** | Verified in Test 19 (403 Forbidden) |
| 20 | Cross-hospital appointment relationships rejected | **PASS** | Verified in Test 20 (Rejected at service layer) |
| 21 | Cross-hospital invoice access rejected | **PASS** | Verified in Test 21 (403 Forbidden) |
| 22 | Client-supplied hospitalId cannot bypass isolation | **PASS** | Verified in Test 22 (TenantGuard 403 Forbidden) |
| 23 | Phase 2 database regression tests | **PASS** | 17/17 tests passing |
| 24 | Backend production build | **PASS** | `nest build` completed with 0 errors |
| 25 | Frontend production build | **PASS** | `next build` completed with 0 errors |
| 26 | Architectural documentation created/updated | **PASS** | `docs/authentication.md`, `docs/rbac-permissions.md`, `docs/multi-tenancy.md`, `docs/security-architecture.md`, `README.md` |

---

## 9. Known Limitations & Next Steps

1. **Rate Limiting**: Rate limiting for login attempts will be added in Phase 4 via `@nestjs/throttler` backed by the Redis container.
2. **MFA / 2FA**: Multi-factor authentication via TOTP will be implemented in subsequent phases for staff roles.
3. **Phase 4 Readiness**: With authentication, RBAC, and multi-tenant isolation complete and proven, the platform is now fully prepared for Phase 4 (Core Hospital Modules: Patient EMR, Clinical Consultations, Appointment Scheduling, and Departmental Workflows).
