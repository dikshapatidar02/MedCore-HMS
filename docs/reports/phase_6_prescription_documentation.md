# MedCore HMS — Phase 6 Prescription Module Documentation

**Location:** `MedCore-HMS-Phase-1`  
**Module:** Prescription Management & PDF Generation  
**Status:** Complete & Production Ready  

---

### 1. Overview & Clinical Scope

The Prescription Module enables licensed medical practitioners (`DOCTOR` role) to author, review, cancel, and stream official prescription records directly linked to patient encounters and electronic medical records.

Key capabilities:
- Multi-item medication formulary selection linked to actual hospital medicine inventories.
- Clinical dosage parameters: strength, route/form (`TABLET`, `CAPSULE`, `SYRUP`, `INJECTION`, `TOPICAL`, `DROPS`, `INHALER`), administration frequencies (`OD`, `BD`, `TDS`, `QID`, `SOS`), duration in days, and special instructions (e.g., "Take after food").
- Server-side PDF rendering using `pdfkit` featuring official hospital letterhead, doctor credentials, patient demographic markers (MRN, age, gender), medication itemization, and physician digital signature block.
- Loose coupling with the hospital pharmacy: Creating a prescription validates inventory catalogue existence but **does not** automatically deduct stock or dispense medication prematurely. Dispensing remains an audited pharmacy-side operation.

---

### 2. Permissions & RBAC Matrix

| Role | Author Rx (`POST`) | View Own Patient Rx (`GET`) | Download Signed PDF (`GET /pdf`) | Cancel Rx (`PATCH /cancel`) | Dispense Rx |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **DOCTOR** | ✅ (Own Patients) | ✅ | ✅ | ✅ (Own Rx) | ❌ |
| **PATIENT** | ❌ | ✅ (Own Rx Only) | ✅ (Own Rx Only) | ❌ | ❌ |
| **PHARMACIST** | ❌ | ✅ | ✅ | ❌ | ✅ (FIFO via Pharmacy) |
| **HOSPITAL_ADMIN** | ❌ | ✅ | ✅ | ❌ | ❌ |
| **SUPER_ADMIN** | ❌ | ✅ | ✅ | ❌ | ❌ |
| **NURSE / RECEPTIONIST** | ❌ | ❌ | ❌ | ❌ | ❌ |

---

### 3. API Endpoints

#### `POST /api/v1/prescriptions`
- **Authorized Roles:** `DOCTOR`, `SUPER_ADMIN`
- **Request Body (`CreatePrescriptionDto`):**
  ```json
  {
    "patientId": "uuid-patient-id",
    "medicalRecordId": "uuid-medical-record-id",
    "appointmentId": "uuid-optional-appointment-id",
    "notes": "Patient advised hydration and 5 days rest",
    "items": [
      {
        "medicineId": "uuid-medicine-id",
        "dosage": "500 mg",
        "frequency": "BD",
        "duration": "5 days",
        "quantity": 10,
        "instructions": "Take after meals",
        "form": "TABLET"
      }
    ]
  }
  ```
- **Response:** `201 Created` with full prescription entity, patient details, and doctor identity.

#### `GET /api/v1/prescriptions`
- **Authorized Roles:** `DOCTOR`, `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`, `PATIENT`
- **Query Parameters:** `patientId`, `medicalRecordId`, `status`
- **Behavior:**
  - For `PATIENT` role, automatically scopes query to `patient.userId === req.user.id` to prevent cross-patient IDOR leakage.
  - For hospital staff, automatically scopes to the authenticated `user.hospitalId`.

#### `GET /api/v1/prescriptions/:id`
- **Authorized Roles:** `DOCTOR`, `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`, `PATIENT`
- **Behavior:** Returns single prescription with line items, doctor profile, and hospital branding.

#### `GET /api/v1/prescriptions/:id/pdf`
- **Authorized Roles:** `DOCTOR`, `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`, `PATIENT`
- **Headers:** `Content-Type: application/pdf`, `Content-Disposition: inline; filename=prescription-<id>.pdf`
- **Behavior:** Server-side streams a binary PDF containing:
  - Hospital letterhead (Name, Code, Contact).
  - Patient demographics (Full Name, MRN, Age, Gender).
  - Prescribing Physician metadata (Doctor Name, License Number, Department Specialization).
  - Itemized Medication Table (Drug, Form, Dosage, Frequency, Duration, Quantity, Instructions).
  - Physician Digital Signature / Verification Stamp with generation timestamp and cryptographic identifier.

#### `PATCH /api/v1/prescriptions/:id/cancel`
- **Authorized Roles:** `DOCTOR`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Behavior:** Moves prescription status to `CANCELLED`. Rejects cancellation if already dispensed.

---

### 4. Implementation Details

- **PDF Generation Engine:** Implemented in [PrescriptionsPdfService](../../backend/src/prescriptions/prescriptions-pdf.service.ts). Streams directly via a Node.js `PassThrough` stream to prevent high-memory buffering on high-concurrency requests.
- **Tenant Isolation:** Enforced both in [PrescriptionsService](../../backend/src/prescriptions/prescriptions.service.ts) and via `TenantGuard`. Doctors from Hospital A cannot prescribe for or inspect prescriptions in Hospital B.
- **Frontend Integration:** Complete responsive UI at [frontend/app/prescriptions/page.tsx](../../frontend/app/prescriptions/page.tsx) with search, filter, item-row builder, status indicators, and streaming browser downloads.
