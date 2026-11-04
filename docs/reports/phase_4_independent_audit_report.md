# MedCore HMS — Phase 4 Independent Security & Quality Audit Report

**Date**: 2026-11-02  
**Target**: MedCore HMS Phase 4 Implementation (Hospital, Department, Doctor, Scheduling, Patient, and Appointment Modules)  
**Auditor**: Independent Senior Security & Quality Audit Agent  
**Status**: AUDIT COMPLETE — ALL CONFIRMED VULNERABILITIES REMEDIATED & VERIFIED  

---

## 1. Executive Summary

Phase 4 of MedCore HMS implemented core operational domains: Hospital administration, Department hierarchies, Doctor onboarding and profiles, Doctor scheduling and availability slot computation, Patient registration and medical records (MRN), and Appointment booking, rescheduling, and status lifecycles.

An independent, rigorous security and quality audit was conducted across source code, database queries, controllers, services, frontend components, and runtime behavior. The audit uncovered **three critical security and correctness vulnerabilities**:
1. **Client-Side Role-Switching & Hardcoded Credentials in UI**: An active `<select>` dropdown in the authenticated navigation shell (`NavShell.tsx`) permitted client-triggered switching to any of the 9 roles with hardcoded demo credentials, bypassing true authentication boundaries.
2. **Appointment Concurrency Race Conditions (Doctor & Patient Levels)**: The appointment booking and rescheduling workflows originally relied on Prisma transactions under default PostgreSQL `Read Committed` isolation without explicit row or predicate locking. Concurrent HTTP requests could simultaneously read zero conflicts and double-book the same doctor slot, or assign overlapping appointments to the same patient with different doctors. Furthermore, acquiring multiple advisory locks without deterministic ordering introduced deadlock vulnerabilities.
3. **Doctor Leave and Working Hours Bypasses in Rescheduling and Creation**: The rescheduling endpoint omitted doctor schedule exceptions (leaves) and weekly working hour limits, allowing appointments to be moved to dates when the doctor was on full-day leave or outside clinic hours. Partial-day leave checks were also absent in appointment creation.

All identified vulnerabilities were **fully remediated and verified** using robust server-side architectural controls:
- Deterministic PostgreSQL advisory transaction locks (`acquireSchedulingLocks`) sorting resources lexicographically to prevent deadlocks while strictly serializing concurrent bookings per doctor and per patient.
- Strict server-side leave and working hours enforcement across booking and rescheduling.
- Complete removal of client-side role switchers and demo credentials.

The integration test suite was expanded from 35 to **43 tests**, and all 43 Phase 4 tests, 17 Phase 2 database tests, and 22 Phase 3 authentication/tenant regression tests passed with **100% success rate**. Both backend and frontend production builds compiled with zero errors.

---

## 2. Files Inspected

### Backend
- **Guards & Strategies**:
  - [`backend/src/auth/jwt.strategy.ts`](../../backend/src/auth/jwt.strategy.ts)
  - [`backend/src/auth/guards/jwt-auth.guard.ts`](../../backend/src/auth/guards/jwt-auth.guard.ts)
  - [`backend/src/auth/guards/roles.guard.ts`](../../backend/src/auth/guards/roles.guard.ts)
  - [`backend/src/auth/guards/tenant.guard.ts`](../../backend/src/auth/guards/tenant.guard.ts)
- **Controllers**:
  - [`backend/src/hospitals/hospitals.controller.ts`](../../backend/src/hospitals/hospitals.controller.ts)
  - [`backend/src/departments/departments.controller.ts`](../../backend/src/departments/departments.controller.ts)
  - [`backend/src/doctors/doctors.controller.ts`](../../backend/src/doctors/doctors.controller.ts)
  - [`backend/src/scheduling/scheduling.controller.ts`](../../backend/src/scheduling/scheduling.controller.ts)
  - [`backend/src/patients/patients.controller.ts`](../../backend/src/patients/patients.controller.ts)
  - [`backend/src/appointments/appointments.controller.ts`](../../backend/src/appointments/appointments.controller.ts)
