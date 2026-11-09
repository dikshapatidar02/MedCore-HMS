import {
  UserRole,
  HospitalStatus,
  Gender,
  AppointmentStatus,
  AppointmentType,
  RoomType,
  PrescriptionStatus,
  MedicineForm,
  LabPriority,
  LabOrderStatus,
  LabResultStatus,
  InvoiceStatus,
  PaymentStatus,
  PaymentMethod,
  InvoiceItemType,
  AllergySeverity,
  DiagnosisType,
  NotificationType,
  AuditAction,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { seedDemoData, DEMO_CONFIG } from "../src/auth/demo-seed";

interface MockDb {
  addresses: Map<string, any>;
  hospitals: Map<string, any>;
  users: Map<string, any>;
  departments: Map<string, any>;
  rooms: Map<string, any>;
  doctors: Map<string, any>;
  doctorAvailabilities: Map<string, any>;
  patients: Map<string, any>;
  patientAllergies: any[];
  patientMedicationHistories: any[];
  medicines: Map<string, any>;
  labTests: Map<string, any>;
  appointments: Map<string, any>;
  medicalRecords: Map<string, any>;
  vitalSigns: any[];
  diagnoses: any[];
  treatmentPlans: any[];
  prescriptions: Map<string, any>;
  prescriptionItems: any[];
  labOrders: Map<string, any>;
  labResults: any[];
  invoices: Map<string, any>;
  invoiceItems: any[];
  payments: any[];
  notifications: any[];
  auditLogs: any[];
}

function createMockPrisma(): { prisma: any; db: MockDb } {
  const db: MockDb = {
    addresses: new Map(),
    hospitals: new Map(),
    users: new Map(),
    departments: new Map(),
    rooms: new Map(),
    doctors: new Map(),
    doctorAvailabilities: new Map(),
    patients: new Map(),
    patientAllergies: [],
    patientMedicationHistories: [],
    medicines: new Map(),
    labTests: new Map(),
    appointments: new Map(),
    medicalRecords: new Map(),
    vitalSigns: [],
    diagnoses: [],
    treatmentPlans: [],
    prescriptions: new Map(),
    prescriptionItems: [],
    labOrders: new Map(),
    labResults: [],
    invoices: new Map(),
    invoiceItems: [],
    payments: [],
    notifications: [],
    auditLogs: [],
  };

  const prisma: any = {
    address: {
      upsert: async ({ where, create, update }: any) => {
        const key = where.id;
        if (db.addresses.has(key)) {
          const existing = db.addresses.get(key);
          const updated = { ...existing, ...update };
          db.addresses.set(key, updated);
          return updated;
        }
        db.addresses.set(key, create);
        return create;
      },
    },
    hospital: {
      upsert: async ({ where, create, update }: any) => {
        const key = where.code;
        if (db.hospitals.has(key)) {
          const existing = db.hospitals.get(key);
          const updated = { ...existing, ...update };
          db.hospitals.set(key, updated);
          return updated;
        }
        db.hospitals.set(key, create);
        return create;
      },
    },
    user: {
      upsert: async ({ where, create, update }: any) => {
        const key = where.email;
        if (db.users.has(key)) {
          const existing = db.users.get(key);
          const updated = { ...existing, ...update };
          db.users.set(key, updated);
          return updated;
        }
        db.users.set(key, create);
        return create;
      },
    },
    department: {
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.hospitalId_code.hospitalId}_${where.hospitalId_code.code}`;
        if (db.departments.has(key)) {
          const existing = db.departments.get(key);
          const updated = { ...existing, ...update };
          db.departments.set(key, updated);
          return updated;
        }
        db.departments.set(key, create);
        return create;
      },
    },
    room: {
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.hospitalId_roomNumber.hospitalId}_${where.hospitalId_roomNumber.roomNumber}`;
        if (db.rooms.has(key)) {
          const existing = db.rooms.get(key);
          const updated = { ...existing, ...update };
          db.rooms.set(key, updated);
          return updated;
        }
        db.rooms.set(key, create);
        return create;
      },
    },
    doctor: {
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.hospitalId_licenseNumber.hospitalId}_${where.hospitalId_licenseNumber.licenseNumber}`;
        if (db.doctors.has(key)) {
          const existing = db.doctors.get(key);
          const updated = { ...existing, ...update };
          db.doctors.set(key, updated);
          return updated;
        }
        db.doctors.set(key, create);
        return create;
      },
    },
    doctorAvailability: {
      upsert: async ({ where, create, update }: any) => {
        const c = where.hospitalId_doctorId_dayOfWeek_startTime;
        const key = `${c.hospitalId}_${c.doctorId}_${c.dayOfWeek}_${c.startTime}`;
        if (db.doctorAvailabilities.has(key)) {
          const existing = db.doctorAvailabilities.get(key);
          const updated = { ...existing, ...update };
          db.doctorAvailabilities.set(key, updated);
          return updated;
        }
        db.doctorAvailabilities.set(key, create);
        return create;
      },
    },
    patient: {
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.hospitalId_mrn.hospitalId}_${where.hospitalId_mrn.mrn}`;
        if (db.patients.has(key)) {
          const existing = db.patients.get(key);
          const updated = { ...existing, ...update };
          db.patients.set(key, updated);
          return updated;
        }
        db.patients.set(key, create);
        return create;
      },
    },
    patientAllergy: {
      findFirst: async ({ where }: any) => {
        return db.patientAllergies.find((a: any) => a.hospitalId === where.hospitalId && a.patientId === where.patientId) || null;
      },
      create: async ({ data }: any) => {
        db.patientAllergies.push(data);
        return data;
      },
    },
    patientMedicationHistory: {
      findFirst: async ({ where }: any) => {
        return db.patientMedicationHistories.find((m: any) => m.hospitalId === where.hospitalId && m.patientId === where.patientId) || null;
      },
      create: async ({ data }: any) => {
        db.patientMedicationHistories.push(data);
        return data;
      },
    },
    medicine: {
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.hospitalId_code.hospitalId}_${where.hospitalId_code.code}`;
        if (db.medicines.has(key)) {
          const existing = db.medicines.get(key);
          const updated = { ...existing, ...update };
          db.medicines.set(key, updated);
          return updated;
        }
        db.medicines.set(key, create);
        return create;
      },
    },
    labTest: {
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.hospitalId_code.hospitalId}_${where.hospitalId_code.code}`;
        if (db.labTests.has(key)) {
          const existing = db.labTests.get(key);
          const updated = { ...existing, ...update };
          db.labTests.set(key, updated);
          return updated;
        }
        db.labTests.set(key, create);
        return create;
      },
    },
    appointment: {
      upsert: async ({ where, create, update }: any) => {
        const key = where.id;
        if (db.appointments.has(key)) {
          const existing = db.appointments.get(key);
          const updated = { ...existing, ...update };
          db.appointments.set(key, updated);
          return updated;
        }
        db.appointments.set(key, create);
        return create;
      },
    },
    medicalRecord: {
      upsert: async ({ where, create, update }: any) => {
        const key = where.id;
        if (db.medicalRecords.has(key)) {
          const existing = db.medicalRecords.get(key);
          const updated = { ...existing, ...update };
          db.medicalRecords.set(key, updated);
          return updated;
        }
        db.medicalRecords.set(key, create);
        return create;
      },
    },
    vitalSigns: {
      findFirst: async ({ where }: any) => {
        return db.vitalSigns.find((v: any) => v.medicalRecordId === where.medicalRecordId) || null;
      },
      create: async ({ data }: any) => {
        db.vitalSigns.push(data);
        return data;
      },
    },
    diagnosis: {
      findFirst: async ({ where }: any) => {
        return db.diagnoses.find((d: any) => d.medicalRecordId === where.medicalRecordId) || null;
      },
      create: async ({ data }: any) => {
        db.diagnoses.push(data);
        return data;
      },
    },
    treatmentPlan: {
      findFirst: async ({ where }: any) => {
        return db.treatmentPlans.find((p: any) => p.medicalRecordId === where.medicalRecordId) || null;
      },
      create: async ({ data }: any) => {
        db.treatmentPlans.push(data);
        return data;
      },
    },
    prescription: {
      upsert: async ({ where, create, update }: any) => {
        const key = where.id;
        if (db.prescriptions.has(key)) {
          const existing = db.prescriptions.get(key);
          const updated = { ...existing, ...update };
          db.prescriptions.set(key, updated);
          return updated;
        }
        db.prescriptions.set(key, create);
        return create;
      },
    },
    prescriptionItem: {
      findFirst: async ({ where }: any) => {
        return db.prescriptionItems.find(
          (i: any) => i.prescriptionId === where.prescriptionId && i.medicineId === where.medicineId
        ) || null;
      },
      create: async ({ data }: any) => {
        db.prescriptionItems.push(data);
        return data;
      },
    },
    labOrder: {
      upsert: async ({ where, create, update }: any) => {
        const key = where.id;
        if (db.labOrders.has(key)) {
          const existing = db.labOrders.get(key);
          const updated = { ...existing, ...update };
          db.labOrders.set(key, updated);
          return updated;
        }
        db.labOrders.set(key, create);
        return create;
      },
    },
    labResult: {
      findFirst: async ({ where }: any) => {
        return db.labResults.find((r: any) => r.labOrderId === where.labOrderId) || null;
      },
      create: async ({ data }: any) => {
        db.labResults.push(data);
        return data;
      },
    },
    invoice: {
      upsert: async ({ where, create, update }: any) => {
        const key = where.id;
        if (db.invoices.has(key)) {
          const existing = db.invoices.get(key);
          const updated = { ...existing, ...update };
          db.invoices.set(key, updated);
          return updated;
        }
        db.invoices.set(key, create);
        return create;
      },
    },
    invoiceItem: {
      findFirst: async ({ where }: any) => {
        return db.invoiceItems.find(
          (i: any) => i.invoiceId === where.invoiceId && (where.itemType ? i.itemType === where.itemType : true)
        ) || null;
      },
      create: async ({ data }: any) => {
        db.invoiceItems.push(data);
        return data;
      },
    },
    payment: {
      findFirst: async ({ where }: any) => {
        return db.payments.find((p: any) => p.invoiceId === where.invoiceId) || null;
      },
      create: async ({ data }: any) => {
        db.payments.push(data);
        return data;
      },
    },
    notification: {
      findFirst: async ({ where }: any) => {
        return db.notifications.find(
          (n: any) => n.userId === where.userId && n.title === where.title
        ) || null;
      },
      create: async ({ data }: any) => {
        db.notifications.push(data);
        return data;
      },
    },
    auditLog: {
      findFirst: async ({ where }: any) => {
        return db.auditLogs.find(
          (a: any) => a.hospitalId === where.hospitalId && a.entityId === where.entityId && a.action === where.action
        ) || null;
      },
      create: async ({ data }: any) => {
        db.auditLogs.push(data);
        return data;
      },
    },
  };

  return { prisma, db };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runUnitTests() {
  console.log("==========================================================================");
  console.log("🧪 MedCore HMS — Demo Access System Unit Test Suite");
  console.log("==========================================================================\n");

  const { prisma, db } = createMockPrisma();
  const nullLogger = { log: () => {}, error: () => {} };

  // Test 1: Initial Seed execution
  console.log("--- 1. Demo Data Seeder Execution ---");
  const result = await seedDemoData(prisma, nullLogger);
  assert(result.hospital.code === "DEMO-MAIN", "Demo hospital created with code DEMO-MAIN");
  assert(result.hospital.status === HospitalStatus.ACTIVE, "Demo hospital is in ACTIVE status");
  assert(db.hospitals.size === 1, "Exactly 1 demo hospital registered");

  // Test 2: Demo Accounts Verification
  console.log("\n--- 2. Demo User Accounts & Roles ---");
  const adminUser = db.users.get("demo.admin@medcore.io");
  assert(adminUser !== undefined, "Hospital Admin user exists");
  assert(adminUser?.role === UserRole.HOSPITAL_ADMIN, "Admin account has role HOSPITAL_ADMIN");
  assert(adminUser?.isActive === true, "Admin account is active (can log in immediately)");
  assert(adminUser?.hospitalId === "hosp-demo-001", "Admin account is strictly scoped to demo hospital");

  const doctorUser = db.users.get("demo.doctor@medcore.io");
  assert(doctorUser !== undefined, "Doctor user exists");
  assert(doctorUser?.role === UserRole.DOCTOR, "Doctor account has role DOCTOR");
  assert(doctorUser?.isActive === true, "Doctor account is active");

  const nurseUser = db.users.get("demo.nurse@medcore.io");
  assert(nurseUser !== undefined, "Nurse user exists");
  assert(nurseUser?.role === UserRole.NURSE, "Nurse account has role NURSE");
  assert(nurseUser?.isActive === true, "Nurse account is active");

  const receptionistUser = db.users.get("demo.receptionist@medcore.io");
  assert(receptionistUser !== undefined, "Receptionist user exists");
  assert(receptionistUser?.role === UserRole.RECEPTIONIST, "Receptionist account has role RECEPTIONIST");
  assert(receptionistUser?.isActive === true, "Receptionist account is active");

  const pharmaUser = db.users.get("demo.pharma@medcore.io");
  assert(pharmaUser !== undefined, "Pharmacist user exists");
  assert(pharmaUser?.role === UserRole.PHARMACIST, "Pharmacist account has role PHARMACIST");

  const labUser = db.users.get("demo.lab@medcore.io");
  assert(labUser !== undefined, "Lab Tech user exists");
  assert(labUser?.role === UserRole.LAB_TECHNICIAN, "Lab Tech account has role LAB_TECHNICIAN");

  const billingUser = db.users.get("demo.billing@medcore.io");
  assert(billingUser !== undefined, "Accountant user exists");
  assert(billingUser?.role === UserRole.ACCOUNTANT, "Accountant account has role ACCOUNTANT");

  // Test 3: Password verification
  console.log("\n--- 3. Password Verification & Security ---");
  assert(bcrypt.compareSync("Demo@MedCore2026", adminUser.passwordHash), "Admin password matches Demo@MedCore2026");
  assert(bcrypt.compareSync("Demo@MedCore2026", doctorUser.passwordHash), "Doctor password matches Demo@MedCore2026");
  assert(!bcrypt.compareSync("WrongPassword", adminUser.passwordHash), "Incorrect password correctly rejected");

  // Test 4: Clinical Entities Verification
  console.log("\n--- 4. Clinical Data Entities ---");
  assert(db.departments.size === 5, "5 clinical departments created (CARD, NEUR, PEDI, GENM, ORTH)");
  assert(db.rooms.size === 4, "4 hospital rooms created (ICU, General Ward, Private, OT)");
  assert(db.doctors.size === 1, "Doctor profile created for Dr. Arun Sharma");
  assert(db.patients.size === 4, "4 synthetic patients created with MRNs");
  assert(db.medicines.size === 5, "5 formulary medicines registered");
  assert(db.labTests.size === 3, "3 lab tests registered");
  assert(db.appointments.size === 4, "4 appointments created covering past, current, and upcoming");

  // Test 5: EMR & Billing Verification
  console.log("\n--- 5. EMR, Diagnostic Results & Billing ---");
  const medRec = db.medicalRecords.get("medrec-demo-001");
  assert(medRec !== undefined, "Clinical EMR medical record exists");
  assert(db.vitalSigns.length >= 1, "Vital signs recorded (BP, HR, SpO2, BMI)");
  assert(db.diagnoses.length >= 1, "Primary diagnosis recorded (I10 Essential Hypertension)");
  assert(db.treatmentPlans.length >= 1, "Treatment plan recorded");
  assert(db.prescriptions.size >= 1, "Prescription created");
  assert(db.prescriptionItems.length >= 2, "Prescription items linked (Atorva 20, Pan 40)");
  assert(db.labOrders.size >= 1, "Lab order created");
  assert(db.labResults.length >= 1, "Lab result with normal values recorded");
  assert(db.invoices.size === 2, "2 invoices created (1 paid, 1 pending)");
  assert(db.payments.length >= 1, "Payment record created for settled invoice");

  // Test 6: Idempotency (Running seedDemoData a second time)
  console.log("\n--- 6. Idempotency Verification ---");
  const initialHospitalsCount = db.hospitals.size;
  const initialUsersCount = db.users.size;
  const initialAppointmentsCount = db.appointments.size;

  await seedDemoData(prisma, nullLogger);

  assert(db.hospitals.size === initialHospitalsCount, "Hospital count remained unchanged after re-run");
  assert(db.users.size === initialUsersCount, "User count remained unchanged after re-run");
  assert(db.appointments.size === initialAppointmentsCount, "Appointment count remained unchanged after re-run");

  // Test 7: Super Admin Isolation
  console.log("\n--- 7. Super Admin Isolation ---");
  const allUsers = Array.from(db.users.values());
  const hasSuperAdmin = allUsers.some((u) => u.role === UserRole.SUPER_ADMIN);
  assert(!hasSuperAdmin, "No demo user has SUPER_ADMIN role (Super Admin credentials remain isolated)");
  const allScoped = allUsers.every((u) => u.hospitalId === "hosp-demo-001");
  assert(allScoped, "All demo users are strictly scoped to demo hospitalId");

  console.log("\n==========================================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==========================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runUnitTests().catch((e) => {
  console.error("Test runner failed:", e);
  process.exit(1);
});
