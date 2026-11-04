# MedCore HMS — Database Architecture

## 1. Overview
MedCore HMS is designed as an enterprise-grade, multi-tenant Hospital Management System. The database layer utilizes **PostgreSQL 16** with **Prisma ORM 6.19.3** for schema modeling, automated migrations, and type-safe query generation.

The schema strictly adheres to **Third Normal Form (3NF)** principles to guarantee data integrity, eliminate data anomalies, and preserve clean relational boundaries across all medical and operational modules.

---

## 2. Core Entity Modules

### A. Hospital and Organization
- **`Hospital`**: The central tenant entity. Every hospital operates with isolated records identified by its unique `code` and internal UUID `id`.
- **`Department`**: Clinical and administrative departments within a hospital (e.g., Cardiology, Neurology, Pediatrics). Scoped by `@@unique([hospitalId, code])`.
- **`Room`**: Physical infrastructure (General Ward, Semi-Private, Private, ICU, Operation Theater) with capacity and status tracking. Scoped by `@@unique([hospitalId, roomNumber])`.
- **`Address`**: Reusable address model referenced by Hospital, User, and Patient to avoid repeating street/city/state/postal fields.

### B. Users and Clinical Profiles
- **`User`**: Global authentication and identity table. Supports platform-wide `SUPER_ADMIN` (where `hospitalId` is null) and tenant-bound staff (`HOSPITAL_ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `LAB_TECHNICIAN`, `PHARMACIST`, `ACCOUNTANT`, `PATIENT`).
- **`Doctor`**: Clinical profile linked 1:1 to User, associated with a Department and Hospital. Tracks license numbers, consultation fees, experience, and soft deletion (`deletedAt`). Scoped by `@@unique([hospitalId, licenseNumber])`.
- **`Patient`**: Master patient index. Contains hospital-specific Medical Record Number (MRN), demographics, emergency contacts, blood group, and soft deletion (`deletedAt`). Scoped by `@@unique([hospitalId, mrn])`.

### C. Appointment Management & Scheduling
- **`Appointment`**: Connects Patient, Doctor, Department, and Hospital. Enforces appointment date, time intervals, status transitions (`PENDING`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`), and emergency flags (`isEmergency`).
- **`DoctorAvailability`**: Recurring weekly availability matrix defining active days of the week, shift start/end times, and slot duration minutes.
- **`DoctorScheduleException`**: Calendar exceptions for leave, conferences, or custom duty shifts overriding recurring availability.

### D. Electronic Medical Records (EMR)
- **`MedicalRecord`**: Permanent, non-deletable clinical encounter record linked 1:1 with completed Appointments. Stores chief complaint, clinical examination, and assessment notes.
- **`VitalSigns`**: High-frequency physiologic measurements (Systolic/Diastolic BP, Heart Rate, Respiratory Rate, Temperature, SpO2, Height, Weight, BMI).
- **`Diagnosis`**: ICD-10 codification and diagnostic classifications (`PRIMARY`, `SECONDARY`, `PROVISIONAL`, `FINAL`).
- **`TreatmentPlan`**: Clinical management plan, therapeutic instructions, and scheduled follow-up dates.
- **`PatientAllergy`**: Documented patient allergens, hypersensitivity reactions, and severity grades (`MILD`, `MODERATE`, `SEVERE`, `LIFE_THREATENING`).
- **`PatientMedicationHistory`**: Pre-existing and ongoing prescription histories.

### E. Prescriptions & Pharmacy
- **`Medicine`**: Hospital formulary and standardized drug catalog with generic naming, dosage form (`TABLET`, `CAPSULE`, `SYRUP`, `INJECTION`, etc.), strength, manufacturer, and unit pricing.
- **`Prescription`**: Physician order issued during an encounter, linked to the MedicalRecord.
- **`PrescriptionItem`**: Many-to-Many relational join table between Prescription and Medicine. Specifies individual dosage, administration frequency, duration, total quantity, instructions, and dispensed count.

### F. Diagnostic Laboratory
- **`LabTest`**: Standardized diagnostic test definitions with catalog code, clinical category, standard reference ranges, test units, and pricing.
- **`LabOrder`**: Diagnostic order requesting investigations with priority (`ROUTINE`, `URGENT`, `STAT`) and lifecycle status tracking.
- **`LabResult`**: Recorded test values, flags (`NORMAL`, `ABNORMAL`, `CRITICAL`), clinical findings, technician attribution, and JSON metadata (`attachmentMetadata`) for file storage pointers.

### G. Billing & Financial Operations
- **`Invoice`**: Patient billing record linked 1:1 with an Appointment. Tracks subtotal, tax amount, discounts, total amount, paid balance, and status (`DRAFT`, `ISSUED`, `PAID`, `PARTIALLY_PAID`, `OVERDUE`, `VOID`).
- **`InvoiceItem`**: Individual charge lines classified by `itemType` (`CONSULTATION`, `LAB_TEST`, `PHARMACY`, `ROOM_CHARGE`, `PROCEDURE`, `OTHER`).
- **`Payment`**: Multi-method transaction journal (`CASH`, `CREDIT_CARD`, `DEBIT_CARD`, `UPI`, `NET_BANKING`, `INSURANCE`) tracking transaction references and completion states.

### H. Platform Operations
- **`Notification`**: Role-based alert queue for appointment bookings, critical lab alerts, prescription refills, and system events.
- **`AuditLog`**: Tamper-evident activity trail recording actor `userId`, action (`CREATE`, `READ`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`), target entity, client IP address, and JSON diff payload.

---

## 3. Database Constraints & Referential Integrity Rules
1. **Clinical Record Preservation**: Medical records and diagnoses cannot be deleted via cascade deletion (`onDelete: Restrict` on parent appointment and patient foreign keys).
2. **Tenant Scoping**: All operational tables require a foreign key to `Hospital(id)`.
3. **Compound Key Constraints**: Enforce per-hospital uniqueness without cross-tenant collisions:
   - `Hospital.code` (Unique global slug)
   - `Department`: `@@unique([hospitalId, code])`
   - `Room`: `@@unique([hospitalId, roomNumber])`
   - `Doctor`: `@@unique([hospitalId, licenseNumber])`
   - `Patient`: `@@unique([hospitalId, mrn])`
   - `Medicine`: `@@unique([hospitalId, code])`
   - `LabTest`: `@@unique([hospitalId, code])`
   - `Invoice`: `@@unique([hospitalId, invoiceNumber])`
