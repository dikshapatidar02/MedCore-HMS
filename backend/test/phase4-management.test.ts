import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, AppointmentStatus, AppointmentType, Gender } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

interface TestResult {
  id: number;
  category: "HOSPITAL" | "DEPARTMENT" | "DOCTOR" | "SCHEDULING" | "PATIENT" | "APPOINTMENT";
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(
  id: number,
  category: TestResult["category"],
  name: string,
  passed: boolean,
  details: string
) {
  results.push({ id, category, name, passed, details });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} [${category} Test ${id}] ${name}: ${details}`);
}

async function runPhase4Tests() {
  console.log("==========================================================================");
  console.log("🔬 MedCore HMS — Phase 4 Hospital, Dept, Doctor, Patient & Appointment Suite");
  console.log("==========================================================================\n");

  const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(0);
  const serverAddress = app.getHttpServer().address();
  const port = typeof serverAddress === "string" ? 3001 : serverAddress.port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  const prisma = app.get(PrismaService);
  const jwtService = app.get(JwtService);

  const hospApex = await prisma.hospital.findUnique({ where: { code: "APEX-MAIN" } });
  const hospCity = await prisma.hospital.findUnique({ where: { code: "CITY-CARE" } });

  if (!hospApex || !hospCity) {
    throw new Error("Seeded hospitals APEX-MAIN and CITY-CARE must exist in database.");
  }

  // Token generator helper
  const makeToken = (user: { id: string; email: string; role: UserRole; hospitalId: string | null }) => {
    return jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: "15m",
      }
    );
  };

  // Fetch users for different roles
  const superAdmin = await prisma.user.findUnique({ where: { email: "superadmin@medcore.io" } });
  const adminApex = await prisma.user.findUnique({ where: { email: "admin.apex@medcore.io" } });
  const adminCity = await prisma.user.findUnique({ where: { email: "admin.city@medcore.io" } });
  const docApexUser = await prisma.user.findUnique({ where: { email: "dr.arun.sharma@apexhealth.org" } });
  const docCityUser = await prisma.user.findUnique({ where: { email: "dr.tanvi.patil@citycarehospitals.com" } });
  const patientApexUser = await prisma.user.findUnique({ where: { email: "patient.rajesh.sharma0@example.com" } });
  const patientCityUser = await prisma.user.findUnique({ where: { email: "patient.pooja.patel1@example.com" } });

  if (!superAdmin || !adminApex || !adminCity || !docApexUser || !docCityUser || !patientApexUser) {
    throw new Error("Required seed users for tests are missing.");
  }

  const tokenSuper = makeToken(superAdmin);
  const tokenApexAdmin = makeToken(adminApex);
  const tokenCityAdmin = makeToken(adminCity);
  const tokenApexDoc = makeToken(docApexUser);
  const tokenCityDoc = makeToken(docCityUser);
  const tokenApexPatient = makeToken(patientApexUser);

  // Fetch profiles
  const docApex = await prisma.doctor.findUnique({ where: { userId: docApexUser.id } });
  const docCity = await prisma.doctor.findUnique({ where: { userId: docCityUser.id } });
  const patApex = await prisma.patient.findUnique({ where: { userId: patientApexUser.id } });

  let testId = 1;

  try {
    // ==========================================
    // 1. HOSPITAL MANAGEMENT TESTS
    // ==========================================
    console.log("--- 1. HOSPITAL MANAGEMENT TESTS ---");

    // Test 1: Super Admin hospital listing
    const res1 = await fetch(`${baseUrl}/hospitals`, {
      headers: { Authorization: `Bearer ${tokenSuper}` },
    });
    const rawData1 = await res1.json();
    const data1 = rawData1.data || rawData1;
    record(
      testId++,
      "HOSPITAL",
      "Super Admin Hospital Listing",
      res1.status === 200 && Array.isArray(data1.items) && data1.total >= 2,
      `HTTP ${res1.status}, returned ${data1.total} hospitals across tenants`
    );

    // Test 2: Hospital Admin profile viewing (own hospital)
    const res2 = await fetch(`${baseUrl}/hospitals/my-hospital`, {
      headers: { Authorization: `Bearer ${tokenApexAdmin}` },
    });
    const rawData2 = await res2.json();
    const data2 = rawData2.data || rawData2;
    record(
      testId++,
      "HOSPITAL",
      "Hospital Admin Own Profile Access",
      res2.status === 200 && data2.id === hospApex.id && data2.code === "APEX-MAIN",
      `HTTP ${res2.status}, successfully returned Apex Hospital details`
    );

    // Test 3: Hospital Admin updating own hospital permitted fields
    const res3 = await fetch(`${baseUrl}/hospitals/my-hospital`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        tagline: "Excellence in Clinical Care & Surgical Innovation Updated",
        website: "https://apexhealth.org",
      }),
    });
    const rawData3 = await res3.json();
    const data3 = rawData3.data || rawData3;
    record(
      testId++,
      "HOSPITAL",
      "Hospital Admin Profile Update",
      res3.status === 200 && data3.tagline?.includes("Updated"),
      `HTTP ${res3.status}, updated permitted hospital profile details`
    );

    // Test 4: Hospital Admin attempting to update another hospital via detail endpoint (Forbidden)
    const res4 = await fetch(`${baseUrl}/hospitals/detail/${hospCity.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({ name: "Hacked Hospital" }),
    });
    record(
      testId++,
      "HOSPITAL",
      "Hospital Admin Cross-Tenant Update Rejection",
      res4.status === 403,
      `HTTP ${res4.status}, cross-tenant modification strictly rejected`
    );

    // ==========================================
    // 2. DEPARTMENT MANAGEMENT TESTS
    // ==========================================
    console.log("\n--- 2. DEPARTMENT MANAGEMENT TESTS ---");

    // Test 5: Hospital Admin creating a department in own hospital
    const testDeptCode = `TEST_${Date.now().toString().slice(-4)}`;
    const res5 = await fetch(`${baseUrl}/departments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        code: testDeptCode,
        name: `Specialty Unit ${testDeptCode}`,
        description: "Advanced surgical testing unit",
      }),
    });
    const data5 = await res5.json();
    const createdDeptId = data5.id;
    record(
      testId++,
      "DEPARTMENT",
      "Create Department in Own Hospital",
      res5.status === 201 && data5.code === testDeptCode && data5.hospitalId === hospApex.id,
      `HTTP ${res5.status}, created department ID ${createdDeptId}`
    );

    // Test 6: Duplicate department code rejection in same hospital
    const res6 = await fetch(`${baseUrl}/departments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        code: testDeptCode,
        name: "Duplicate Unit",
      }),
    });
    record(
      testId++,
      "DEPARTMENT",
      "Reject Duplicate Department Code in Same Hospital",
      res6.status === 409,
      `HTTP ${res6.status}, conflict error raised for duplicate department code`
    );

    // Test 7: Reject cross-hospital doctor assignment as head of department
    const res7 = await fetch(`${baseUrl}/departments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        code: `X${testDeptCode}`,
        name: "Cross Hospital Dept",
        headOfDepartmentId: docCity?.id, // Doctor from CityCare
      }),
    });
    record(
      testId++,
      "DEPARTMENT",
      "Reject Cross-Hospital Doctor as Head of Department",
      res7.status === 403,
      `HTTP ${res7.status}, cross-hospital head of department rejected`
    );

    // Test 8: Cross-tenant department access rejection
    const res8 = await fetch(`${baseUrl}/departments/${createdDeptId}`, {
      headers: { Authorization: `Bearer ${tokenCityAdmin}` }, // CityCare admin requesting Apex dept
    });
    record(
      testId++,
      "DEPARTMENT",
      "Reject Cross-Tenant Department Read",
      res8.status === 403,
      `HTTP ${res8.status}, tenant isolation strictly enforced on department access`
    );

    // ==========================================
    // 3. DOCTOR MANAGEMENT TESTS
    // ==========================================
    console.log("\n--- 3. DOCTOR MANAGEMENT TESTS ---");

    // Test 9: Registering a new doctor with new user credentials
    const uniqueNum = Date.now().toString().slice(-5);
    const testDoctorLicense = `MCI-TEST-${uniqueNum}`;
    const testDoctorEmail = `dr.test.${uniqueNum}@apexhealth.org`;

    const res9 = await fetch(`${baseUrl}/doctors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        firstName: "Vikramaditya",
        lastName: "Rathore",
        email: testDoctorEmail,
        password: "DemoPassword@123",
        phone: "+91-9988776655",
        departmentId: createdDeptId,
        licenseNumber: testDoctorLicense,
        specialization: "Pediatric Surgery",
        experienceYears: 10,
        consultationFee: 1500,
        bio: "Specialist pediatric and neonatal surgeon",
      }),
    });
    const data9 = await res9.json();
    const createdDoctorId = data9.id;
    record(
      testId++,
      "DOCTOR",
      "Register Doctor with New User Account",
      res9.status === 201 && data9.licenseNumber === testDoctorLicense,
      `HTTP ${res9.status}, created doctor ID ${createdDoctorId}`
    );

    // Test 10: Reject cross-hospital department assignment for doctor
    const res10 = await fetch(`${baseUrl}/doctors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenCityAdmin}`, // City admin attempting to use Apex dept
      },
      body: JSON.stringify({
        firstName: "Siddharth",
        lastName: "Roy",
        email: `dr.sid.${uniqueNum}@citycare.org`,
        password: "DemoPassword@123",
        departmentId: createdDeptId, // belongs to Apex!
        licenseNumber: `KMC-TEST-${uniqueNum}`,
        specialization: "General Medicine",
        consultationFee: 800,
      }),
    });
    record(
      testId++,
      "DOCTOR",
      "Reject Cross-Hospital Department Assignment",
      res10.status === 403,
      `HTTP ${res10.status}, cross-hospital department assignment rejected`
    );

    // Test 11: Cross-tenant doctor profile access rejection
    const res11 = await fetch(`${baseUrl}/doctors/${createdDoctorId}`, {
      headers: { Authorization: `Bearer ${tokenCityAdmin}` },
    });
    record(
      testId++,
      "DOCTOR",
      "Reject Cross-Tenant Doctor Profile Access",
      res11.status === 403,
      `HTTP ${res11.status}, cross-tenant access to doctor profile forbidden`
    );

    // Test 12: Doctor attempting to modify unauthorized fields (e.g. fee) on own profile
    const res12 = await fetch(`${baseUrl}/doctors/${docApex?.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexDoc}`,
      },
      body: JSON.stringify({
        consultationFee: 5000, // Doctor cannot change own fee!
      }),
    });
    record(
      testId++,
      "DOCTOR",
      "Reject Doctor Modifying Own Consultation Fee",
      res12.status === 403,
      `HTTP ${res12.status}, fee modification restricted to hospital administration`
    );

    // Test 13: Doctor updating permitted profile fields (bio)
    const res13 = await fetch(`${baseUrl}/doctors/${docApex?.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexDoc}`,
      },
      body: JSON.stringify({
        bio: "Updated clinical profile and research publications",
      }),
    });
    record(
      testId++,
      "DOCTOR",
      "Doctor Modifying Permitted Profile Fields (Bio)",
      res13.status === 200,
      `HTTP ${res13.status}, doctor successfully updated bio`
    );

    // ==========================================
    // 4. DOCTOR AVAILABILITY & SCHEDULING TESTS
    // ==========================================
    console.log("\n--- 4. DOCTOR AVAILABILITY & SCHEDULING TESTS ---");

    // Test 14: Setting weekly doctor availability
    const res14 = await fetch(`${baseUrl}/scheduling/doctors/${createdDoctorId}/availability`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        slots: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "13:00", slotDurationMinutes: 30 },
          { dayOfWeek: 1, startTime: "14:00", endTime: "17:00", slotDurationMinutes: 30 },
          { dayOfWeek: 2, startTime: "09:00", endTime: "13:00", slotDurationMinutes: 30 },
        ],
      }),
    });
    const data14 = await res14.json();
    record(
      testId++,
      "SCHEDULING",
      "Set Weekly Doctor Availability",
      res14.status === 200 && data14.availabilities?.length === 3,
      `HTTP ${res14.status}, configured 3 availability windows`
    );

    // Test 15: Reject invalid time range (startTime >= endTime)
    const res15 = await fetch(`${baseUrl}/scheduling/doctors/${createdDoctorId}/availability`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        slots: [{ dayOfWeek: 3, startTime: "14:00", endTime: "10:00" }],
      }),
    });
    record(
      testId++,
      "SCHEDULING",
      "Reject Invalid Availability Time Range",
      res15.status === 400,
      `HTTP ${res15.status}, rejected inverted slot time range`
    );

    // Test 16: Reject overlapping availability slots on the same day
    const res16 = await fetch(`${baseUrl}/scheduling/doctors/${createdDoctorId}/availability`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        slots: [
          { dayOfWeek: 4, startTime: "09:00", endTime: "12:00" },
          { dayOfWeek: 4, startTime: "11:00", endTime: "14:00" }, // overlaps with 11:00-12:00!
        ],
      }),
    });
    record(
      testId++,
      "SCHEDULING",
      "Reject Overlapping Availability Slots",
      res16.status === 400,
      `HTTP ${res16.status}, overlapping slots detected and rejected`
    );

    // Test 17: Add full-day schedule exception (Leave)
    const leaveDate = "2026-11-25";
    const res17 = await fetch(`${baseUrl}/scheduling/doctors/${createdDoctorId}/exceptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        date: leaveDate,
        isAvailable: false,
        reason: "Surgical Congress Speaker",
      }),
    });
    record(
      testId++,
      "SCHEDULING",
      "Add Schedule Exception (Full Day Leave)",
      res17.status === 201,
      `HTTP ${res17.status}, exception added for ${leaveDate}`
    );

    // Test 18: Available slot computation on full-day leave
    const res18 = await fetch(`${baseUrl}/scheduling/doctors/${createdDoctorId}/slots?date=${leaveDate}`, {
      headers: { Authorization: `Bearer ${tokenApexAdmin}` },
    });
    const data18 = await res18.json();
    record(
      testId++,
      "SCHEDULING",
      "Live Slot Computation Blocks Full-Day Leave",
      res18.status === 200 && data18.isAvailable === false && data18.slots.length === 0,
      `HTTP ${res18.status}, returned 0 slots due to leave: '${data18.reason}'`
    );

    // ==========================================
    // 5. PATIENT MANAGEMENT TESTS
    // ==========================================
    console.log("\n--- 5. PATIENT MANAGEMENT TESTS ---");

    // Test 19: Patient Registration with auto-generated unique MRN and Address
    const res19 = await fetch(`${baseUrl}/patients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        firstName: "Anirudh",
        lastName: "Sharma",
        dateOfBirth: "1988-06-20",
        gender: Gender.MALE,
        bloodGroup: "B+",
        phone: `+91-98765${uniqueNum}`,
        email: `anirudh.${uniqueNum}@example.com`,
        emergencyContactName: "Sunita Sharma",
        emergencyContactPhone: "+91-9876500000",
        address: {
          street: "100 MG Road",
          city: "Noida",
          state: "Uttar Pradesh",
          postalCode: "201301",
        },
      }),
    });
    const data19 = await res19.json();
    const createdPatientId = data19.id;
    record(
      testId++,
      "PATIENT",
      "Patient Registration & MRN Generation",
      res19.status === 201 && typeof data19.mrn === "string" && data19.mrn.startsWith("APEX"),
      `HTTP ${res19.status}, registered patient with MRN: ${data19.mrn}`
    );

    // Test 20: Patient self-profile access
    const res20 = await fetch(`${baseUrl}/patients/me`, {
      headers: { Authorization: `Bearer ${tokenApexPatient}` },
    });
    const data20 = await res20.json();
    record(
      testId++,
      "PATIENT",
      "Patient Self-Profile Access",
      res20.status === 200 && data20.userId === patientApexUser.id,
      `HTTP ${res20.status}, patient retrieved own profile`
    );

    // Test 21: Patient A attempting to access Patient B (Forbidden)
    const res21 = await fetch(`${baseUrl}/patients/${createdPatientId}`, {
      headers: { Authorization: `Bearer ${tokenApexPatient}` },
    });
    record(
      testId++,
      "PATIENT",
      "Patient Self-Privacy Boundary (Patient A cannot view Patient B)",
      res21.status === 403,
      `HTTP ${res21.status}, unauthorized cross-patient profile access rejected`
    );

    // Test 22: Patient attempting to view full patient directory (Forbidden)
    const res22 = await fetch(`${baseUrl}/patients`, {
      headers: { Authorization: `Bearer ${tokenApexPatient}` },
    });
    record(
      testId++,
      "PATIENT",
      "Patient Directory Access Blocked for Patient Role",
      res22.status === 403,
      `HTTP ${res22.status}, directory listing blocked for patient role`
    );

    // Test 23: Cross-tenant patient access rejection
    const res23 = await fetch(`${baseUrl}/patients/${createdPatientId}`, {
      headers: { Authorization: `Bearer ${tokenCityAdmin}` }, // City admin requesting Apex patient
    });
    record(
      testId++,
      "PATIENT",
      "Reject Cross-Tenant Patient Access",
      res23.status === 403,
      `HTTP ${res23.status}, tenant isolation strictly enforced on patient records`
    );

    // ==========================================
    // 6. APPOINTMENT MANAGEMENT TESTS
    // ==========================================
    console.log("\n--- 6. APPOINTMENT MANAGEMENT TESTS ---");

    // Test 24: Successful Appointment Creation
    const apptDateStr = "2026-11-16"; // A future Monday
    const res24 = await fetch(`${baseUrl}/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        patientId: createdPatientId,
        doctorId: createdDoctorId,
        departmentId: createdDeptId,
        appointmentDate: apptDateStr,
        startTime: "09:00",
        endTime: "09:30",
        type: AppointmentType.CONSULTATION,
        reason: "Initial clinical evaluation",
      }),
    });
    const data24 = await res24.json();
    const createdApptId = data24.id;
    record(
      testId++,
      "APPOINTMENT",
      "Create Valid Appointment",
      res24.status === 201 && data24.status === AppointmentStatus.PENDING,
      `HTTP ${res24.status}, booked appointment ID ${createdApptId}`
    );

    // Test 25: Reject past appointment booking
    const res25 = await fetch(`${baseUrl}/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        patientId: createdPatientId,
        doctorId: createdDoctorId,
        appointmentDate: "2023-01-01",
        startTime: "10:00",
        endTime: "10:30",
        reason: "Retroactive checkup",
      }),
    });
    record(
      testId++,
      "APPOINTMENT",
      "Reject Booking for Past Dates",
      res25.status === 400,
      `HTTP ${res25.status}, booking for past dates rejected`
    );

    // Test 26: Double-Booking Prevention (Same Doctor, overlapping time)
    const res26 = await fetch(`${baseUrl}/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        patientId: patApex?.id, // different patient
        doctorId: createdDoctorId, // same doctor!
        appointmentDate: apptDateStr,
        startTime: "09:15", // OVERLAPS with 09:00-09:30!
        endTime: "09:45",
        reason: "Overlapping attempt",
      }),
    });
    record(
      testId++,
      "APPOINTMENT",
      "Prevent Doctor Double-Booking (Concurrency Conflict)",
      res26.status === 409,
      `HTTP ${res26.status}, double-booking conflict detected and rejected`
    );

    // Test 27: Patient Conflict Prevention (Same Patient, overlapping time with another doctor)
    const res27 = await fetch(`${baseUrl}/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        patientId: createdPatientId, // same patient!
        doctorId: docApex?.id, // different doctor
        appointmentDate: apptDateStr,
        startTime: "09:00", // OVERLAPS with their appointment!
        endTime: "09:30",
        reason: "Simultaneous booking attempt",
      }),
    });
    record(
      testId++,
      "APPOINTMENT",
      "Prevent Patient Overlapping Booking Conflict",
      res27.status === 409,
      `HTTP ${res27.status}, patient conflict detected and rejected`
    );

    // Test 28: Cross-Hospital Appointment Booking Rejection
    const res28 = await fetch(`${baseUrl}/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSuper}`,
      },
      body: JSON.stringify({
        patientId: createdPatientId, // belongs to Apex
        doctorId: docCity?.id, // belongs to CityCare!
        appointmentDate: "2026-11-18",
        startTime: "10:00",
        endTime: "10:30",
        reason: "Cross hospital booking",
      }),
    });
    record(
      testId++,
      "APPOINTMENT",
      "Reject Cross-Hospital Doctor/Patient Booking",
      res28.status === 403,
      `HTTP ${res28.status}, cross-hospital booking strictly forbidden`
    );

    // Test 29: Reschedule appointment
    const res29 = await fetch(`${baseUrl}/appointments/${createdApptId}/reschedule`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        appointmentDate: apptDateStr,
        startTime: "10:00",
        endTime: "10:30",
        reason: "Rescheduled to mid-morning slot",
      }),
    });
    const data29 = await res29.json();
    record(
      testId++,
      "APPOINTMENT",
      "Reschedule Appointment to New Slot",
      res29.status === 200 && data29.startTime === "10:00",
      `HTTP ${res29.status}, appointment moved to 10:00-10:30`
    );

    // Test 30: Valid status transition PENDING -> CONFIRMED
    const res30 = await fetch(`${baseUrl}/appointments/${createdApptId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        status: AppointmentStatus.CONFIRMED,
        notes: "Confirmed by desk coordinator",
      }),
    });
    const data30 = await res30.json();
    record(
      testId++,
      "APPOINTMENT",
      "Status Transition: PENDING -> CONFIRMED",
      res30.status === 200 && data30.status === AppointmentStatus.CONFIRMED,
      `HTTP ${res30.status}, status updated to CONFIRMED`
    );

    // Test 31: Status transition CONFIRMED -> IN_PROGRESS
    const res31 = await fetch(`${baseUrl}/appointments/${createdApptId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        status: AppointmentStatus.IN_PROGRESS,
      }),
    });
    const data31 = await res31.json();
    record(
      testId++,
      "APPOINTMENT",
      "Status Transition: CONFIRMED -> IN_PROGRESS",
      res31.status === 200 && data31.status === AppointmentStatus.IN_PROGRESS,
      `HTTP ${res31.status}, status updated to IN_PROGRESS`
    );

    // Test 32: Status transition IN_PROGRESS -> COMPLETED
    const res32 = await fetch(`${baseUrl}/appointments/${createdApptId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        status: AppointmentStatus.COMPLETED,
        notes: "Consultation concluded successfully",
      }),
    });
    const data32 = await res32.json();
    record(
      testId++,
      "APPOINTMENT",
      "Status Transition: IN_PROGRESS -> COMPLETED",
      res32.status === 200 && data32.status === AppointmentStatus.COMPLETED,
      `HTTP ${res32.status}, status updated to COMPLETED (terminal state)`
    );

    // Test 33: Invalid status transition from COMPLETED -> PENDING (Forbidden by state machine)
    const res33 = await fetch(`${baseUrl}/appointments/${createdApptId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        status: AppointmentStatus.PENDING,
      }),
    });
    record(
      testId++,
      "APPOINTMENT",
      "Reject Invalid Status Transition from Terminal State",
      res33.status === 400,
      `HTTP ${res33.status}, transition from COMPLETED to PENDING rejected`
    );

    // Test 34: Reject cancellation or rescheduling of COMPLETED appointment
    const res34 = await fetch(`${baseUrl}/appointments/${createdApptId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({ reason: "Late cancellation request" }),
    });
    record(
      testId++,
      "APPOINTMENT",
      "Reject Cancellation of Completed Appointment",
      res34.status === 400,
      `HTTP ${res34.status}, cancellation of completed appointment locked`
    );

    // Test 35: Cross-tenant appointment access rejection
    const res35 = await fetch(`${baseUrl}/appointments/${createdApptId}`, {
      headers: { Authorization: `Bearer ${tokenCityAdmin}` },
    });
    record(
      testId++,
      "APPOINTMENT",
      "Reject Cross-Tenant Appointment Access",
      res35.status === 403,
      `HTTP ${res35.status}, cross-tenant appointment access forbidden`
    );

    // ==========================================
    // 7. CONCURRENCY & ADVANCED SECURITY TESTS
    // ==========================================
    console.log("\n--- 7. CONCURRENCY & ADVANCED SECURITY TESTS ---");

    // Test 36: True Concurrent Booking Race Condition (Double-Booking Prevention via Advisory Locks)
    const concurrentSlot = { start: "11:00", end: "11:30" };
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      fetch(`${baseUrl}/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexAdmin}`,
        },
        body: JSON.stringify({
          patientId: createdPatientId,
          doctorId: createdDoctorId,
          appointmentDate: apptDateStr,
          startTime: concurrentSlot.start,
          endTime: concurrentSlot.end,
          reason: "Concurrent request 1",
        }),
      }),
      fetch(`${baseUrl}/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexAdmin}`,
        },
        body: JSON.stringify({
          patientId: patApex?.id, // different patient
          doctorId: createdDoctorId, // exact same doctor & slot!
          appointmentDate: apptDateStr,
          startTime: concurrentSlot.start,
          endTime: concurrentSlot.end,
          reason: "Concurrent request 2",
        }),
      }),
    ]);

    const statuses = [concurrentRes1.status, concurrentRes2.status].sort();
    const concurrentPassed = statuses[0] === 201 && statuses[1] === 409;
    record(
      testId++,
      "APPOINTMENT",
      "Concurrent Booking Race Condition (Advisory Lock Serialization)",
      concurrentPassed,
      `Responses: [${concurrentRes1.status}, ${concurrentRes2.status}] -> Exactly one 201 and one 409`
    );

    // Test 37: Patient A cannot view Patient B's appointment by ID (IDOR prevention)
    const res37 = await fetch(`${baseUrl}/appointments/${createdApptId}`, {
      headers: { Authorization: `Bearer ${tokenApexPatient}` }, // Apex patient is user-patient-1, createdApptId is for Anirudh
    });
    record(
      testId++,
      "APPOINTMENT",
      "Patient Appointment Read Privacy (Patient A cannot view Patient B appointment)",
      res37.status === 403,
      `HTTP ${res37.status}, unauthorized patient access to appointment denied`
    );

    // Test 38: Patient A cannot reschedule Patient B's appointment (IDOR prevention)
    const res38 = await fetch(`${baseUrl}/appointments/${createdApptId}/reschedule`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexPatient}`,
      },
      body: JSON.stringify({
        appointmentDate: apptDateStr,
        startTime: "12:00",
        endTime: "12:30",
        reason: "Malicious reschedule",
      }),
    });
    record(
      testId++,
      "APPOINTMENT",
      "Patient Appointment Reschedule Privacy (Patient A cannot reschedule Patient B appointment)",
      res38.status === 403,
      `HTTP ${res38.status}, unauthorized reschedule attempt denied`
    );

    // Test 39: Patient A cannot cancel Patient B's appointment (IDOR prevention)
    const res39 = await fetch(`${baseUrl}/appointments/${createdApptId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexPatient}`,
      },
      body: JSON.stringify({
        reason: "Malicious cancel attempt",
      }),
    });
    record(
      testId++,
      "APPOINTMENT",
      "Patient Appointment Cancellation Privacy (Patient A cannot cancel Patient B appointment)",
      res39.status === 403,
      `HTTP ${res39.status}, unauthorized cancel attempt denied`
    );

    // Test 40: Rescheduling blocked by full-day doctor leave exception
    // First create a new pending appointment to test rescheduling rules
    const resNewAppt = await fetch(`${baseUrl}/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        patientId: createdPatientId,
        doctorId: createdDoctorId,
        appointmentDate: apptDateStr,
        startTime: "12:00",
        endTime: "12:30",
        reason: "Appointment to test reschedule validation",
      }),
    });
    const newApptData = await resNewAppt.json();

    const res40 = await fetch(`${baseUrl}/appointments/${newApptData.id}/reschedule`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        appointmentDate: leaveDate, // 2026-11-25 is configured as leave in Test 17!
        startTime: "09:00",
        endTime: "09:30",
        reason: "Attempting to move to doctor's leave date",
      }),
    });
    record(
      testId++,
      "SCHEDULING",
      "Reject Rescheduling onto Doctor Leave Date",
      res40.status === 400,
      `HTTP ${res40.status}, reschedule onto leave date strictly rejected`
    );

    // Test 41: Rescheduling blocked when outside doctor's weekly working hours
    const res41 = await fetch(`${baseUrl}/appointments/${newApptData.id}/reschedule`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        appointmentDate: apptDateStr,
        startTime: "23:00", // Midnight!
        endTime: "23:30",
        reason: "Moving to night hours",
      }),
    });
    record(
      testId++,
      "SCHEDULING",
      "Reject Rescheduling Outside Doctor Working Hours",
      res41.status === 400,
      `HTTP ${res41.status}, reschedule outside working hours rejected`
    );

    // Test 42: Client-supplied hospitalId cannot override authenticated tenant in department creation
    const res42 = await fetch(`${baseUrl}/departments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`, // Apex Admin
      },
      body: JSON.stringify({
        hospitalId: hospCity.id, // Forged hospital ID for CityCare!
        code: `FORGE_${Date.now().toString().slice(-4)}`,
        name: "Forged Hospital Dept",
      }),
    });
    const data42 = await res42.json();
    record(
      testId++,
      "DEPARTMENT",
      "Prevent Client-Supplied hospitalId From Overriding Tenant Context",
      res42.status === 403 || (res42.status === 201 && data42.hospitalId === hospApex.id),
      `HTTP ${res42.status}, client-supplied hospitalId cannot override authenticated tenant`
    );

    // Test 43: Patient-Level Concurrent Booking Race Condition (Same Patient, Two Different Doctors, Overlapping Times)
    const patientUniqueNum = Date.now().toString().slice(-5);
    const resTestPatient = await fetch(`${baseUrl}/patients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        firstName: "Concurrent",
        lastName: `Patient${patientUniqueNum}`,
        email: `patient.concurrent.${patientUniqueNum}@apexhealth.org`,
        dateOfBirth: "1994-06-20",
        gender: Gender.FEMALE,
        phone: `+91-98765${patientUniqueNum}`,
        bloodGroup: "B+",
        emergencyContactName: "Emergency Contact",
        emergencyContactPhone: "+91-9876500000",
        address: {
          street: "789 Concurrency Court",
          city: "Noida",
          state: "Uttar Pradesh",
          postalCode: "201301",
        },
      }),
    });
    const testPatientData = await resTestPatient.json();

    // Create Doctor 1 in Apex
    const resDoc1 = await fetch(`${baseUrl}/doctors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        firstName: "Kavita",
        lastName: `Doc1-${patientUniqueNum}`,
        email: `dr.kavita.${patientUniqueNum}@apexhealth.org`,
        password: "DemoPassword@123",
        phone: `+91-91111${patientUniqueNum}`,
        departmentId: createdDeptId,
        licenseNumber: `MCI-KV1-${patientUniqueNum}`,
        specialization: "General Medicine",
        consultationFee: 1100,
      }),
    });
    const doc1Data = await resDoc1.json();

    // Create Doctor 2 in Apex
    const resDoc2 = await fetch(`${baseUrl}/doctors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        firstName: "Rajesh",
        lastName: `Doc2-${patientUniqueNum}`,
        email: `dr.rajesh.${patientUniqueNum}@apexhealth.org`,
        password: "DemoPassword@123",
        phone: `+91-92222${patientUniqueNum}`,
        departmentId: createdDeptId,
        licenseNumber: `MCI-RJ2-${patientUniqueNum}`,
        specialization: "Pediatrics",
        consultationFee: 1300,
      }),
    });
    const doc2Data = await resDoc2.json();

    // Configure weekly availability for both doctors on Monday (dayOfWeek: 1) from 15:00 to 18:00
    await fetch(`${baseUrl}/scheduling/doctors/${doc1Data.id}/availability`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        slots: [{ dayOfWeek: 1, startTime: "15:00", endTime: "18:00", slotDurationMinutes: 30 }],
      }),
    });

    await fetch(`${baseUrl}/scheduling/doctors/${doc2Data.id}/availability`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenApexAdmin}`,
      },
      body: JSON.stringify({
        slots: [{ dayOfWeek: 1, startTime: "15:00", endTime: "18:00", slotDurationMinutes: 30 }],
      }),
    });

    // Fire two simultaneous overlapping appointment requests for the SAME patient with DIFFERENT doctors
    const [patientConcurrentRes1, patientConcurrentRes2] = await Promise.all([
      fetch(`${baseUrl}/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexAdmin}`,
        },
        body: JSON.stringify({
          patientId: testPatientData.id,
          doctorId: doc1Data.id,
          departmentId: createdDeptId,
          appointmentDate: apptDateStr,
          startTime: "15:00",
          endTime: "15:30",
          reason: "Simultaneous booking with Doctor 1",
        }),
      }),
      fetch(`${baseUrl}/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenApexAdmin}`,
        },
        body: JSON.stringify({
          patientId: testPatientData.id,
          doctorId: doc2Data.id,
          departmentId: createdDeptId,
          appointmentDate: apptDateStr,
          startTime: "15:15", // OVERLAPS 15:00-15:30!
          endTime: "15:45",
          reason: "Simultaneous booking with Doctor 2",
        }),
      }),
    ]);

    const patientStatuses = [patientConcurrentRes1.status, patientConcurrentRes2.status].sort();
    const exactlyOneConflict = patientStatuses[0] === 201 && patientStatuses[1] === 409;

    // Verify in database that only 1 conflicting appointment was persisted
    const dbAppts = await prisma.appointment.findMany({
      where: {
        patientId: testPatientData.id,
        appointmentDate: new Date(`${apptDateStr}T00:00:00.000Z`),
        deletedAt: null,
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
      },
    });
    const exactlyOneInDb = dbAppts.length === 1;

    record(
      testId++,
      "APPOINTMENT",
      "Patient-Level Concurrent Booking Race Condition (Advisory Lock Serialization)",
      exactlyOneConflict && exactlyOneInDb,
      `Responses: [${patientConcurrentRes1.status}, ${patientConcurrentRes2.status}], DB Active Appts: ${dbAppts.length} -> Exactly one 201 and one 409, 1 record in DB`
    );


  } catch (err: any) {
    console.error("❌ Unexpected test exception:", err);
  } finally {
    await app.close();
  }

  // Summary Report
  console.log("\n==========================================================================");
  console.log("📊 PHASE 4 TEST RESULTS SUMMARY");
  console.log("==========================================================================");

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`Total Phase 4 Tests: ${totalCount}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${totalCount - passedCount}`);

  if (passedCount === totalCount && totalCount >= 35) {
    console.log("\n🎉 ALL PHASE 4 INTEGRATION TESTS PASSED PERFECTLY!\n");
  } else {
    console.log("\n⚠️ SOME PHASE 4 TESTS FAILED. PLEASE REVIEW LOGS ABOVE.\n");
    process.exit(1);
  }
}

runPhase4Tests().catch((e) => {
  console.error("Fatal test runner error:", e);
  process.exit(1);
});
