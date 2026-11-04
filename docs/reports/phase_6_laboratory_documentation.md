# MedCore HMS — Phase 6 Laboratory Diagnostics Documentation

**Location:** `MedCore-HMS-Phase-1`  
**Module:** Laboratory Diagnostics, Pathology & Report Approval  
**Status:** Complete & Production Ready  

---

### 1. Diagnostic Pathology Lifecycle

The Laboratory module governs the complete diagnostic lifecycle from physician order placement to clinical validation and patient publication.

```
[DOCTOR]                 [NURSE / LAB TECH]               [LAB TECH]                  [DOCTOR / ADMIN]
  Create Lab Order   --->   Collect Sample   --->   Process Telemetry   --->   Review & Validate
  (Status: ORDERED)     (Status: SAMPLE_COLL)     (Status: RESULT_UPL)       (Status: APPROVED)
                                                                                     │
                                                                                     ▼
                                                                        [PATIENT PORTAL VISIBILITY]
```

#### Validated State Machine Transitions
1. `ORDERED`: Created by licensed physician linked to an active `MedicalRecord`.
2. `SAMPLE_COLLECTED`: Sample physical accession recorded (barcode, phlebotomy timestamp, sample notes).
3. `PROCESSING`: Specimen loaded into laboratory analyzers/equipment.
4. `RESULT_UPLOADED`: Structured diagnostic results entered with units, reference ranges, and flags (`NORMAL`, `ABNORMAL`, `CRITICAL_HIGH`, `CRITICAL_LOW`).
5. `UNDER_REVIEW`: Submitted for clinical pathologist or senior physician review.
6. `APPROVED`: Validated and published. Unlocks visibility in the Patient Self-Service Portal and triggers notification dispatch.
7. `REJECTED`: Quality or clinical rejection with documented rationale.

---

### 2. Clinical Roles & Separation of Duties

To adhere to clinical laboratory standards (CLIA / CAP guidelines):
- **Physicians (`DOCTOR`)**: Can author diagnostic orders and review/approve results for authorized hospital patients.
- **Phlebotomists / Nurses (`NURSE`, `LAB_TECHNICIAN`)**: Can document sample collection.
- **Laboratory Technicians (`LAB_TECHNICIAN`)**: Can process specimens and upload structured results.
- **Self-Approval Prohibition**: A lab technician who enters the results **cannot** approve their own diagnostic report. Approval must be performed by a medical doctor or authorized hospital administrator.
- **Patient Privacy Boundary**: Unapproved results (`ORDERED`, `SAMPLE_COLLECTED`, `PROCESSING`, `RESULT_UPLOADED`) are strictly invisible to patients. Only reports with status `APPROVED` can be retrieved via the patient portal or patient APIs.

---

### 3. API Endpoints

#### `POST /api/v1/laboratory/orders`
- **Authorized Roles:** `DOCTOR`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Body:** `{ patientId, medicalRecordId, priority: "ROUTINE" | "URGENT" | "STAT", clinicalNotes, tests: [{ testId, instructions }] }`

#### `GET /api/v1/laboratory/orders`
- **Authorized Roles:** `DOCTOR`, `LAB_TECHNICIAN`, `NURSE`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`, `PATIENT`
- **Behavior:** Staff queries return orders scoped to hospital. Patient queries strictly return `APPROVED` orders and filter unapproved results.

#### `POST /api/v1/laboratory/orders/:id/collect-sample`
- **Authorized Roles:** `LAB_TECHNICIAN`, `NURSE`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Body:** `{ sampleBarcode, notes }`
- **Transition:** `ORDERED -> SAMPLE_COLLECTED`

#### `POST /api/v1/laboratory/orders/:id/process-sample`
- **Authorized Roles:** `LAB_TECHNICIAN`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Transition:** `SAMPLE_COLLECTED -> PROCESSING`

#### `POST /api/v1/laboratory/orders/:id/results`
- **Authorized Roles:** `LAB_TECHNICIAN`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Body:** `{ results: [{ testId, numericValue, textValue, unit, referenceRange, flag, notes }] }`
- **Transition:** `PROCESSING -> RESULT_UPLOADED`

#### `POST /api/v1/laboratory/orders/:id/review`
- **Authorized Roles:** `DOCTOR`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Rule:** Rejects if reviewer user ID matches the technician user ID who entered the results.
- **Body:** `{ action: "APPROVE" | "REJECT", reviewNotes }`
- **Transition:** `RESULT_UPLOADED -> APPROVED` or `REJECTED`

#### `GET /api/v1/laboratory/tests` & `POST /api/v1/laboratory/tests`
- **Authorized Roles:** All staff can view; `HOSPITAL_ADMIN`, `LAB_TECHNICIAN` can add tests with category, sample type, reference ranges, and fee schedules.

---

### 4. Security & Storage Safety

- Uploaded diagnostic documents are stored using an abstraction with strict validation: MIME type check (allowing only `application/pdf`, `image/jpeg`, `image/png`), extension whitelist, and 10MB file size ceiling.
- Unapproved lab results cannot be inspected by patients through direct IDOR guessing of the order UUID.
- Cross-tenant orders are rejected with `403 Forbidden`.
