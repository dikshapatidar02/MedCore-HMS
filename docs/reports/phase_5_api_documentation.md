# MedCore HMS — Phase 5 API Documentation
## Clinical EMR REST API Endpoints Specification

This document provides complete documentation for all clinical REST API endpoints introduced in MedCore HMS Phase 5. All endpoints are prefixed by `/api/v1` and require HTTP Bearer JWT authentication (unless marked Public).

---

## 1. Medical Records & Encounters (`/medical-records`)

### `POST /api/v1/medical-records`
- **Authorized Roles**: `DOCTOR`, `SUPER_ADMIN`
- **Description**: Creates a new clinical outpatient encounter in `DRAFT` status.
- **Request Body**:
  ```json
  {
    "patientId": "uuid",
    "appointmentId": "uuid (optional)",
    "chiefComplaint": "Substernal chest pain radiating to left arm",
    "historyOfPresentIllness": "Patient reports 2 hours of squeezing chest discomfort...",
    "physicalExamination": "BP 130/85, HR 88 regular, S1/S2 audible, no murmurs",
    "assessment": "Likely atypical chest pain; rule out acute coronary syndrome",
    "plan": "Order 12-lead ECG, troponin I, initiate sublingual nitroglycerin PRN",
    "notes": "Follow up in 24 hours if pain recurs"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "hospitalId": "hosp-apex-001",
      "patientId": "uuid",
      "doctorId": "uuid",
      "status": "DRAFT",
      "chiefComplaint": "Substernal chest pain...",
      "createdAt": "2026-11-02T15:12:36.000Z"
    }
  }
  ```
- **Error Codes**: `400` (Validation failure), `403` (Unauthorized role / cross-tenant patient).

---

### `GET /api/v1/medical-records`
- **Authorized Roles**: `DOCTOR`, `NURSE`, `PATIENT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Description**: Returns paginated list of clinical records. Scoped automatically to tenant for staff, and strictly to `patientId` for patients.
- **Query Parameters**:
  - `page`: integer (default: 1)
  - `limit`: integer (default: 20)
  - `patientId`: UUID (optional filter)
  - `doctorId`: UUID (optional filter)
  - `status`: `DRAFT` | `FINALIZED` | `AMENDED`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "uuid",
          "status": "FINALIZED",
          "chiefComplaint": "Routine diabetic followup",
          "patient": { "id": "uuid", "firstName": "Rajesh", "lastName": "Sharma", "mrn": "MRN-APEX-0001" },
          "doctor": { "id": "uuid", "user": { "firstName": "Arun", "lastName": "Sharma" } },
          "createdAt": "2026-11-02T15:12:36.000Z"
        }
      ],
      "total": 18,
      "page": 1,
      "limit": 20
    }
  }
  ```

---

### `GET /api/v1/medical-records/:id`
- **Authorized Roles**: `DOCTOR`, `NURSE`, `PATIENT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Description**: Retrieves single encounter with full clinical relations: patient demographics, doctor, vital signs, diagnoses, treatment plans, and complete amendment audit trail.
- **Security Check**: Patients can only retrieve their own record (403 IDOR rejection if different patient). Cross-tenant access forbidden for staff.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "status": "FINALIZED",
      "chiefComplaint": "Substernal chest pain...",
      "vitalSigns": [...],
      "diagnoses": [...],
      "treatmentPlans": [...],
      "amendments": [
        {
          "id": "uuid",
          "amendedAt": "2026-11-02T15:12:37.000Z",
          "amendedBy": { "firstName": "Arun", "lastName": "Sharma" },
          "amendmentReason": "Troponin results received",
          "addendumNotes": "Troponin I returned negative (<0.01 ng/mL)."
        }
      ]
    }
  }
  ```

---

### `PATCH /api/v1/medical-records/:id`
- **Authorized Roles**: `DOCTOR`, `SUPER_ADMIN`
- **Description**: Modifies clinical notes in a `DRAFT` record.
- **Healthcare Immutability Constraint**: Strictly rejected with `400 Bad Request` if the record status is `FINALIZED` or `AMENDED`.
- **Request Body**: Partial encounter fields (`chiefComplaint`, `historyOfPresentIllness`, `physicalExamination`, `assessment`, `plan`, `notes`).
- **Response (200 OK)**: Updated `MedicalRecord` entity.

---