- **Services**:
  - [`backend/src/hospitals/hospitals.service.ts`](../../backend/src/hospitals/hospitals.service.ts)
  - [`backend/src/departments/departments.service.ts`](../../backend/src/departments/departments.service.ts)
  - [`backend/src/doctors/doctors.service.ts`](../../backend/src/doctors/doctors.service.ts)
  - [`backend/src/scheduling/scheduling.service.ts`](../../backend/src/scheduling/scheduling.service.ts)
  - [`backend/src/patients/patients.service.ts`](../../backend/src/patients/patients.service.ts)
  - [`backend/src/appointments/appointments.service.ts`](../../backend/src/appointments/appointments.service.ts)
- **Database & Prisma**:
  - [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma)
  - [`backend/prisma/migrations/20261101150426_init_core_hms/migration.sql`](../../backend/prisma/migrations/20261101150426_init_core_hms/migration.sql)
- **Tests**:
  - [`backend/test/phase4-management.test.ts`](../../backend/test/phase4-management.test.ts)
  - [`backend/test/phase3-auth-rbac-tenant.test.ts`](../../backend/test/phase3-auth-rbac-tenant.test.ts)
  - [`backend/test/phase2-database.test.ts`](../../backend/test/phase2-database.test.ts)

### Frontend
- **Navigation & Layout**:
  - [`frontend/app/components/NavShell.tsx`](../../frontend/app/components/NavShell.tsx)
  - [`frontend/app/layout.tsx`](../../frontend/app/layout.tsx)
- **Authentication Context**:
  - [`frontend/app/context/auth-context.tsx`](../../frontend/app/context/auth-context.tsx)
- **Pages**:
  - [`frontend/app/page.tsx`](../../frontend/app/page.tsx)
  - [`frontend/app/hospitals/page.tsx`](../../frontend/app/hospitals/page.tsx)
  - [`frontend/app/departments/page.tsx`](../../frontend/app/departments/page.tsx)
  - [`frontend/app/doctors/page.tsx`](../../frontend/app/doctors/page.tsx)
  - [`frontend/app/patients/page.tsx`](../../frontend/app/patients/page.tsx)
  - [`frontend/app/appointments/page.tsx`](../../frontend/app/appointments/page.tsx)

---

## 3. Detailed Audit Findings by Area

### Area 1: Authentication and Role-Switching Audit
| Check | Finding | Status |
| :--- | :--- | :---: |
| Server-side JWT Role Verification | `JwtStrategy.validate` queries the PostgreSQL database by `payload.sub` on every request. Even if a JWT is tampered with or localStorage claims are manipulated, the active database record dictates the user's role and hospitalId. | **PASS** |
| Client-Side Role Tampering | Changing client state or localStorage role cannot grant backend permissions because backend guards read strictly from `req.user` populated by `JwtStrategy`. | **PASS** |
| UI Role-Switcher in NavShell | `NavShell.tsx` originally contained an interactive `<select>` dropdown that called `switchUser()`, which invoked `login(email, "DemoPassword@123")` with hardcoded credentials to auto-login as any role. | **FIXED** |
| Hardcoded Credentials in Production | Demo credentials in `auth-context.tsx` and the auto-login role-switcher have been completely removed. Dev quick-fill buttons on the login page are restricted to non-production (`NODE_ENV !== "production"`) and only prefill the email input without automating authentication. | **FIXED** |
| Patient Role Elevation to SUPER_ADMIN | Verified that a `PATIENT` cannot elevate privileges to `SUPER_ADMIN` via client state, headers, or query parameters. Server authorization returns 403 Forbidden. | **PASS** |

