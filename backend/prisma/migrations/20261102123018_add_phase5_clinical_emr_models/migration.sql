-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('DRAFT', 'FINALIZED', 'AMENDED');

-- AlterTable
ALTER TABLE "diagnoses" ADD COLUMN     "description" TEXT,
ADD COLUMN     "diagnosisDate" DATE,
ADD COLUMN     "recordingDoctorId" TEXT;

-- AlterTable
ALTER TABLE "medical_records" ADD COLUMN     "clinicalNotes" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "followUpInstructions" TEXT,
ADD COLUMN     "pastMedicalHistory" TEXT,
ADD COLUMN     "presentIllness" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedById" TEXT,
ADD COLUMN     "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',
ALTER COLUMN "appointmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "patient_allergies" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "recordedById" TEXT;

-- AlterTable
ALTER TABLE "patient_medication_histories" ADD COLUMN     "prescribingDoctor" TEXT,
ADD COLUMN     "recordedById" TEXT,
ADD COLUMN     "route" TEXT;

-- AlterTable
ALTER TABLE "treatment_plans" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "endDate" DATE,
ADD COLUMN     "startDate" DATE;

-- AlterTable
ALTER TABLE "vital_signs" ADD COLUMN     "patientId" TEXT,
ADD COLUMN     "recordedById" TEXT,
ALTER COLUMN "medicalRecordId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "medical_record_amendments" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "medicalRecordId" TEXT NOT NULL,
    "amendedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_record_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medical_record_amendments_hospitalId_idx" ON "medical_record_amendments"("hospitalId");

-- CreateIndex
CREATE INDEX "medical_record_amendments_medicalRecordId_idx" ON "medical_record_amendments"("medicalRecordId");

-- CreateIndex
CREATE INDEX "medical_record_amendments_amendedById_idx" ON "medical_record_amendments"("amendedById");

-- CreateIndex
CREATE INDEX "diagnoses_recordingDoctorId_idx" ON "diagnoses"("recordingDoctorId");

-- CreateIndex
CREATE INDEX "medical_records_status_idx" ON "medical_records"("status");

-- CreateIndex
CREATE INDEX "medical_records_deletedAt_idx" ON "medical_records"("deletedAt");

-- CreateIndex
CREATE INDEX "vital_signs_patientId_idx" ON "vital_signs"("patientId");

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_record_amendments" ADD CONSTRAINT "medical_record_amendments_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_record_amendments" ADD CONSTRAINT "medical_record_amendments_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_record_amendments" ADD CONSTRAINT "medical_record_amendments_amendedById_fkey" FOREIGN KEY ("amendedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_recordingDoctorId_fkey" FOREIGN KEY ("recordingDoctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_medication_histories" ADD CONSTRAINT "patient_medication_histories_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