### `POST /api/v1/medical-records/:id/sign`
- **Authorized Roles**: `DOCTOR`, `SUPER_ADMIN`
- **Description**: Digitally signs and finalizes the clinical encounter.
- **Behavior**: Transitions `DRAFT -> FINALIZED`. Sets `signedAt = new Date()`, `signedById = user.id`. Emits audit log entry. Cannot be signed again if already finalized.
- **Response (201 Created / 200 OK)**: Finalized `MedicalRecord` entity.

---

### `POST /api/v1/medical-records/:id/amend`
- **Authorized Roles**: `DOCTOR`, `SUPER_ADMIN`
- **Description**: Appends a legally auditable addendum to a finalized clinical record without altering the original narrative.
- **Behavior**: Transitions status to `AMENDED`. Inserts row in `MedicalRecordAmendment`.
- **Request Body**:
  ```json
  {
    "amendmentReason": "Correction of medication dosage following lab review",
    "addendumNotes": "Metformin adjusted to 500mg PO BID due to eGFR 58 mL/min."
  }
  ```
- **Response (201 Created)**: Created `MedicalRecordAmendment` entity.

---

### `DELETE /api/v1/medical-records/:id`
- **Authorized Roles**: None (All callers)
- **Description**: Permanent record deletion blocker.
- **Behavior**: Always throws `400 Bad Request`: *"Medical records cannot be permanently deleted. Clinical entries are immutable by law."*

---

## 2. Vital Signs Station (`/vital-signs`)

### `POST /api/v1/vital-signs`
- **Authorized Roles**: `DOCTOR`, `NURSE`, `SUPER_ADMIN`
- **Description**: Records physiological telemetry for a patient.
- **Automatic Calculations**: Automatically computes `bmi = weight / (height/100)^2` rounded to 2 decimal places when height and weight are provided.
- **Physiological Range Validations**:
  - Systolic BP: 50 – 250 mmHg
  - Diastolic BP: 30 – 150 mmHg
  - Heart Rate: 30 – 250 bpm
  - Respiratory Rate: 6 – 60 breaths/min
  - Temperature: 30.0 – 45.0 °C (or 86.0 – 113.0 °F)
  - Oxygen Saturation (SpO2): 50% – 100%
  - Height: 20 – 250 cm
  - Weight: 1 – 400 kg
- **Request Body**:
  ```json
  {
    "patientId": "uuid",
    "medicalRecordId": "uuid (optional)",
    "bloodPressureSystolic": 120,
    "bloodPressureDiastolic": 80,
    "heartRate": 72,
    "respiratoryRate": 16,
    "temperature": 36.8,
    "oxygenSaturation": 99,
    "height": 175,
    "weight": 70,
    "recordedAt": "2026-11-02T15:00:00.000Z"
  }
  ```
- **Response (201 Created)**: Created `VitalSigns` entity with calculated `bmi: 22.86`.

---

### `GET /api/v1/vital-signs`
- **Authorized Roles**: `DOCTOR`, `NURSE`, `PATIENT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Description**: Retrieves historical vitals telemetry with pagination.
- **Query Parameters**: `patientId`, `medicalRecordId`, `page`, `limit`.

---

## 3. Clinical Diagnoses (`/diagnoses`)

### `POST /api/v1/diagnoses`
- **Authorized Roles**: `DOCTOR`, `SUPER_ADMIN` (Nurses and non-clinical roles strictly prohibited with `403 Forbidden`).
- **Description**: Documents an ICD-10 coded diagnosis associated with an encounter.
- **Healthcare Rule**: Directly attaching diagnoses to `FINALIZED` or `AMENDED` records is rejected with `400 Bad Request`. Additions must be made via clinical amendment.
- **Request Body**:
  ```json
  {
    "medicalRecordId": "uuid",
    "diagnosisName": "Essential (primary) hypertension",
    "icdCode": "I10",
    "type": "PRIMARY",
    "notes": "Stage 1 hypertension, initiate lifestyle modification"
  }
  ```
- **Response (201 Created)**: Created `Diagnosis` entity.

---

### `GET /api/v1/diagnoses`
- **Authorized Roles**: `DOCTOR`, `NURSE`, `PATIENT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Description**: Queries diagnoses by `patientId` or `medicalRecordId`. Patients can only query their own diagnoses.

---

## 4. Treatment Plans (`/treatment-plans`)

