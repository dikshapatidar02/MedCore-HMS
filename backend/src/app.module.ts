import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { HospitalsModule } from "./hospitals/hospitals.module";
import { DepartmentsModule } from "./departments/departments.module";
import { DoctorsModule } from "./doctors/doctors.module";
import { SchedulingModule } from "./scheduling/scheduling.module";
import { PatientsModule } from "./patients/patients.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { MedicalRecordsModule } from "./medical-records/medical-records.module";
import { VitalSignsModule } from "./vital-signs/vital-signs.module";
import { DiagnosesModule } from "./diagnoses/diagnoses.module";
import { TreatmentPlansModule } from "./treatment-plans/treatment-plans.module";
import { PatientAllergiesModule } from "./patient-allergies/patient-allergies.module";
import { PatientMedicationHistoryModule } from "./patient-medication-history/patient-medication-history.module";
import { PrescriptionsModule } from "./prescriptions/prescriptions.module";
import { LaboratoryModule } from "./laboratory/laboratory.module";
import { PharmacyModule } from "./pharmacy/pharmacy.module";
import { BillingModule } from "./billing/billing.module";
import { PaymentsModule } from "./payments/payments.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { StorageModule } from "./common/storage/storage.module";

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    HospitalsModule,
    DepartmentsModule,
    DoctorsModule,
    SchedulingModule,
    PatientsModule,
    AppointmentsModule,
    MedicalRecordsModule,
    VitalSignsModule,
    DiagnosesModule,
    TreatmentPlansModule,
    PatientAllergiesModule,
    PatientMedicationHistoryModule,
    PrescriptionsModule,
    LaboratoryModule,
    PharmacyModule,
    BillingModule,
    PaymentsModule,
    NotificationsModule,
    DashboardModule,
    StorageModule,
  ],
})
export class AppModule {}


