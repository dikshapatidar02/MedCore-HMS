# MedCore HMS — Phase 5 Database Architectural Decisions
## Relational Clinical Schema, Immutability Design & Migration Strategy

This document details the database architecture, schema enhancements, and design rationale implemented in PostgreSQL via Prisma ORM for MedCore HMS Phase 5.

---

### 1. Architectural Philosophy: Healthcare Immutability & Auditability

Medical records represent legal instruments and historical records of patient care. Unlike typical SaaS entities where records are freely updated or deleted, clinical records are governed by strict medical ethics and legal standards (e.g., HIPAA Security Rule, 21 CFR Part 11, NHS Digital Standards):

1. **Original Clinical Truth Must Be Preserved**:
   - Once a clinician signs an encounter, the historical observations, physical findings, and diagnostic reasoning documented at that point in time must never be overwritten, modified, or deleted.
2. **Corrections Must Be Append-Only**:
   - Any post-signing modifications (new lab results, revised clinical impressions) must appear as chronological, signed addendums.
3. **Strict Deletion Prohibition**:
   - Physical deletion of patient health information (`DELETE`) from the database is prohibited. In MedCore HMS, clinical controllers and services intercept and reject delete requests with `400 Bad Request`.

---

### 2. Schema Enhancements & Model Specifications

The database schema was expanded via migration `20261102123018_add_phase5_clinical_emr_models`:

#### A. Record Status & The Amendment Model
```prisma
enum RecordStatus {
  DRAFT
  FINALIZED
  AMENDED
}

model MedicalRecord {
  id                      String                  @id @default(uuid())
  hospitalId              String
  patientId               String
  doctorId                String
  appointmentId           String?
  status                  RecordStatus            @default(DRAFT)
  chiefComplaint          String
  historyOfPresentIllness String?
  physicalExamination     String?
  assessment              String?
  plan                    String?
  notes                   String?
  signedAt                DateTime?
  signedById              String?
  createdAt               DateTime                @default(now())
  updatedAt               DateTime                @updatedAt

  hospital                Hospital                @relation(fields: [hospitalId], references: [id])
  patient                 Patient                 @relation(fields: [patientId], references: [id])
  doctor                  Doctor                  @relation(fields: [doctorId], references: [id])
  appointment             Appointment?            @relation(fields: [appointmentId], references: [id])
  signedBy                User?                   @relation("SignedByUser", fields: [signedById], references: [id])
  amendments              MedicalRecordAmendment[]
  vitalSigns              VitalSigns[]
  diagnoses               Diagnosis[]
  treatmentPlans          TreatmentPlan[]

  @@index([hospitalId, patientId])
  @@index([hospitalId, status])
  @@index([doctorId])
  @@map("medical_records")
}

model MedicalRecordAmendment {
  id              String        @id @default(uuid())
  medicalRecordId String
  amendedById     String
  amendmentReason String
  addendumNotes   String
  amendedAt       DateTime      @default(now())

  medicalRecord   MedicalRecord @relation(fields: [medicalRecordId], references: [id], onDelete: Cascade)
  amendedBy       User          @relation(fields: [amendedById], references: [id])

  @@index([medicalRecordId])
  @@index([amendedById])
  @@map("medical_record_amendments")
}
```

**Rationale for the Amendment Table vs. In-Place Editing or JSON Columns**:
- **Structured Integrity**: An explicit child table enforces referential integrity between the addendum and the authenticated author (`amendedById -> User.id`).
- **Audit Defensibility**: Each addendum retains an immutable timestamp (`amendedAt`), mandatory reason (`amendmentReason`), and notes (`addendumNotes`).
- **Query Simplicity**: Avoids complex JSON diffing or parsing, allowing relational joins when fetching the chart.

---