### Area 2: Multi-Tenant Security Audit
| Check | Finding | Status |
| :--- | :--- | :---: |
| Tenant Context Origin | All services derive tenant context directly from `user.hospitalId` (or verified `user.role === SUPER_ADMIN`). Client-supplied `hospitalId` in request bodies or query parameters cannot override the user's hospital context. | **PASS** |
| Hospital-Scoped Prisma Queries | All reads, updates, and deletes in `DepartmentsService`, `DoctorsService`, `SchedulingService`, `PatientsService`, and `AppointmentsService` include `{ hospitalId: user.hospitalId }` in where clauses. | **PASS** |
| Cross-Hospital Entity Association | Creation endpoints (`DepartmentsService.create`, `DoctorsService.create`, `AppointmentsService.create`) verify that referenced foreign entities (Doctor, Department, Patient) belong to the caller's hospital. Attempts to link cross-tenant entities fail with 403 Forbidden. | **PASS** |
| Cross-Tenant Query Leaks | Verified that search, filters, pagination, and counts in all controllers explicitly filter by tenant ID; no cross-tenant metadata or counts are exposed. | **PASS** |
| Super Admin Cross-Tenant Access | Only users with `Role.SUPER_ADMIN` are permitted cross-hospital reads. Cross-hospital modifications by non-super-admins are strictly forbidden. | **PASS** |

### Area 3: Patient Privacy Audit
| Check | Finding | Status |
| :--- | :--- | :---: |
| Cross-Patient Profile Access (IDOR) | `PatientsService.findOne` enforces that when `user.role === PATIENT`, `patient.userId === user.id`. Cross-patient profile access returns 403 Forbidden. Verified by Test 21. | **PASS** |
| Cross-Patient Appointment Read (IDOR) | `AppointmentsService.findOne` enforces `appointment.patient.userId === user.id` for patient callers. Unauthorized access attempts return 403 Forbidden. Verified by Test 37. | **PASS** |
| Cross-Patient Appointment Reschedule (IDOR) | `AppointmentsService.reschedule` verifies ownership before initiating modification. Patient A attempting to reschedule Patient B's appointment is denied with 403 Forbidden. Verified by Test 38. | **PASS** |
| Cross-Patient Appointment Cancellation (IDOR) | `AppointmentsService.cancel` verifies ownership before updating status. Unauthorized cancellation is rejected with 403 Forbidden. Verified by Test 39. | **PASS** |
| Patient Directory Exposure | `PatientsService.findAll` prohibits access to callers with `Role.PATIENT`, throwing 403 Forbidden. Verified by Test 22. | **PASS** |
| Clinical History Soft-Delete | Soft deletion sets `deletedAt` timestamps while maintaining relational foreign keys and database integrity. History is not purged. | **PASS** |

### Area 4: Appointment Concurrency Audit
| Check | Finding | Status |
| :--- | :--- | :---: |
| Double-Booking Race Condition Vulnerability | Original implementation used Prisma `$transaction` with default `Read Committed` isolation. Concurrent requests checking `findFirst` simultaneously saw no conflicting appointment, causing race-condition double bookings. | **FIXED** |
| Doctor-Level Concurrency Control | Implemented PostgreSQL transaction-level advisory locks inside `prisma.$transaction`: `SELECT pg_advisory_xact_lock(hashtext('doctor_' || doctorId), hashtext(date))`. Parallel booking requests for the same doctor are serialized. Verified by Test 36. | **FIXED** |
| Patient-Level Concurrency Control | Implemented patient scheduling resource locking: `SELECT pg_advisory_xact_lock(hashtext('patient_' || patientId), hashtext(date))`. Concurrent booking requests for the same patient across different doctors are serialized. Verified by Test 43. | **FIXED** |
| Deterministic Lock Ordering & Deadlock Prevention | Implemented `acquireSchedulingLocks()` helper which deduplicates lock targets and sorts them lexicographically by `resource` and `date` before acquiring locks. This strictly prevents AB-BA lock acquisition cycles and deadlocks across concurrent transactions. | **FIXED** |
| Rescheduling Concurrency Safety | Applied identical PostgreSQL transaction advisory locks to `AppointmentsService.reschedule()`, locking both old date and new date resources if date has changed. | **FIXED** |
| Cancelled Appointment Exemption | Conflict queries filter `status: { notIn: ['CANCELLED', 'NO_SHOW'] }`, ensuring cancelled appointments do not falsely block doctor or patient availability. | **PASS** |
| Terminal Status Enforcement | Terminal states (`COMPLETED`, `CANCELLED`) cannot transition to any other status. Attempting to reschedule or cancel a completed appointment is rejected with HTTP 400. Verified by Tests 33 and 34. | **PASS** |

