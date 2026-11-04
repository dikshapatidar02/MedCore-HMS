# Key Database Architecture & Design Decisions

This document records the architectural decisions, trade-offs, and rationale adopted in the MedCore HMS database design.

---

## 1. Soft Deletion vs. Permanent Erasure

### Decision
- **`Patient`**, **`Doctor`**, and **`Appointment`** incorporate a nullable `deletedAt: DateTime?` column for soft deletion.
- **`MedicalRecord`**, **`Diagnosis`**, **`VitalSigns`**, and **`TreatmentPlan`** do **not** support soft deletion and **must never be physically deleted**.

### Rationale
- In healthcare compliance (HIPAA, ISO 27799, Indian National Digital Health Mission / ABDM), clinical records constitute legally binding health documentation. Once committed, an encounter or diagnosis cannot be erased. Corrective actions must take the form of addendums or amended assessments rather than record deletion.
- For patient accounts, doctor profiles, and appointments, soft deletion enables administrative deactivation or cancellation while preserving referential integrity with prior invoices, medical notes, and audit trails.

---

## 2. Reusable Normalized Address Entity

### Decision
- Created a standalone `Address` model (`street`, `city`, `state`, `postalCode`, `country`) referenced via foreign keys (`addressId`) by `Hospital`, `User`, and `Patient`.

### Rationale
- Avoids duplicating 5–6 address columns across multiple tables.
- Facilitates address standardization, postal code indexing, and geocoding integration in future phases.
- Normalizes patient and staff demographic data according to 3NF standards.

---

## 3. Two-Tier Doctor Availability Matrix

### Decision
- Separated scheduling into:
  1. **`DoctorAvailability`**: Defines a baseline recurring weekly shift schedule (`dayOfWeek: 0-6`, `startTime`, `endTime`, `slotDurationMinutes: Int`).
  2. **`DoctorScheduleException`**: Manages date-specific overrides (`date: Date`, `isAvailable: Boolean`, `reason: String?`).

### Rationale
- Storing individual appointment slots months in advance causes database bloat. A template-driven recurring availability model dynamically generates bookable time slots on demand.
- `DoctorScheduleException` cleanly accommodates leaves, emergency calls, sick days, and national holidays without modifying the doctor's standard schedule template.

---

## 4. Many-to-Many Prescription Fulfillment via `PrescriptionItem`

### Decision
- Implemented `PrescriptionItem` as an explicit relational entity between `Prescription` and `Medicine`.

### Rationale
- Each line in a prescription requires distinct clinical parameters:
  - `dosage` (e.g., "1 tablet", "10 ml")
  - `frequency` (e.g., "Twice a day (BID)", "After meals")
  - `duration` (e.g., "5 days", "1 month")
  - `quantity` (e.g., 30)
  - `instructions` (e.g., "Take with plenty of water")
  - `dispensedQuantity` (e.g., 30)
- This explicit join table allows the hospital pharmacy to track partial dispenses and item-level inventory decrements in future modules.

---

## 5. Practical Hybrid Laboratory Model

### Decision
- Modeled lab results using structured fields with JSON attachment pointers:
  - Structured fields: `resultValue: String`, `referenceRange: String?`, `unit: String?`, `status: LabResultStatus (NORMAL | ABNORMAL | CRITICAL)`, `findings: String?`.
  - Unstructured pointer: `attachmentMetadata: Json?` (storing file name, MIME type, storage bucket, file size).

### Rationale
- High-volume diagnostic parameters (e.g., Hemoglobin, Glucose, Creatinine) require structured querying for trending charts, clinical alert thresholds, and automated flags.
- Advanced imaging or complex pathology reports (ECG tracings, Histopathology slides, Ultrasound PDFs) require binary document attachments. The JSON metadata field prepares the schema for S3/MinIO object storage integration in Phase 3+ without premature schema migrations.

---

## 6. Comprehensive Indexing Strategy

### Decision
- Placed 51 targeted single and compound B-tree indexes across the PostgreSQL database.

### Core Indexed Dimensions
1. **Tenant Filtering**: `hospitalId` indexed on all hospital-scoped tables.
2. **Clinical Lookup**: `patientId` and `doctorId` indexed on appointments, clinical records, prescriptions, and invoices.
3. **Temporal Queries**: `appointmentDate` and `visitDate` indexed for daily scheduling and OPD queue retrieval.
4. **Composite Filters**:
   - `@@index([hospitalId, doctorId, appointmentDate])` on `Appointment` for doctor schedule lookups.
   - `@@index([hospitalId, status])` on `Appointment`, `Invoice`, `Room`, and `Prescription` for dashboard widgets.
   - `@@index([userId, isRead])` on `Notification` for fast unread notification badges.
