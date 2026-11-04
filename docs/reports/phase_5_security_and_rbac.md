# MedCore HMS — Phase 5 Security, RBAC & Patient Privacy Documentation
## Access Control, Multi-Tenant Boundaries, and Anti-IDOR Protections

This document details the security architecture, Role-Based Access Control (RBAC) matrix, tenant isolation guarantees, and patient privacy protections implemented in MedCore HMS Phase 5.

---

### 1. Clinical RBAC Permission Matrix

MedCore HMS recognizes nine distinct system actors. Clinical endpoints in Phase 5 enforce granular role constraints validated at both the NestJS guard stack (`JwtAuthGuard`, `RolesGuard`, `TenantGuard`) and the Prisma service layer:

| Endpoint / Operation | `SUPER_ADMIN` | `HOSPITAL_ADMIN` | `DOCTOR` | `NURSE` | `PATIENT` | Other Roles (`RECEPTIONIST`, `PHARMACIST`, `LAB_TECH`, `ACCOUNTANT`) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Create Encounter** (`POST /medical-records`) | ✅ | ❌ | ✅ | ❌ | ❌ (403) | ❌ (403) |
| **Update Draft Encounter** (`PATCH /medical-records/:id`) | ✅ | ❌ | ✅ | ❌ | ❌ (403) | ❌ (403) |
| **Sign & Finalize Record** (`POST /medical-records/:id/sign`) | ✅ | ❌ | ✅ | ❌ | ❌ (403) | ❌ (403) |
| **Attach Clinical Amendment** (`POST /medical-records/:id/amend`) | ✅ | ❌ | ✅ | ❌ | ❌ (403) | ❌ (403) |
| **Delete Medical Record** (`DELETE /medical-records/:id`) | ❌ (400) | ❌ (400) | ❌ (400) | ❌ (400) | ❌ (400) | ❌ (400) |
| **View Medical Record** (`GET /medical-records/:id`) | ✅ (Global) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Self Only) | ❌ (403) |
| **List Medical Records** (`GET /medical-records`) | ✅ (Global) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Self Only) | ❌ (403) |
| **Record Vital Signs** (`POST /vital-signs`) | ✅ | ❌ | ✅ | ✅ | ❌ (403) | ❌ (403) |
| **View Vital Signs** (`GET /vital-signs`) | ✅ (Global) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Self Only) | ❌ (403) |
| **Create Diagnosis** (`POST /diagnoses`) | ✅ | ❌ | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |
| **View Diagnoses** (`GET /diagnoses`) | ✅ (Global) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Self Only) | ❌ (403) |
| **Create Treatment Plan** (`POST /treatment-plans`) | ✅ | ❌ | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |
| **View Treatment Plans** (`GET /treatment-plans`) | ✅ (Global) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Self Only) | ❌ (403) |
| **Document Allergy / Medication** (`POST /patient-*`) | ✅ | ❌ | ✅ | ✅ | ❌ (403) | ❌ (403) |
| **View Allergies / Medication** (`GET /patient-*`) | ✅ (Global) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Self Only) | ❌ (403) |
| **Patient 360° Overview** (`GET /patients/:id/clinical-overview`) | ✅ (Global) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Tenant) | ✅ (Self Only) | ❌ (403) |

---

### 2. Patient Privacy Safeguards & Anti-IDOR Protections

In a healthcare SaaS application, Insecure Direct Object Reference (IDOR) vulnerabilities present an extreme compliance and legal hazard. MedCore HMS prevents IDOR attacks through rigorous identity binding:

1. **Patient Identity Resolution**:
   - When an authenticated request arrives with `user.role === UserRole.PATIENT`, the service resolves the caller's unique `Patient` entity via `prisma.patient.findFirst({ where: { userId: user.id } })`.
2. **Deterministic Ownership Verification**:
   - Whenever a patient requests an encounter (`/medical-records/:id`), allergy list (`/patient-allergies`), medication list (`/patient-medication-history`), or clinical overview (`/patients/:id/clinical-overview`), the service compares the target `patientId` against the caller's verified `Patient.id`.
   - If the IDs do not match, the request is immediately aborted with `403 Forbidden`:
     ```typescript
     if (user.role === UserRole.PATIENT) {
       const patientRecord = await this.prisma.patient.findFirst({ where: { userId: user.id } });
       if (!patientRecord || targetPatientId !== patientRecord.id) {
         throw new ForbiddenException("Patients are strictly prohibited from viewing clinical data belonging to other patients.");
       }
     }
     ```
3. **List Scoping**:
   - When a patient queries collection endpoints (e.g. `GET /medical-records`), the query is unconditionally forced to filter by `where.patientId = callerPatient.id`, ignoring any client-provided filters.

---

### 3. Multi-Tenant Isolation Architecture

MedCore HMS implements a shared-database, shared-schema architecture where all data rows are logically isolated by `hospitalId`.

1. **Authenticated Context Binding**:
   - `TenantGuard` extracts the authenticated user's `hospitalId` directly from the validated JWT payload.
   - For all non-`SUPER_ADMIN` roles, `TenantGuard` rejects any attempt by a client to submit a contradictory `hospitalId` in query strings, route parameters, or request bodies (`403 Forbidden`).
2. **Cross-Tenant Mutation & Read Isolation**:
   - Every service query automatically appends `where.hospitalId = user.hospitalId`.
   - When creating or modifying clinical records, the backend verifies that both the attending clinician and the patient belong to the same hospital tenant.
   - A doctor or administrator from Hospital A cannot view, create, edit, or amend clinical records for a patient or encounter belonging to Hospital B (strictly returning `403 Forbidden`).

---

### 4. Healthcare Immutability & Anti-Tampering

1. **State Machine Locking**:
   - Once a doctor signs an encounter via `POST /medical-records/:id/sign`, the status transitions from `DRAFT` to `FINALIZED`.
   - Direct mutations (`PATCH /medical-records/:id`) are strictly rejected with `400 Bad Request`.
   - Attempting to add diagnoses directly to a finalized encounter via `POST /diagnoses` is rejected with `400 Bad Request`.
2. **Append-Only Clinical Amendments**:
   - In accordance with healthcare standards, post-finalization additions must be made as addendums via `POST /medical-records/:id/amend`.
   - This records an immutable row in `MedicalRecordAmendment` preserving author identity (`amendedById`), timestamp (`amendedAt`), reason, and notes, while leaving the original encounter text intact.
3. **Prohibition of Hard Deletion**:
   - `DELETE /medical-records/:id` is hardcoded to return `400 Bad Request`, preventing accidental or malicious destruction of medical evidence.

---

### 5. Clinical Audit Logging

Every clinical interaction is permanently recorded in PostgreSQL via the `AuditLog` table:
- **`hospitalId`**: Hospital tenant where the event occurred.
- **`userId`**: Authenticated actor triggering the action.
- **`action`**: `CREATE`, `UPDATE`, `STATUS_CHANGE`.
- **`entityName`**: `MedicalRecord`, `VitalSigns`, `Diagnosis`, `TreatmentPlan`, `PatientAllergy`, `PatientMedicationHistory`.
- **`entityId`**: Primary key UUID of the impacted entity.
- **`details`**: JSON payload capturing metadata (e.g. prior/new status, chief complaint summary, amendment reason).
- **`timestamp`**: Server-generated UTC timestamp.