### Area 5: Doctor Scheduling Audit
| Check | Finding | Status |
| :--- | :--- | :---: |
| Weekly Availability Validation | Inverted time ranges (`startTime >= endTime`) are rejected with 400 Bad Request. Overlapping availability windows on the same weekday are rejected with 400 Bad Request. Verified by Tests 15 and 16. | **PASS** |
| Full-Day Leave Exception Handling | Appointment creation checks `doctor_schedule_exceptions` for full-day leaves and rejects booking with 400 Bad Request. Live slot computation returns 0 available slots. Verified by Tests 17 and 18. | **PASS** |
| Partial-Day Leave Exception Handling | Added validation for partial-day leaves during appointment creation and slot computation. Conflicting partial-day leaves trigger 400 Bad Request. | **FIXED** |
| Rescheduling Leave Exception Validation | Previously, `reschedule` did not check doctor leave exceptions. Added leave exception validation; rescheduling onto a leave date is rejected with 400 Bad Request. Verified by Test 40. | **FIXED** |
| Rescheduling Working Hours Validation | Previously, `reschedule` allowed rescheduling outside doctor working hours. Added working hours validation; out-of-bounds reschedules are rejected with 400 Bad Request. Verified by Test 41. | **FIXED** |
| Timezone Consistency | Dates are normalized using `YYYY-MM-DD` strings and ISO 8601 timestamps, avoiding UTC day-shift errors. | **PASS** |