#### B. Vital Signs Telemetry & Precise Decimal Representation
```prisma
model VitalSigns {
  id                     String         @id @default(uuid())
  hospitalId             String
  patientId              String
  medicalRecordId        String?
  recordedById           String?
  bloodPressureSystolic  Int?
  bloodPressureDiastolic Int?
  heartRate              Int?
  respiratoryRate        Int?
  temperature            Decimal?       @db.Decimal(4, 1)
  oxygenSaturation       Decimal?       @db.Decimal(5, 2)
  height                 Decimal?       @db.Decimal(5, 2)
  weight                 Decimal?       @db.Decimal(5, 2)
  bmi                    Decimal?       @db.Decimal(4, 2)
  recordedAt             DateTime       @default(now())
  createdAt              DateTime       @default(now())
  updatedAt              DateTime       @updatedAt

  hospital               Hospital       @relation(fields: [hospitalId], references: [id])
  patient                Patient        @relation(fields: [patientId], references: [id])
  medicalRecord          MedicalRecord? @relation(fields: [medicalRecordId], references: [id])
  recordedBy             User?          @relation("VitalsRecordedBy", fields: [recordedById], references: [id])

  @@index([hospitalId, patientId])
  @@index([medicalRecordId])
  @@map("vital_signs")
}
```

**Rationale**:
- **Decimal vs Float**: Floating-point numbers introduce binary rounding artifacts (e.g. `22.85999999999999`). Decimal types (`@db.Decimal(4, 2)`) guarantee exact arithmetic representation for critical clinical telemetry like BMI and temperature.
- **Independent Telemetry Capability**: `medicalRecordId` is nullable, allowing nurses to capture vitals at triage stations before a formal physician encounter is created.

---

#### C. Diagnoses & Treatment Plans
- **`Diagnosis`**:
  - Contains `diagnosisName`, `type: DiagnosisType` (`PRIMARY`, `SECONDARY`, `ADMISSION`, `DISCHARGE`), and optional `icdCode` (ICD-10 representation).
  - Explicitly linked to both `MedicalRecord` and `Doctor` (recording clinician).
  - Constrained so that direct addition is restricted to `DRAFT` encounters; additions to finalized encounters must occur via clinical amendments.
- **`TreatmentPlan`**:
  - Encapsulates multi-disciplinary clinical goals (`goals`), instructions (`instructions`), start date (`startDate`), target completion date (`targetDate`), and status (`ACTIVE`, `COMPLETED`, `DISCONTINUED`).

---

#### D. Patient Allergies & Medication History
- **`PatientAllergy`**:
  - Encapsulates allergen name, clinical type (`DRUG`, `FOOD`, `ENVIRONMENTAL`, `OTHER`), reaction, and clinical severity (`MILD`, `MODERATE`, `SEVERE`, `LIFE_THREATENING`).
  - Active flag (`isActive: Boolean`) allows clinicians to record resolved childhood allergies or ruled-out adverse reactions without erasing historical documentation.
- **`PatientMedicationHistory`**:
  - Captures prior and ongoing pharmacological therapies, drug names, dosages, routes, frequencies, and prescribing physicians.
  - Retains `startDate` and `discontinuedDate` to support comprehensive medication reconciliation.

---

### 3. Indexing Strategy & Query Optimization

To maintain sub-millisecond query latencies across multi-tenant environments with millions of patient rows, targeted composite and single-column indexes were created:

1. **`@@index([hospitalId, patientId])`**:
   - Present on `MedicalRecord`, `VitalSigns`, `Diagnosis`, `TreatmentPlan`, `PatientAllergy`, and `PatientMedicationHistory`.
   - Optimizes tenant-scoped patient lookups and the Patient 360° overview endpoint (`GET /patients/:id/clinical-overview`), enabling fast B-Tree range scans.
2. **`@@index([medicalRecordId])`**:
   - Foreign key index on all encounter child tables (`VitalSigns`, `Diagnosis`, `TreatmentPlan`, `MedicalRecordAmendment`), accelerating single-encounter graph resolution (`GET /medical-records/:id`).
3. **`@@index([hospitalId, status])`**:
   - Supports filtering encounters by clinical workflow stage (`DRAFT`, `FINALIZED`, `AMENDED`) within a hospital tenant.

---

### 4. Migration Execution & Non-Destructive Integrity

- The schema migration was generated via `prisma migrate dev --name add_phase5_clinical_emr_models`.
- No existing tables were dropped or renamed.
- All Phase 1, Phase 2, Phase 3, and Phase 4 seed data (including hospitals, departments, doctors, patient MRNs, user accounts, and appointment bookings) were 100% preserved.
- No SQLite or mock databases were introduced; all migrations were applied directly to PostgreSQL 16.
