# MedCore HMS — Entity Relationship Diagram (ERD)

This diagram visualizes the complete, normalized schema implemented in `backend/prisma/schema.prisma`.

```mermaid
erDiagram
    Address ||--o{ Hospital : "has"
    Address ||--o{ User : "has"
    Address ||--o{ Patient : "has"

    Hospital ||--o{ Department : "contains"
    Hospital ||--o{ Room : "has"
    Hospital ||--o{ User : "employs"
    Hospital ||--o{ Doctor : "employs"
    Hospital ||--o{ Patient : "manages"
    Hospital ||--o{ Appointment : "hosts"
    Hospital ||--o{ MedicalRecord : "stores"
    Hospital ||--o{ Prescription : "authorizes"
    Hospital ||--o{ Medicine : "stocks"
    Hospital ||--o{ LabOrder : "processes"
    Hospital ||--o{ LabTest : "offers"
    Hospital ||--o{ Invoice : "issues"

    Department ||--o{ Room : "assigns"
    Department ||--o{ Doctor : "includes"
    Department ||--o{ Appointment : "schedules"

    User ||--o| Doctor : "has profile"
    User ||--o| Patient : "has portal user"
    User ||--o{ Notification : "receives"
    User ||--o{ AuditLog : "initiates"

    Doctor ||--o{ DoctorAvailability : "defines"
    Doctor ||--o{ DoctorScheduleException : "requests"
    Doctor ||--o{ Appointment : "conducts"
    Doctor ||--o{ MedicalRecord : "authors"
    Doctor ||--o{ Prescription : "prescribes"
    Doctor ||--o{ LabOrder : "orders"

    Patient ||--o{ Appointment : "books"
    Patient ||--o{ MedicalRecord : "receives"
    Patient ||--o{ Prescription : "receives"
    Patient ||--o{ LabOrder : "submits"
    Patient ||--o{ Invoice : "billed"
    Patient ||--o{ PatientAllergy : "has"
    Patient ||--o{ PatientMedicationHistory : "records"

    Appointment ||--o| MedicalRecord : "produces (1:1)"
    Appointment ||--o| Invoice : "generates (1:1)"

    MedicalRecord ||--o{ VitalSigns : "captures"
    MedicalRecord ||--o{ Diagnosis : "documents"
    MedicalRecord ||--o{ TreatmentPlan : "outlines"
    MedicalRecord ||--o{ Prescription : "generates"
    MedicalRecord ||--o{ LabOrder : "requests"

    Prescription ||--|{ PrescriptionItem : "contains"
    Medicine ||--o{ PrescriptionItem : "dispensed in"

    LabOrder ||--|{ LabResult : "contains"
    LabTest ||--o{ LabResult : "measures"

    Invoice ||--|{ InvoiceItem : "itemizes"
    Invoice ||--o{ Payment : "settles"
```

---

## Detailed Model Relational Cardinality

| Source Model | Relationship | Target Model | Cardinality | Notes / Foreign Key |
| :--- | :--- | :--- | :--- | :--- |
| `Hospital` | 1 to Many | `Department` | `1 : N` | `Department.hospitalId -> Hospital.id` (Cascade) |
| `Hospital` | 1 to Many | `Room` | `1 : N` | `Room.hospitalId -> Hospital.id` (Cascade) |
| `Hospital` | 1 to Many | `User` | `1 : N` | `User.hospitalId -> Hospital.id` (Cascade; nullable for Super Admin) |
| `Department` | 1 to Many | `Doctor` | `1 : N` | `Doctor.departmentId -> Department.id` (Restrict) |
| `User` | 1 to 1 | `Doctor` | `1 : 1` | `Doctor.userId -> User.id` (Restrict) |
| `User` | 1 to 1 (opt) | `Patient` | `1 : 0..1`| `Patient.userId -> User.id` (SetNull) |
| `Doctor` | 1 to Many | `Appointment` | `1 : N` | `Appointment.doctorId -> Doctor.id` (Restrict) |
| `Patient` | 1 to Many | `Appointment` | `1 : N` | `Appointment.patientId -> Patient.id` (Restrict) |
| `Appointment` | 1 to 1 | `MedicalRecord` | `1 : 1` | `MedicalRecord.appointmentId -> Appointment.id` (Restrict) |
| `MedicalRecord` | 1 to Many | `VitalSigns` | `1 : N` | `VitalSigns.medicalRecordId -> MedicalRecord.id` (Cascade) |
| `MedicalRecord` | 1 to Many | `Diagnosis` | `1 : N` | `Diagnosis.medicalRecordId -> MedicalRecord.id` (Cascade) |
| `MedicalRecord` | 1 to Many | `TreatmentPlan` | `1 : N` | `TreatmentPlan.medicalRecordId -> MedicalRecord.id` (Cascade) |
| `Prescription` | 1 to Many | `PrescriptionItem` | `1 : N` | Join table for M:N with `Medicine` |
| `Medicine` | 1 to Many | `PrescriptionItem` | `1 : N` | `PrescriptionItem.medicineId -> Medicine.id` (Restrict) |
| `LabOrder` | 1 to Many | `LabResult` | `1 : N` | `LabResult.labOrderId -> LabOrder.id` (Cascade) |
| `LabTest` | 1 to Many | `LabResult` | `1 : N` | `LabResult.labTestId -> LabTest.id` (Restrict) |
| `Invoice` | 1 to Many | `InvoiceItem` | `1 : N` | `InvoiceItem.invoiceId -> Invoice.id` (Cascade) |
| `Invoice` | 1 to Many | `Payment` | `1 : N` | `Payment.invoiceId -> Invoice.id` (Cascade) |
| `Appointment` | 1 to 1 (opt) | `Invoice` | `1 : 0..1`| `Invoice.appointmentId -> Appointment.id` (SetNull) |