### Area 6: RBAC Audit
| Check | Finding | Status |
| :--- | :--- | :---: |
| 9 System Roles Validated | All 9 roles (`SUPER_ADMIN`, `HOSPITAL_ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `PHARMACIST`, `LAB_TECHNICIAN`, `ACCOUNTANT`, `PATIENT`) are enforced via `@Roles(...)` decorators and `RolesGuard`. Verified by Phase 3 Test 11. | **PASS** |
| Doctor Consultation Fee Modification | Doctors are prohibited from updating their own consultation fee or commission. Restricted to `HOSPITAL_ADMIN` and `SUPER_ADMIN`. Attempted updates by doctors return 403 Forbidden. Verified by Test 12. | **PASS** |
| Receptionist / Admin Appointment Operations | Receptionists and Hospital Admins have authorized access to schedule, confirm, and manage appointments within their hospital. | **PASS** |
| Doctor Permitted Profile Updates | Doctors are permitted to update biographical and non-financial profile fields. Verified by Test 13. | **PASS** |
| Frontend Navigation vs Backend RBAC | `NavShell.tsx` navigation items align with backend permissions. Navigating directly to a URL without permissions is rejected by backend API guards. | **PASS** |

### Area 7: Database and Data Integrity Audit
| Check | Finding | Status |
| :--- | :--- | :---: |
| Foreign Key Integrity | All relations (`Hospital`, `Department`, `Doctor`, `Patient`, `Appointment`, `User`) are enforced with foreign key constraints. Invalid foreign keys trigger Prisma error `P2003`. Verified by Phase 2 Test 13. | **PASS** |
| Tenant-Scoped Compound Uniqueness | Verified `@@unique([hospitalId, code])` on `Department`, `@@unique([hospitalId, mrn])` on `Patient`, and `@@unique([licenseNumber])` on `Doctor`. Duplicate codes within the same hospital trigger 409 Conflict. Verified by Tests 6 and 19. | **PASS** |
| Soft Deletion Safety | Soft deletion fields (`deletedAt`) are queried with `deletedAt: null`. Deletions do not cascade destructively to clinical or financial records. | **PASS** |
| Doctor-Department Tenant Consistency | Before creating or updating a doctor, the referenced department's `hospitalId` is validated against the caller's hospital. Cross-tenant linkage is rejected with 403 Forbidden. Verified by Test 10. | **PASS** |

### Area 8: Test Quality Audit
| Metric | Original Phase 4 Suite | Audited & Expanded Suite |
| :--- | :---: | :---: |
| Total Tests | 35 | **43** |
| Real PostgreSQL Database Used | Yes | Yes |
| Real HTTP Requests (Supertest/Axios) | Yes | Yes |
| Response Status Code Validation | Yes | Yes |
| Response Body & Mutation Verification | Yes | Yes |
| Doctor Concurrency Race Condition Testing | No | **Yes (Test 36: Parallel `Promise.all` requests)** |
| Patient Concurrency Race Condition Testing | No | **Yes (Test 43: Parallel requests with 2 different doctors)** |
| Database Record Count Verification under Concurrency | No | **Yes (Test 43: Confirms exactly 1 record in DB)** |
| Patient IDOR Privacy Verification | Partial (Profile only) | **Yes (Tests 37-39: Read, Reschedule, Cancel)** |
| Reschedule Boundary Testing | Partial | **Yes (Tests 40-41: Leave date, Working hours)** |
| Client Tenant Override Testing | Implicit | **Yes (Test 42: Client-supplied `hospitalId`)** |

---

## 4. Summary of Discovered Vulnerabilities & Implemented Fixes

```
+----------------------------------------------------------------------------------------------------------+
| DISCOVERED VULNERABILITY                                  | REMEDIATION IMPLEMENTED                      |
+----------------------------------------------------------------------------------------------------------+
| 1. UI Role-Switcher & Hardcoded Credentials               | Removed UI role-switcher from NavShell.tsx.  |
|    frontend/app/components/NavShell.tsx                  | Removed switchUser and hardcoded passwords   |
|    frontend/app/context/auth-context.tsx                  | from auth-context.tsx. Gated dev helpers     |
|                                                          | behind process.env.NODE_ENV !== "production".|
+----------------------------------------------------------------------------------------------------------+
| 2. Appointment Concurrency Race Conditions & Deadlocks    | Implemented acquireSchedulingLocks() using   |
|    backend/src/appointments/appointments.service.ts       | PostgreSQL transaction advisory locks        |
|                                                          | (pg_advisory_xact_lock) for doctor and       |
|                                                          | patient resources. Enforced deterministic    |
|                                                          | lexicographical sort order to eliminate      |
|                                                          | deadlocks. Added Tests 36 and 43.           |
+----------------------------------------------------------------------------------------------------------+
| 3. Rescheduling Bypasses Leaves & Working Hours           | Added schedule exception (leave) and weekly  |
|    backend/src/appointments/appointments.service.ts       | working hours checks to reschedule(). Added  |
|                                                          | partial-day leave check to create(). Added   |
|                                                          | Tests 40 and 41 to verify rejection.        |
+----------------------------------------------------------------------------------------------------------+
```

---

## 5. Verification & Test Execution Results

### 1. Phase 4 Expanded Integration Test Suite (`test:phase4`)
- **Command**: `pnpm --filter @medcore/backend test:phase4`
- **Output**:
  ```
  Total Phase 4 Tests: 43
  Passed: 43
  Failed: 0
  Result: ALL PHASE 4 INTEGRATION TESTS PASSED PERFECTLY!
  ```
- **Tests Added During Audit & Concurrency Check**:
  - `APPOINTMENT Test 36`: Concurrent Booking Race Condition (Advisory Lock Serialization: `[201, 409]`)
  - `APPOINTMENT Test 37`: Patient Appointment Read Privacy (Patient A cannot view Patient B appointment: `HTTP 403`)
  - `APPOINTMENT Test 38`: Patient Appointment Reschedule Privacy (Patient A cannot reschedule Patient B appointment: `HTTP 403`)
  - `APPOINTMENT Test 39`: Patient Appointment Cancellation Privacy (Patient A cannot cancel Patient B appointment: `HTTP 403`)
  - `SCHEDULING Test 40`: Reject Rescheduling onto Doctor Leave Date (`HTTP 400`)
  - `SCHEDULING Test 41`: Reject Rescheduling Outside Doctor Working Hours (`HTTP 400`)
  - `DEPARTMENT Test 42`: Prevent Client-Supplied hospitalId From Overriding Tenant Context (`HTTP 403`)
  - `APPOINTMENT Test 43`: Patient-Level Concurrent Booking Race Condition with Two Different Doctors (`[201, 409]`, Verified DB Active Appts = 1)

### 2. Phase 2 Database Regression Suite (`test:db`)
- **Command**: `pnpm --filter @medcore/backend test:db`
- **Output**:
  ```
  TOTAL TESTS: 17 | PASSED: 17 | FAILED: 0
  SUITE RESULT: ALL TESTS PASSED
  ```

### 3. Phase 3 Authentication, RBAC & Tenant Regression Suite (`test:auth`)
- **Command**: `pnpm --filter @medcore/backend test:auth`
- **Output**:
  ```
  TOTAL TESTS: 22 | PASSED: 22 | FAILED: 0
  SUITE RESULT: ALL 22 TESTS PASSED
  ```

### 4. Backend Typecheck and Build
- **Typecheck**: `pnpm --filter @medcore/backend typecheck` — **0 errors**
- **Production Build**: `pnpm --filter @medcore/backend build` (`nest build`) — **Exit code 0, Build successful**

### 5. Frontend Typecheck and Build
- **Typecheck**: `pnpm --filter @medcore/frontend typecheck` — **0 errors**
- **Production Build**: `pnpm --filter @medcore/frontend build` (`next build`) — **Exit code 0, Static generation 9/9 pages successful**

---

## 6. Remaining Limitations

1. **Advisory Lock Scope**: `pg_advisory_xact_lock` serializes concurrent booking requests on a per-doctor-per-date and per-patient-per-date basis. While this guarantees zero double-bookings without database deadlocks, high-throughput simultaneous bookings for different slots on the same day for the same doctor or patient are queued sequentially. This is the recommended and accepted pattern for clinical scheduling integrity.
2. **Phase 5 Modules Pending**: Clinical workflows (EMR, consultation notes, prescriptions, laboratory orders, pharmacy dispensing, billing, and invoicing) remain scheduled for Phase 5 and are not yet active in the production routing table.

---

## 7. Audit Classification Matrix

| Audit Area | Classification | Notes |
| :--- | :---: | :--- |
| 1. Authentication & Role-Switching | **FIXED** | UI role-switcher and demo password fallbacks removed; DB-backed server validation verified. |
| 2. Multi-Tenant Security | **PASS** | Tenant context strictly enforced from authenticated user; cross-tenant access rejected. |
| 3. Patient Privacy (IDOR) | **PASS** | Ownership validation verified on profiles, appointment reads, reschedules, and cancellations. |
| 4. Appointment Concurrency | **FIXED** | Deterministic PostgreSQL transaction advisory locks (`acquireSchedulingLocks`) implemented; doctor-level (Test 36) and patient-level (Test 43) race condition tests passing. |
| 5. Doctor Scheduling | **FIXED** | Schedule exceptions and working hours enforced across creation and rescheduling. |
| 6. RBAC | **PASS** | 9 roles verified against PRD permissions; doctor fee tamper protection verified. |
| 7. Database Integrity | **PASS** | Constraints, foreign keys, compound uniqueness, and soft deletes verified. |
| 8. Test Quality | **FIXED** | Suite expanded from 35 to 43 tests, adding real concurrency and IDOR tests. |
| 9. Regression Integrity | **PASS** | All Phase 2 (17/17) and Phase 3 (22/22) tests passed with zero regressions. |
| 10. Typecheck & Production Builds | **PASS** | Both backend and frontend compile with 0 errors. |

---

## 8. Final Audit Verdict

**VERDICT: PASSED WITH REMEDIATIONS CONFIRMED**

The Phase 4 codebase has undergone a complete, independent quality and security audit, including patient-level and doctor-level concurrent booking race condition verification. All discovered vulnerabilities—including client role-switching mechanisms, appointment double-booking race conditions, potential deadlock vectors, and scheduling validation bypasses—have been comprehensively fixed and verified under concurrent, real-world database conditions.

Phase 4 is verified as secure, multi-tenant compliant, and concurrency-safe. Phase 5 development has not been started.
