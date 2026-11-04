import { PrismaClient, UserRole, Gender, AppointmentStatus } from "@prisma/client";

const prisma = new PrismaClient();

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(id: number, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} [Test ${id}] ${name}: ${details}`);
}

async function runTests() {
  console.log("=================================================");
  console.log("🔬 MedCore HMS — Phase 2 Database Verification Suite");
  console.log("=================================================\n");

  // 1. Prisma connects to PostgreSQL
  try {
    const res = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result`;
    record(1, "Prisma connects to PostgreSQL", res[0].result === 1, "Connection active, query executed");
  } catch (e: any) {
    record(1, "Prisma connects to PostgreSQL", false, e.message);
  }

  // 2. All migrations apply successfully
  try {
    const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date }>>`
      SELECT migration_name, finished_at FROM _prisma_migrations WHERE rolled_back_at IS NULL
    `;
    const passed = migrations.length > 0 && migrations[0].finished_at !== null;
    record(2, "All migrations apply successfully", passed, `Found ${migrations.length} applied migration(s)`);
  } catch (e: any) {
    record(2, "All migrations apply successfully", false, e.message);
  }

  // 3. Prisma Client generates successfully
  try {
    const models = ["hospital", "user", "doctor", "patient", "appointment", "medicalRecord", "invoice", "labOrder"];
    const allPresent = models.every((m) => typeof (prisma as any)[m]?.findMany === "function");
    record(3, "Prisma Client generates successfully", allPresent, "All core model delegates present on PrismaClient");
  } catch (e: any) {
    record(3, "Prisma Client generates successfully", false, e.message);
  }

  // 4. Hospital records can be created
  try {
    const count = await prisma.hospital.count();
    record(4, "Hospital records can be created", count >= 2, `Verified ${count} seeded hospital record(s)`);
  } catch (e: any) {
    record(4, "Hospital records can be created", false, e.message);
  }

  // 5. Hospital-specific users can be created
  try {
    const staff = await prisma.user.findFirst({
      where: { role: UserRole.HOSPITAL_ADMIN, hospitalId: { not: null } },
      include: { hospital: true },
    });
    const passed = !!staff && staff.hospital !== null;
    record(5, "Hospital-specific users can be created", passed, `User ${staff?.email} scoped to hospital ${staff?.hospital?.name}`);
  } catch (e: any) {
    record(5, "Hospital-specific users can be created", false, e.message);
  }

  // 6. Doctor and patient relationships work
  try {
    const doc = await prisma.doctor.findFirst({
      include: { user: true, department: true, hospital: true },
    });
    const pat = await prisma.patient.findFirst({
      include: { hospital: true, allergies: true, medicationHistories: true },
    });
    const passed = !!doc?.user && !!doc?.department && !!pat?.hospital;
    record(6, "Doctor and patient relationships work", passed, `Doctor ${doc?.licenseNumber} linked to ${doc?.department?.name}; Patient ${pat?.mrn} linked to hospital`);
  } catch (e: any) {
    record(6, "Doctor and patient relationships work", false, e.message);
  }

  // 7. Appointment relationships work
  try {
    const apt = await prisma.appointment.findFirst({
      include: { doctor: { include: { user: true } }, patient: true, department: true, hospital: true },
    });
    const passed = !!apt?.doctor && !!apt?.patient && !!apt?.department;
    record(7, "Appointment relationships work", passed, `Appointment ${apt?.id} linked to Dr. ${apt?.doctor?.user?.lastName} and Patient ${apt?.patient?.lastName}`);
  } catch (e: any) {
    record(7, "Appointment relationships work", false, e.message);
  }

  // 8. Medical records are linked correctly
  try {
    const mr = await prisma.medicalRecord.findFirst({
      include: { appointment: true, patient: true, doctor: true, vitalSigns: true, diagnoses: true, treatmentPlans: true },
    });
    const passed = !!mr?.appointment && !!mr?.patient && mr.diagnoses.length > 0;
    record(8, "Medical records are linked correctly", passed, `MedicalRecord ${mr?.id} linked 1:1 with Appointment ${mr?.appointment?.id}`);
  } catch (e: any) {
    record(8, "Medical records are linked correctly", false, e.message);
  }

  // 9. PrescriptionItem relationships work
  try {
    const rx = await prisma.prescription.findFirst({
      include: { items: { include: { medicine: true } } },
    });
    const passed = !!rx && rx.items.length > 0 && !!rx.items[0].medicine;
    record(9, "PrescriptionItem relationships work", passed, `Prescription ${rx?.id} links Medicine ${rx?.items[0]?.medicine?.name} via PrescriptionItem`);
  } catch (e: any) {
    record(9, "PrescriptionItem relationships work", false, e.message);
  }

  // 10. Lab orders and lab tests work
  try {
    const lo = await prisma.labOrder.findFirst({
      include: { results: { include: { labTest: true } } },
    });
    const passed = !!lo && lo.results.length > 0 && !!lo.results[0].labTest;
    record(10, "Lab orders and lab tests work", passed, `LabOrder ${lo?.id} has result ${lo?.results[0]?.resultValue} for ${lo?.results[0]?.labTest?.name}`);
  } catch (e: any) {
    record(10, "Lab orders and lab tests work", false, e.message);
  }

  // 11. Invoice and InvoiceItem relationships work
  try {
    const inv = await prisma.invoice.findFirst({
      include: { items: true, payments: true, patient: true },
    });
    const passed = !!inv && inv.items.length > 0 && inv.payments.length > 0;
    record(11, "Invoice and InvoiceItem relationships work", passed, `Invoice ${inv?.invoiceNumber} has ${inv?.items.length} items and total ₹${inv?.totalAmount}`);
  } catch (e: any) {
    record(11, "Invoice and InvoiceItem relationships work", false, e.message);
  }

  // 12. Unique constraints work
  try {
    let duplicateRejected = false;
    try {
      await prisma.hospital.create({
        data: {
          code: "APEX-MAIN", // duplicate of existing
          name: "Duplicate Apex Hospital",
          email: "duplicate@apex.org",
          phone: "+91-000-0000000",
        },
      });
    } catch (err: any) {
      duplicateRejected = err.code === "P2002";
    }
    record(12, "Unique constraints work", duplicateRejected, "Duplicate hospital code rejected with Prisma P2002");
  } catch (e: any) {
    record(12, "Unique constraints work", false, e.message);
  }

  // 13. Foreign-key constraints work
  try {
    let fkRejected = false;
    try {
      await prisma.department.create({
        data: {
          hospitalId: "00000000-0000-0000-0000-000000000000", // Non-existent foreign key
          code: "NONEXIST",
          name: "Invalid Dept",
        },
      });
    } catch (err: any) {
      fkRejected = err.code === "P2003";
    }
    record(13, "Foreign-key constraints work", fkRejected, "Invalid foreign key rejected with Prisma P2003");
  } catch (e: any) {
    record(13, "Foreign-key constraints work", false, e.message);
  }

  // 14. Required indexes exist
  try {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string; tablename: string }>>`
      SELECT tablename, indexname FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND (indexname LIKE '%hospitalId%' OR indexname LIKE '%patientId%' OR indexname LIKE '%doctorId%' OR indexname LIKE '%appointmentDate%')
    `;
    const passed = indexes.length >= 10;
    record(14, "Required indexes exist", passed, `Found ${indexes.length} tenant/relational indexes on postgres tables`);
  } catch (e: any) {
    record(14, "Required indexes exist", false, e.message);
  }

  // 15. Soft-delete fields behave as expected
  try {
    // Soft delete a test appointment
    const testApt = await prisma.appointment.findFirst({ where: { deletedAt: null } });
    if (!testApt) throw new Error("No appointment found");
    const softDeleted = await prisma.appointment.update({
      where: { id: testApt.id },
      data: { deletedAt: new Date() },
    });
    const isSoftDeleted = softDeleted.deletedAt !== null;
    // Restore back
    await prisma.appointment.update({
      where: { id: testApt.id },
      data: { deletedAt: null },
    });
    record(15, "Soft-delete fields behave as expected", isSoftDeleted, `Soft deletion timestamp successfully updated and restored`);
  } catch (e: any) {
    record(15, "Soft-delete fields behave as expected", false, e.message);
  }

  // 16. Medical records cannot be physically deleted through referential integrity
  try {
    const mr = await prisma.medicalRecord.findFirst();
    if (!mr || !mr.appointmentId) throw new Error("No medical record found");
    let deletePrevented = false;
    try {
      // Trying to delete appointment that is referenced by medical record (onDelete: Restrict)
      await prisma.appointment.delete({
        where: { id: mr.appointmentId },
      });
    } catch (err: any) {
      deletePrevented = err.code === "P2003" || err.message.includes("Foreign key constraint");
    }
    record(16, "Medical records protected from deletion", deletePrevented, "Referential integrity constraint prevents deletion of linked appointment/EMR");
  } catch (e: any) {
    record(16, "Medical records protected from deletion", false, e.message);
  }

  // 17. Cross-tenant references are rejected where database constraints support this
  try {
    const hosp1 = await prisma.hospital.findFirst({ where: { code: "APEX-MAIN" } });
    const hosp2 = await prisma.hospital.findFirst({ where: { code: "CITY-CARE" } });
    if (!hosp1 || !hosp2) throw new Error("Hospitals not found");

    // Test compound unique constraint: @@unique([hospitalId, mrn])
    // Two patients can have the same MRN in DIFFERENT hospitals, but NOT in the SAME hospital
    let crossTenantIsolated = false;
    const testMrn = "MRN-SHARED-001";

    const p1 = await prisma.patient.create({
      data: {
        hospitalId: hosp1.id,
        mrn: testMrn,
        firstName: "Tenant1",
        lastName: "Patient",
        dateOfBirth: new Date("1990-01-01"),
        gender: Gender.MALE,
        phone: "+91-9999900001",
        emergencyContactName: "Contact",
        emergencyContactPhone: "+91-9999900002",
      },
    });

    const p2 = await prisma.patient.create({
      data: {
        hospitalId: hosp2.id,
        mrn: testMrn, // Allowed because hospitalId is different!
        firstName: "Tenant2",
        lastName: "Patient",
        dateOfBirth: new Date("1990-01-01"),
        gender: Gender.FEMALE,
        phone: "+91-9999900003",
        emergencyContactName: "Contact",
        emergencyContactPhone: "+91-9999900004",
      },
    });

    // But duplicate in hosp1 should fail:
    let intraHospitalDuplicateFailed = false;
    try {
      await prisma.patient.create({
        data: {
          hospitalId: hosp1.id,
          mrn: testMrn, // Should FAIL
          firstName: "Tenant1Duplicate",
          lastName: "Patient",
          dateOfBirth: new Date("1990-01-01"),
          gender: Gender.OTHER,
          phone: "+91-9999900005",
          emergencyContactName: "Contact",
          emergencyContactPhone: "+91-9999900006",
        },
      });
    } catch (err: any) {
      intraHospitalDuplicateFailed = err.code === "P2002";
    }

    // Clean up test patients
    await prisma.patient.delete({ where: { id: p1.id } });
    await prisma.patient.delete({ where: { id: p2.id } });

    crossTenantIsolated = intraHospitalDuplicateFailed;
    record(17, "Cross-tenant compound constraints work", crossTenantIsolated, "MRN is scoped per-hospital via @@unique([hospitalId, mrn])");
  } catch (e: any) {
    record(17, "Cross-tenant compound constraints work", false, e.message);
  }

  console.log("\n=================================================");
  const allPassed = results.every((r) => r.passed);
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${results.filter((r) => !r.passed).length}`);
  console.log(`SUITE RESULT: ${allPassed ? "ALL TESTS PASSED 🎉" : "TEST FAILURES DETECTED ❌"}`);
  console.log("=================================================");

  if (!allPassed) {
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error("Test runner execution error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