### `POST /api/v1/treatment-plans`
- **Authorized Roles**: `DOCTOR`, `SUPER_ADMIN`
- **Description**: Establishes a multi-disciplinary treatment plan.
- **Request Body**:
  ```json
  {
    "patientId": "uuid",
    "medicalRecordId": "uuid (optional)",
    "planDescription": "Comprehensive Cardiovascular Risk Reduction",
    "instructions": "Low-sodium DASH diet (<2g Na/day); 30m brisk walking 5 days/wk",
    "goals": "Reduce systolic BP to < 130 mmHg within 90 days",
    "startDate": "2026-11-02T00:00:00.000Z",
    "targetDate": "2027-02-02T00:00:00.000Z"
  }
  ```
- **Response (201 Created)**: Created `TreatmentPlan` entity with status `ACTIVE`.

---

### `PATCH /api/v1/treatment-plans/:id`
- **Authorized Roles**: `DOCTOR`, `SUPER_ADMIN`
- **Description**: Updates treatment plan goals, instructions, or status (`ACTIVE`, `COMPLETED`, `DISCONTINUED`).

---

## 5. Patient Allergies (`/patient-allergies`)

### `POST /api/v1/patient-allergies`
- **Authorized Roles**: `DOCTOR`, `NURSE`, `SUPER_ADMIN`
- **Description**: Documents a patient allergy with clinical severity.
- **Request Body**:
  ```json
  {
    "patientId": "uuid",
    "allergen": "Penicillin G",
    "allergyType": "DRUG",
    "severity": "LIFE_THREATENING",
    "reaction": "Anaphylaxis, acute bronchospasm, angioedema",
    "isActive": true
  }
  ```
- **Response (201 Created)**: Created `PatientAllergy` entity.

---

### `PATCH /api/v1/patient-allergies/:id`
- **Authorized Roles**: `DOCTOR`, `NURSE`, `SUPER_ADMIN`
- **Description**: Updates allergy documentation or toggles `isActive: false` if allergy was ruled out or resolved.

---

## 6. Patient Medication History (`/patient-medication-history`)

### `POST /api/v1/patient-medication-history`
- **Authorized Roles**: `DOCTOR`, `NURSE`, `SUPER_ADMIN`
- **Description**: Records past or ongoing patient medication regimens.
- **Request Body**:
  ```json
  {
    "patientId": "uuid",
    "medicationName": "Atorvastatin Calcium",
    "dosage": "40 mg",
    "frequency": "Once daily at bedtime",
    "route": "Oral",
    "startDate": "2026-11-02T00:00:00.000Z",
    "isActive": true,
    "prescribedBy": "Dr. Arun Sharma"
  }
  ```
- **Response (201 Created)**: Created `PatientMedicationHistory` entity.

---

### `PATCH /api/v1/patient-medication-history/:id`
- **Authorized Roles**: `DOCTOR`, `NURSE`, `SUPER_ADMIN`
- **Description**: Updates medication dosage, changes `isActive` status, or appends `discontinuedDate`.

---

## 7. Patient 360° Clinical Overview (`/patients/:id/clinical-overview`)

### `GET /api/v1/patients/:id/clinical-overview`
- **Authorized Roles**: `DOCTOR`, `NURSE`, `PATIENT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Description**: Aggregates complete longitudinal patient clinical record into a single high-performance payload.
- **Security & Privacy**:
  - Patient role callers can **only** request their own `id`. Cross-patient requests are blocked with `403 Forbidden`.
  - Non-Super Admin staff callers can only access patients within their own hospital tenant.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "patient": {
        "id": "uuid",
        "mrn": "MRN-APEX-0001",
        "firstName": "Rajesh",
        "lastName": "Sharma",
        "dateOfBirth": "1978-05-15T00:00:00.000Z",
        "gender": "MALE",
        "bloodGroup": "O_POSITIVE"
      },
      "latestVitalSigns": {
        "bloodPressureSystolic": 120,
        "bloodPressureDiastolic": 80,
        "heartRate": 72,
        "bmi": 22.86,
        "recordedAt": "2026-11-02T15:00:00.000Z"
      },
      "activeAllergies": [
        { "allergen": "Penicillin G", "severity": "LIFE_THREATENING", "reaction": "Anaphylaxis" }
      ],
      "activeMedications": [
        { "medicationName": "Atorvastatin Calcium", "dosage": "40 mg", "frequency": "Once daily" }
      ],
      "activeDiagnoses": [
        { "diagnosisName": "Essential (primary) hypertension", "icdCode": "I10", "type": "PRIMARY" }
      ],
      "recentEncounters": [
        {
          "id": "uuid",
          "chiefComplaint": "Substernal chest pain",
          "status": "FINALIZED",
          "createdAt": "2026-11-02T15:12:36.000Z"
        }
      ]
    }
  }
  ```
