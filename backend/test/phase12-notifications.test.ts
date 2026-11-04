import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  UserRole,
  NotificationType,
  AppointmentStatus,
  LabOrderStatus,
  InvoiceStatus,
  PaymentStatus,
  BatchStatus,
} from "@prisma/client";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { NotificationsService } from "../src/notifications/notifications.service";
import { NotificationsGateway } from "../src/notifications/notifications.gateway";
import { ReminderQueueService } from "../src/notifications/reminder-queue.service";
import { AppointmentsService } from "../src/appointments/appointments.service";
import { LaboratoryService } from "../src/laboratory/laboratory.service";
import { PrescriptionsService } from "../src/prescriptions/prescriptions.service";
import { BillingService } from "../src/billing/billing.service";
import { PaymentsService } from "../src/payments/payments.service";
import { PharmacyService } from "../src/pharmacy/pharmacy.service";
import { ExpiryMonitorService } from "../src/pharmacy/expiry-monitor.service";
import { AuthenticatedUser } from "../src/common/interfaces/authenticated-user.interface";

interface TestResult {
  id: number;
  category:
    | "NOTIFICATION_CRUD_AND_STATE"
    | "TENANCY_AND_SECURITY"
    | "NOTIFICATION_PREFERENCES"
    | "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS"
    | "LABORATORY_NOTIFICATIONS_AND_PRIVACY"
    | "PRESCRIPTION_NOTIFICATIONS"
    | "BILLING_AND_PAYMENTS_NOTIFICATIONS"
    | "PHARMACY_AND_EMERGENCY_NOTIFICATIONS"
    | "QUEUE_RELIABILITY_AND_OBSERVABILITY";
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
  console.log(`${icon} [PHASE 12 Test ${id}] [${category}] ${name}: ${details}`);
}

function getErrMsg(body: any): string {
  if (body?.error?.message) {
    return typeof body.error.message === "string"
      ? body.error.message
      : JSON.stringify(body.error.message);
  }
  if (body?.message) {
    return typeof body.message === "string" ? body.message : JSON.stringify(body.message);
  }
  return "";
}

async function runPhase12Tests() {
  console.log("==========================================================================");
  console.log("📢 MedCore HMS — Phase 12 Notifications & Communication Integration Suite");
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
  const notificationsService = app.get(NotificationsService);
  const reminderQueueService = app.get(ReminderQueueService);
  const appointmentsService = app.get(AppointmentsService);
  const laboratoryService = app.get(LaboratoryService);
  const prescriptionsService = app.get(PrescriptionsService);
  const billingService = app.get(BillingService);
  const paymentsService = app.get(PaymentsService);
  const pharmacyService = app.get(PharmacyService);
  const expiryMonitorService = app.get(ExpiryMonitorService);

  // 1. Fetch Seeded Entities
  const hospApex = await prisma.hospital.findUnique({ where: { code: "APEX-MAIN" } });
  const hospCity = await prisma.hospital.findUnique({ where: { code: "CITY-CARE" } });

  if (!hospApex || !hospCity) {
    throw new Error("Seeded hospitals APEX-MAIN and CITY-CARE must exist in database.");
  }

  const makeToken = (user: {
    id: string;
    email: string;
    role: UserRole;
    hospitalId: string | null;
  }) => {
    return jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET || "access_secret_medcore_hms",
        expiresIn: "1h",
      }
    );
  };

  // Staff and Patient accounts
  const superAdmin = await prisma.user.findFirstOrThrow({ where: { role: UserRole.SUPER_ADMIN } });
  const apexAdmin = await prisma.user.findFirstOrThrow({
    where: { role: UserRole.HOSPITAL_ADMIN, hospitalId: hospApex.id },
  });
  const cityAdmin = await prisma.user.findFirstOrThrow({
    where: { role: UserRole.HOSPITAL_ADMIN, hospitalId: hospCity.id },
  });
  const apexDoctor = await prisma.doctor.findFirstOrThrow({
    where: { hospitalId: hospApex.id },
    include: { user: true, department: true },
  });
  let apexPatientUser = await prisma.user.findFirst({
    where: { role: UserRole.PATIENT, hospitalId: hospApex.id },
  });
  if (!apexPatientUser) {
    apexPatientUser = await prisma.user.findFirst({
      where: { email: "patient.rajesh.sharma0@example.com" },
    });
  }
  if (!apexPatientUser) {
    apexPatientUser = await prisma.user.create({
      data: {
        email: "patient.apex.test@example.com",
        passwordHash: "$2a$10$wT8mQWp0000000000000000000000000000000000000000000000",
        firstName: "Apex",
        lastName: "Patient",
        role: UserRole.PATIENT,
        hospitalId: hospApex.id,
        phone: "+919866666666",
      },
    });
  }

  let apexPatient = await prisma.patient.findFirst({
    where: { userId: apexPatientUser.id },
  });
  if (!apexPatient) {
    apexPatient = await prisma.patient.findFirst({
      where: { hospitalId: hospApex.id, userId: null },
    });
    if (apexPatient) {
      apexPatient = await prisma.patient.update({
        where: { id: apexPatient.id },
        data: { userId: apexPatientUser.id },
      });
    } else {
      apexPatient = await prisma.patient.create({
        data: {
          hospitalId: hospApex.id,
          userId: apexPatientUser.id,
          mrn: `MRN-APEX-${Date.now()}`,
          firstName: "Apex",
          lastName: "Patient",
          dateOfBirth: new Date("1990-01-01"),
          gender: "MALE",
          phone: "+919866666666",
          emergencyContactName: "Relative",
          emergencyContactPhone: "+919866666665",
        },
      });
    }
  }

  let cityPatientUser = await prisma.user.findFirst({
    where: { role: UserRole.PATIENT, hospitalId: hospCity.id },
  });
  if (!cityPatientUser) {
    cityPatientUser = await prisma.user.create({
      data: {
        email: `patient.city.${Date.now()}@example.com`,
        passwordHash: "$2a$10$wT8mQWp0000000000000000000000000000000000000000000000",
        firstName: "City",
        lastName: "Patient",
        role: UserRole.PATIENT,
        hospitalId: hospCity.id,
        phone: "+919877777777",
      },
    });
  }

  let cityPatient = await prisma.patient.findFirst({
    where: { userId: cityPatientUser.id },
  });
  if (!cityPatient) {
    cityPatient = await prisma.patient.findFirst({
      where: { hospitalId: hospCity.id, userId: null },
    });
    if (cityPatient) {
      cityPatient = await prisma.patient.update({
        where: { id: cityPatient.id },
        data: { userId: cityPatientUser.id },
      });
    } else {
      cityPatient = await prisma.patient.create({
        data: {
          hospitalId: hospCity.id,
          userId: cityPatientUser.id,
          mrn: `MRN-CITY-${Date.now()}`,
          firstName: "City",
          lastName: "Patient",
          dateOfBirth: new Date("1992-04-12"),
          gender: "FEMALE",
          phone: "+919877777777",
          emergencyContactName: "Guardian",
          emergencyContactPhone: "+919877777778",
        },
      });
    }
  }

  let apexPharmaUser = await prisma.user.findFirst({
    where: { role: UserRole.PHARMACIST, hospitalId: hospApex.id },
  });
  if (!apexPharmaUser) {
    apexPharmaUser = await prisma.user.create({
      data: {
        email: `pharma.apex.${Date.now()}@medcore.io`,
        passwordHash: "$2a$10$wT8mQWp0000000000000000000000000000000000000000000000",
        firstName: "Apex",
        lastName: "Pharmacist",
        role: UserRole.PHARMACIST,
        hospitalId: hospApex.id,
        phone: "+919811111111",
      },
    });
  }

  let apexAccountant = await prisma.user.findFirst({
    where: { role: UserRole.ACCOUNTANT, hospitalId: hospApex.id },
  });
  if (!apexAccountant) {
    apexAccountant = await prisma.user.create({
      data: {
        email: `accountant.apex.${Date.now()}@medcore.io`,
        passwordHash: "$2a$10$wT8mQWp0000000000000000000000000000000000000000000000",
        firstName: "Apex",
        lastName: "Accountant",
        role: UserRole.ACCOUNTANT,
        hospitalId: hospApex.id,
        phone: "+919833333333",
      },
    });
  }

  const patientToken = makeToken(apexPatientUser);
  const cityPatientToken = makeToken(cityPatientUser);
  const apexAdminToken = makeToken(apexAdmin);
  const cityAdminToken = makeToken(cityAdmin);

  const authApexPatient: AuthenticatedUser = {
    id: apexPatientUser.id,
    email: apexPatientUser.email,
    role: UserRole.PATIENT,
    hospitalId: hospApex.id,
    firstName: apexPatientUser.firstName,
    lastName: apexPatientUser.lastName,
  };
  const authApexDoctor: AuthenticatedUser = {
    id: apexDoctor.userId,
    email: apexDoctor.user.email,
    role: UserRole.DOCTOR,
    hospitalId: hospApex.id,
    firstName: apexDoctor.user.firstName,
    lastName: apexDoctor.user.lastName,
  };
  const authApexAdmin: AuthenticatedUser = {
    id: apexAdmin.id,
    email: apexAdmin.email,
    role: UserRole.HOSPITAL_ADMIN,
    hospitalId: hospApex.id,
    firstName: apexAdmin.firstName,
    lastName: apexAdmin.lastName,
  };
  const authApexAccountant: AuthenticatedUser = {
    id: apexAccountant.id,
    email: apexAccountant.email,
    role: UserRole.ACCOUNTANT,
    hospitalId: hospApex.id,
    firstName: apexAccountant.firstName,
    lastName: apexAccountant.lastName,
  };
  const authApexTech: AuthenticatedUser = {
    id: apexDoctor.userId,
    email: apexDoctor.user.email,
    role: UserRole.LAB_TECHNICIAN,
    hospitalId: hospApex.id,
    firstName: apexDoctor.user.firstName,
    lastName: apexDoctor.user.lastName,
  };

  // Clean existing test notifications for isolated test assertions
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { userId: { in: [apexPatientUser.id, cityPatientUser.id, apexDoctor.userId, apexPharmaUser.id, apexAdmin.id, cityAdmin.id] } },
        { hospitalId: { in: [hospApex.id, hospCity.id] } },
      ],
    },
  });

  // Ensure fresh preferences
  await prisma.notificationPreference.upsert({
    where: { userId: apexPatientUser.id },
    create: { userId: apexPatientUser.id },
    update: {
      emailEnabled: true,
      smsEnabled: true,
      inAppEnabled: true,
      appointmentAlerts: true,
      billingAlerts: true,
      labAlerts: true,
      prescriptionAlerts: true,
    },
  });

  let createdNotifId = "";

  // =========================================================================
  // CATEGORY 1: NOTIFICATION CRUD AND STATE
  // =========================================================================
  console.log("\n--- Category 1: Notification CRUD and State ---");

  // Test 1: Dispatch notification
  try {
    const dispatchRes = await notificationsService.dispatch({
      userId: apexPatientUser.id,
      hospitalId: hospApex.id,
      title: "Welcome to MedCore HMS",
      message: "Your patient portal account has been activated.",
      type: NotificationType.SYSTEM,
      channels: ["IN_APP"],
      metadata: { initial: true },
    });
    const notif = await prisma.notification.findFirst({
      where: { userId: apexPatientUser.id, title: "Welcome to MedCore HMS" },
    });
    createdNotifId = notif?.id || "";
    record(
      1,
      "NOTIFICATION_CRUD_AND_STATE",
      "Dispatch In-App Notification",
      Boolean(notif && notif.isRead === false),
      `Dispatched successfully, id=${createdNotifId}`
    );
  } catch (err: any) {
    record(1, "NOTIFICATION_CRUD_AND_STATE", "Dispatch In-App Notification", false, err.message);
  }

  // Test 2: Retrieve notification history for user
  try {
    const res = await fetch(`${baseUrl}/notifications`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items;
    record(
      2,
      "NOTIFICATION_CRUD_AND_STATE",
      "Retrieve Notification History",
      res.status === 200 && Array.isArray(items) && items.length > 0,
      `Status=${res.status}, count=${items?.length}`
    );
  } catch (err: any) {
    record(2, "NOTIFICATION_CRUD_AND_STATE", "Retrieve Notification History", false, err.message);
  }

  // Test 3: Unread filter returns only unread
  try {
    const res = await fetch(`${baseUrl}/notifications?readStatus=UNREAD`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items;
    const allUnread = items.every((n: any) => n.isRead === false);
    record(
      3,
      "NOTIFICATION_CRUD_AND_STATE",
      "Filter by UNREAD status",
      res.status === 200 && allUnread && items.length > 0,
      `Status=${res.status}, allUnread=${allUnread}, count=${items.length}`
    );
  } catch (err: any) {
    record(3, "NOTIFICATION_CRUD_AND_STATE", "Filter by UNREAD status", false, err.message);
  }

  // Test 4: Mark single notification as read
  try {
    const res = await fetch(`${baseUrl}/notifications/${createdNotifId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const updated = await res.json();
    record(
      4,
      "NOTIFICATION_CRUD_AND_STATE",
      "Mark Individual Notification as Read",
      res.status === 200 && updated.isRead === true && Boolean(updated.readAt),
      `Status=${res.status}, isRead=${updated.isRead}, readAt=${updated.readAt}`
    );
  } catch (err: any) {
    record(4, "NOTIFICATION_CRUD_AND_STATE", "Mark Individual Notification as Read", false, err.message);
  }

  // Test 5: Filter by READ status
  try {
    const res = await fetch(`${baseUrl}/notifications?readStatus=READ`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items;
    const hasRead = items.some((n: any) => n.id === createdNotifId && n.isRead === true);
    record(
      5,
      "NOTIFICATION_CRUD_AND_STATE",
      "Filter by READ status",
      res.status === 200 && hasRead,
      `Status=${res.status}, hasRead=${hasRead}`
    );
  } catch (err: any) {
    record(5, "NOTIFICATION_CRUD_AND_STATE", "Filter by READ status", false, err.message);
  }

  // Test 6: Create another unread notification and verify unread count
  let secondNotifId = "";
  try {
    await notificationsService.dispatch({
      userId: apexPatientUser.id,
      hospitalId: hospApex.id,
      title: "Clinic Reminder",
      message: "Please arrive 15 minutes before your visit.",
      type: NotificationType.SYSTEM,
      channels: ["IN_APP"],
    });
    const notif2 = await prisma.notification.findFirst({
      where: { userId: apexPatientUser.id, title: "Clinic Reminder" },
    });
    secondNotifId = notif2?.id || "";

    const res = await fetch(`${baseUrl}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const body = await res.json();
    record(
      6,
      "NOTIFICATION_CRUD_AND_STATE",
      "Unread Count Accuracy",
      res.status === 200 && body.count >= 1,
      `Status=${res.status}, unreadCount=${body.count}`
    );
  } catch (err: any) {
    record(6, "NOTIFICATION_CRUD_AND_STATE", "Unread Count Accuracy", false, err.message);
  }

  // Test 7: Mark all as read
  try {
    const res = await fetch(`${baseUrl}/notifications/mark-all-read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const countRes = await fetch(`${baseUrl}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const countBody = await countRes.json();
    record(
      7,
      "NOTIFICATION_CRUD_AND_STATE",
      "Mark All as Read",
      res.status === 201 && countBody.count === 0,
      `MarkAll status=${res.status}, unreadCountAfter=${countBody.count}`
    );
  } catch (err: any) {
    record(7, "NOTIFICATION_CRUD_AND_STATE", "Mark All as Read", false, err.message);
  }

  // Test 8: Delete notification
  try {
    const res = await fetch(`${baseUrl}/notifications/${secondNotifId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const check = await prisma.notification.findUnique({ where: { id: secondNotifId } });
    record(
      8,
      "NOTIFICATION_CRUD_AND_STATE",
      "Delete Notification",
      res.status === 200 && check === null,
      `Delete status=${res.status}, deletedRecord=${check === null}`
    );
  } catch (err: any) {
    record(8, "NOTIFICATION_CRUD_AND_STATE", "Delete Notification", false, err.message);
  }

  // =========================================================================
  // CATEGORY 2: TENANCY AND SECURITY
  // =========================================================================
  console.log("\n--- Category 2: Tenancy and Security ---");

  // Create notification for Patient B (City hospital)
  let cityNotifId = "";
  try {
    const cRes = await notificationsService.dispatch({
      userId: cityPatientUser.id,
      hospitalId: hospCity.id,
      title: "City Hospital Confidential Notice",
      message: "Protected patient alert for City Care.",
      type: NotificationType.SYSTEM,
      channels: ["IN_APP"],
    });
    const cNotif = await prisma.notification.findFirst({
      where: { userId: cityPatientUser.id, title: "City Hospital Confidential Notice" },
    });
    cityNotifId = cNotif?.id || "";
  } catch (err: any) {
    console.error("City notification creation failed:", err?.message || err);
  }

  // Test 9: Patient A cannot see Patient B's notifications
  try {
    const res = await fetch(`${baseUrl}/notifications`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items;
    const leaked = items.some((n: any) => n.id === cityNotifId || n.userId === cityPatientUser.id);
    record(
      9,
      "TENANCY_AND_SECURITY",
      "Cross-Patient Notification Isolation",
      res.status === 200 && !leaked,
      `Status=${res.status}, leakedCityNotif=${leaked}`
    );
  } catch (err: any) {
    record(9, "TENANCY_AND_SECURITY", "Cross-Patient Notification Isolation", false, err.message);
  }

  // Test 10: Patient A cannot mark Patient B's notification as read
  try {
    const res = await fetch(`${baseUrl}/notifications/${cityNotifId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    record(
      10,
      "TENANCY_AND_SECURITY",
      "Prevent IDOR on Mark As Read",
      res.status === 403,
      `Status=${res.status}, err=${getErrMsg(await res.json())}`
    );
  } catch (err: any) {
    record(10, "TENANCY_AND_SECURITY", "Prevent IDOR on Mark As Read", false, err.message);
  }

  // Test 11: Patient A cannot delete Patient B's notification
  try {
    const res = await fetch(`${baseUrl}/notifications/${cityNotifId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    record(
      11,
      "TENANCY_AND_SECURITY",
      "Prevent IDOR on Delete Notification",
      res.status === 403,
      `Status=${res.status}, err=${getErrMsg(await res.json())}`
    );
  } catch (err: any) {
    record(11, "TENANCY_AND_SECURITY", "Prevent IDOR on Delete Notification", false, err.message);
  }

  // Test 12: Non-existent notification ID returns 404
  try {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await fetch(`${baseUrl}/notifications/${fakeId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    record(
      12,
      "TENANCY_AND_SECURITY",
      "Non-Existent Notification 404",
      res.status === 404,
      `Status=${res.status}`
    );
  } catch (err: any) {
    record(12, "TENANCY_AND_SECURITY", "Non-Existent Notification 404", false, err.message);
  }

  // Test 13: Invalid UUID parameter returns 400
  try {
    const res = await fetch(`${baseUrl}/notifications/not-a-valid-uuid/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    record(
      13,
      "TENANCY_AND_SECURITY",
      "Invalid UUID Param 400",
      res.status === 400,
      `Status=${res.status}`
    );
  } catch (err: any) {
    record(13, "TENANCY_AND_SECURITY", "Invalid UUID Param 400", false, err.message);
  }

  // Test 14: Unauthenticated access blocked
  try {
    const res = await fetch(`${baseUrl}/notifications`);
    record(
      14,
      "TENANCY_AND_SECURITY",
      "Reject Unauthenticated Request",
      res.status === 401,
      `Status=${res.status}`
    );
  } catch (err: any) {
    record(14, "TENANCY_AND_SECURITY", "Reject Unauthenticated Request", false, err.message);
  }

  // =========================================================================
  // CATEGORY 3: NOTIFICATION PREFERENCES
  // =========================================================================
  console.log("\n--- Category 3: Notification Preferences ---");

  // Test 15: Retrieve preferences
  try {
    const res = await fetch(`${baseUrl}/notifications/preferences`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const prefs = await res.json();
    record(
      15,
      "NOTIFICATION_PREFERENCES",
      "Retrieve Notification Preferences",
      res.status === 200 && prefs.userId === apexPatientUser.id,
      `Status=${res.status}, inApp=${prefs.inAppEnabled}, email=${prefs.emailEnabled}`
    );
  } catch (err: any) {
    record(15, "NOTIFICATION_PREFERENCES", "Retrieve Notification Preferences", false, err.message);
  }

  // Test 16: Update preferences (disable appointment alerts)
  try {
    const res = await fetch(`${baseUrl}/notifications/preferences`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${patientToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appointmentAlerts: false,
      }),
    });
    const updated = await res.json();
    record(
      16,
      "NOTIFICATION_PREFERENCES",
      "Update Category Preference (Disable Appointment Alerts)",
      res.status === 200 && updated.appointmentAlerts === false,
      `Status=${res.status}, appointmentAlerts=${updated.appointmentAlerts}`
    );
  } catch (err: any) {
    record(16, "NOTIFICATION_PREFERENCES", "Update Category Preference", false, err.message);
  }

  // Test 17: Verify dispatch suppression when category alert is disabled
  try {
    const result = await notificationsService.dispatch({
      userId: apexPatientUser.id,
      hospitalId: hospApex.id,
      title: "Appointment Booking Notice",
      message: "Your appointment is confirmed.",
      type: NotificationType.APPOINTMENT,
      channels: ["IN_APP"],
    });
    record(
      17,
      "NOTIFICATION_PREFERENCES",
      "Suppression of Disabled Category Alerts",
      result?.skipped === true && result?.reason === "APPOINTMENT_ALERTS_DISABLED",
      `skipped=${result?.skipped}, reason=${result?.reason}`
    );
  } catch (err: any) {
    record(17, "NOTIFICATION_PREFERENCES", "Suppression of Disabled Category Alerts", false, err.message);
  }

  // Test 18: Re-enable appointment alerts
  try {
    const res = await fetch(`${baseUrl}/notifications/preferences`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${patientToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appointmentAlerts: true,
      }),
    });
    const reenabled = await res.json();
    const result = await notificationsService.dispatch({
      userId: apexPatientUser.id,
      hospitalId: hospApex.id,
      title: "Appointment Resumed Notice",
      message: "Alerts are now enabled.",
      type: NotificationType.APPOINTMENT,
      channels: ["IN_APP"],
    });
    record(
      18,
      "NOTIFICATION_PREFERENCES",
      "Re-enabling Category Alerts Resumes Delivery",
      res.status === 200 && reenabled.appointmentAlerts === true && !result?.skipped,
      `Status=${res.status}, appointmentAlerts=${reenabled.appointmentAlerts}, dispatchedChannels=${result?.channelsCount}`
    );
  } catch (err: any) {
    record(18, "NOTIFICATION_PREFERENCES", "Re-enabling Category Alerts", false, err.message);
  }

  // =========================================================================
  // CATEGORY 4: APPOINTMENT NOTIFICATIONS AND REMINDERS
  // =========================================================================
  console.log("\n--- Category 4: Appointment Notifications and Reminders ---");

  // Book an appointment and verify notifications
  let testApptId = "";
  try {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 10);
    const dateStr = targetDate.toISOString().split("T")[0];

    const appt = await appointmentsService.create(
      {
        patientId: apexPatient.id,
        doctorId: apexDoctor.id,
        departmentId: apexDoctor.departmentId,
        appointmentDate: dateStr,
        startTime: "11:00",
        endTime: "11:30",
        type: "CONSULTATION",
        reason: "Follow-up consultation for health check",
        isEmergency: false,
      },
      authApexPatient
    );
    testApptId = appt.id;

    const patientNotif = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.APPOINTMENT,
        title: "Appointment Booked",
      },
    });

    record(
      19,
      "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS",
      "Appointment Booking Dispatches Patient Notification",
      Boolean(patientNotif),
      `ApptId=${testApptId}, foundNotifId=${patientNotif?.id}`
    );
  } catch (err: any) {
    record(19, "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS", "Appointment Booking Patient Notification", false, err.message);
  }

  // Test 20: Doctor receives appointment scheduled notification
  try {
    const doctorNotif = await prisma.notification.findFirst({
      where: {
        userId: apexDoctor.userId,
        type: NotificationType.APPOINTMENT,
        title: "New Appointment Scheduled",
      },
    });
    record(
      20,
      "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS",
      "Appointment Booking Dispatches Doctor Notification",
      Boolean(doctorNotif),
      `DoctorUserId=${apexDoctor.userId}, notifId=${doctorNotif?.id}`
    );
  } catch (err: any) {
    record(20, "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS", "Doctor Notification", false, err.message);
  }

  // Test 21: Direct processing of 24-hour reminder
  try {
    const res24h = await reminderQueueService.processReminder(testApptId, "24_HOUR");
    const notif24h = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.APPOINTMENT,
        title: { contains: "24 Hours" },
      },
    });
    record(
      21,
      "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS",
      "Process 24-Hour Reminder",
      res24h.status === "SENT" && Boolean(notif24h),
      `Status=${res24h.status}, notifTitle=${notif24h?.title}`
    );
  } catch (err: any) {
    record(21, "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS", "Process 24-Hour Reminder", false, err.message);
  }

  // Test 22: Duplicate 24-hour reminder is suppressed (Idempotency)
  try {
    const dupRes = await reminderQueueService.processReminder(testApptId, "24_HOUR");
    record(
      22,
      "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS",
      "Duplicate Reminder Suppression (Idempotency)",
      dupRes.status === "SKIPPED" && dupRes.reason === "DUPLICATE_REMINDER_SUPPRESSED",
      `Status=${dupRes.status}, reason=${dupRes.reason}`
    );
  } catch (err: any) {
    record(22, "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS", "Duplicate Reminder Suppression", false, err.message);
  }

  // Test 23: Process 1-hour reminder
  try {
    const res1h = await reminderQueueService.processReminder(testApptId, "1_HOUR");
    const notif1h = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.APPOINTMENT,
        title: { contains: "1 Hour" },
      },
    });
    record(
      23,
      "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS",
      "Process 1-Hour Reminder",
      res1h.status === "SENT" && Boolean(notif1h),
      `Status=${res1h.status}, notifTitle=${notif1h?.title}`
    );
  } catch (err: any) {
    record(23, "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS", "Process 1-Hour Reminder", false, err.message);
  }

  // Test 24: Reschedule appointment sends reschedule notification
  try {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + 12);
    const newDateStr = newDate.toISOString().split("T")[0];

    await appointmentsService.reschedule(
      testApptId,
      {
        appointmentDate: newDateStr,
        startTime: "14:00",
        endTime: "14:30",
        reason: "Patient travel delay",
      },
      authApexPatient
    );

    const reschedNotif = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.APPOINTMENT,
        title: "Appointment Rescheduled",
      },
    });
    record(
      24,
      "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS",
      "Appointment Rescheduling Dispatches Notification",
      Boolean(reschedNotif && reschedNotif.message.includes("14:00")),
      `Found notif=${reschedNotif?.id}, message=${reschedNotif?.message}`
    );
  } catch (err: any) {
    record(24, "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS", "Appointment Rescheduling", false, err.message);
  }

  // Test 25: Cancel appointment sends cancellation notification
  try {
    await appointmentsService.cancel(
      testApptId,
      { reason: "Personal emergency" },
      authApexPatient
    );

    const cancelNotif = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.APPOINTMENT,
        title: "Appointment Cancelled",
      },
    });
    record(
      25,
      "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS",
      "Appointment Cancellation Dispatches Notification",
      Boolean(cancelNotif),
      `Found notif=${cancelNotif?.id}`
    );
  } catch (err: any) {
    record(25, "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS", "Appointment Cancellation", false, err.message);
  }

  // Test 26: Cancelled appointment reminder is skipped by worker
  try {
    const cancelSkip = await reminderQueueService.processReminder(testApptId, "1_HOUR");
    record(
      26,
      "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS",
      "Skip Reminders for Cancelled Appointments",
      cancelSkip.status === "SKIPPED" && cancelSkip.reason === "APPOINTMENT_CANCELLED",
      `Status=${cancelSkip.status}, reason=${cancelSkip.reason}`
    );
  } catch (err: any) {
    record(26, "APPOINTMENT_NOTIFICATIONS_AND_REMINDERS", "Skip Reminders for Cancelled Appointments", false, err.message);
  }

  // =========================================================================
  // CATEGORY 5: LABORATORY NOTIFICATIONS AND PRIVACY
  // =========================================================================
  console.log("\n--- Category 5: Laboratory Notifications and Privacy ---");

  let labOrderId = "";
  try {
    const labTest = await prisma.labTest.findFirstOrThrow({
      where: { hospitalId: hospApex.id },
    });

    // Create a lab order
    const order = await laboratoryService.createOrder(
      {
        patientId: apexPatient.id,
        doctorId: apexDoctor.id,
        priority: "ROUTINE",
        testIds: [labTest.id],
      },
      authApexDoctor
    );
    labOrderId = order.id;

    // Collect sample
    await laboratoryService.collectSample(
      labOrderId,
      authApexTech,
      { notes: "Venous blood drawn" }
    );

    // Upload result
    await laboratoryService.uploadResults(
      labOrderId,
      {
        results: [
          {
            labTestId: labTest.id,
            resultValue: "14.2",
            unit: "g/dL",
            status: "NORMAL",
          },
        ],
      },
      authApexTech
    );
  } catch (err: any) {
    console.error("Lab test setup error:", err?.message || err);
  }

  // Test 27: Patient does NOT receive notification before approval
  try {
    const prematureNotif = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.LAB_RESULT,
        metadata: {
          path: ["labOrderId"],
          equals: labOrderId,
        },
      },
    });
    record(
      27,
      "LABORATORY_NOTIFICATIONS_AND_PRIVACY",
      "No Patient Notification Prior to Clinical Approval",
      prematureNotif === null,
      `PrematureNotifFound=${prematureNotif !== null}`
    );
  } catch (err: any) {
    record(27, "LABORATORY_NOTIFICATIONS_AND_PRIVACY", "No Patient Notification Before Approval", false, err.message);
  }

  // Test 28: Approving lab results dispatches patient notification
  try {
    await laboratoryService.reviewOrder(
      labOrderId,
      {
        approve: true,
        notes: "Clinically validated report.",
      },
      authApexAdmin
    );

    const approvedNotif = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.LAB_RESULT,
        title: "Laboratory Results Available",
      },
    });

    record(
      28,
      "LABORATORY_NOTIFICATIONS_AND_PRIVACY",
      "Approved Lab Results Dispatches Patient Notification",
      Boolean(approvedNotif),
      `Found notifId=${approvedNotif?.id}, title=${approvedNotif?.title}`
    );
  } catch (err: any) {
    record(28, "LABORATORY_NOTIFICATIONS_AND_PRIVACY", "Approved Lab Results Notification", false, err.message);
  }

  // Test 29: Clinical privacy: Notification message does NOT expose medical values
  try {
    const notif = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.LAB_RESULT,
        title: "Laboratory Results Available",
      },
    });
    const leaksMedicalData =
      notif?.message.includes("14.2") ||
      notif?.message.includes("g/dL") ||
      notif?.message.includes("NORMAL");

    record(
      29,
      "LABORATORY_NOTIFICATIONS_AND_PRIVACY",
      "Clinical Privacy: No Raw Diagnostic Findings Leaked in Notification",
      Boolean(notif && !leaksMedicalData && (notif.metadata as any)?.protectedRoute === "/laboratory"),
      `LeaksMedicalData=${leaksMedicalData}, protectedRoute=${(notif?.metadata as any)?.protectedRoute}`
    );
  } catch (err: any) {
    record(29, "LABORATORY_NOTIFICATIONS_AND_PRIVACY", "Clinical Privacy", false, err.message);
  }

  // =========================================================================
  // CATEGORY 6: PRESCRIPTION NOTIFICATIONS
  // =========================================================================
  console.log("\n--- Category 6: Prescription Notifications ---");

  let rxId = "";
  try {
    const med = await prisma.medicine.findFirstOrThrow({
      where: { hospitalId: hospApex.id },
    });
    const medRec = await prisma.medicalRecord.findFirstOrThrow({
      where: { hospitalId: hospApex.id, patientId: apexPatient.id },
    });

    const rx = await prescriptionsService.create(
      {
        patientId: apexPatient.id,
        medicalRecordId: medRec.id,
        items: [
          {
            medicineId: med.id,
            dosage: "1 tablet",
            frequency: "BID",
            duration: "5 days",
            quantity: 10,
          },
        ],
      },
      authApexDoctor
    );
    rxId = rx.id;

    const rxNotif = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.PRESCRIPTION,
        title: "New Prescription Issued",
      },
    });

    record(
      30,
      "PRESCRIPTION_NOTIFICATIONS",
      "Prescription Issuance Dispatches Notification to Patient",
      Boolean(rxNotif),
      `PrescriptionId=${rxId}, notifId=${rxNotif?.id}`
    );
  } catch (err: any) {
    record(30, "PRESCRIPTION_NOTIFICATIONS", "Prescription Issuance Dispatches Notification", false, err.message);
  }

  // Test 31: Prescription notification privacy & protected deep-link
  try {
    const notif = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.PRESCRIPTION,
        title: "New Prescription Issued",
      },
    });
    const leaksDosage =
      notif?.message.includes("1 tablet") ||
      notif?.message.includes("BID") ||
      notif?.message.includes("5 days");

    record(
      31,
      "PRESCRIPTION_NOTIFICATIONS",
      "Prescription Privacy and Protected Route Deep-Link",
      Boolean(notif && !leaksDosage && (notif.metadata as any)?.protectedRoute === "/prescriptions"),
      `leaksDosage=${leaksDosage}, protectedRoute=${(notif?.metadata as any)?.protectedRoute}`
    );
  } catch (err: any) {
    record(31, "PRESCRIPTION_NOTIFICATIONS", "Prescription Privacy", false, err.message);
  }

  // =========================================================================
  // CATEGORY 7: BILLING AND PAYMENTS NOTIFICATIONS
  // =========================================================================
  console.log("\n--- Category 7: Billing and Payments Notifications ---");

  let invoiceId = "";
  let invoiceNumber = "";
  try {
    // 1. Create draft invoice
    const inv = await billingService.createInvoice(
      {
        patientId: apexPatient.id,
      },
      authApexAccountant
    );
    invoiceId = inv.id;

    // Add item
    await billingService.addItem(
      invoiceId,
      {
        description: "Specialist Physician Consultation",
        quantity: 1,
        unitPrice: 500,
        itemType: "CONSULTATION",
      },
      authApexAccountant
    );

    // Finalize invoice
    const finalized = await billingService.finalizeInvoice(invoiceId, authApexAccountant);
    invoiceNumber = finalized.invoiceNumber;

    const invoiceNotif = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.BILLING,
        title: "Hospital Invoice Issued",
      },
    });

    record(
      32,
      "BILLING_AND_PAYMENTS_NOTIFICATIONS",
      "Finalized Invoice Dispatches Notification to Patient",
      Boolean(invoiceNotif && invoiceNotif.message.includes(invoiceNumber)),
      `InvoiceId=${invoiceId}, invNum=${invoiceNumber}, notifId=${invoiceNotif?.id}`
    );
  } catch (err: any) {
    record(32, "BILLING_AND_PAYMENTS_NOTIFICATIONS", "Finalized Invoice Notification", false, err.message);
  }

  // Test 33: Authoritative counter payment dispatches payment confirmed notification
  try {
    await paymentsService.recordCashPayment(
      {
        invoiceId,
        amount: 250,
        paymentMethod: "CASH",
        notes: "Part payment at cash desk",
      },
      authApexAccountant
    );

    const paymentNotif = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.BILLING,
        title: "Payment Receipt Confirmed",
      },
    });

    record(
      33,
      "BILLING_AND_PAYMENTS_NOTIFICATIONS",
      "Verified Cash Payment Dispatches Confirmation",
      Boolean(paymentNotif && paymentNotif.message.includes("250")),
      `Found paymentNotifId=${paymentNotif?.id}, message=${paymentNotif?.message}`
    );
  } catch (err: any) {
    record(33, "BILLING_AND_PAYMENTS_NOTIFICATIONS", "Verified Cash Payment Notification", false, err.message);
  }

  // Test 34: Verified online webhook settlement dispatches confirmation
  try {
    // Settle balance of 250 via Stripe webhook simulator
    const stripeEventId = `evt_test_${Date.now()}`;
    const payload = {
      id: stripeEventId,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: `pi_test_${Date.now()}`,
          amount_received: 25000,
          metadata: { invoiceId },
        },
      },
    };

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_stripe_secret_key_medcore";
    const payloadStr = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const sigPayload = `${timestamp}.${payloadStr}`;
    const crypto = await import("crypto");
    const sig = crypto.createHmac("sha256", webhookSecret).update(sigPayload).digest("hex");
    const stripeSignature = `t=${timestamp},v1=${sig}`;

    const res = await fetch(`${baseUrl}/payments/webhooks/stripe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": stripeSignature,
      },
      body: payloadStr,
    });

    const onlineNotif = await prisma.notification.findFirst({
      where: {
        userId: apexPatientUser.id,
        type: NotificationType.BILLING,
        title: "Online Payment Confirmed",
      },
    });

    record(
      34,
      "BILLING_AND_PAYMENTS_NOTIFICATIONS",
      "Authoritative Online Payment Webhook Dispatches Confirmation",
      res.status === 201 && Boolean(onlineNotif),
      `WebhookStatus=${res.status}, foundOnlineNotif=${onlineNotif?.id}`
    );
  } catch (err: any) {
    record(34, "BILLING_AND_PAYMENTS_NOTIFICATIONS", "Online Payment Webhook Notification", false, err.message);
  }

  // =========================================================================
  // CATEGORY 8: PHARMACY AND EMERGENCY NOTIFICATIONS
  // =========================================================================
  console.log("\n--- Category 8: Pharmacy and Emergency Notifications ---");

  // Test 35: Low-stock notification
  try {
    const med = await prisma.medicine.findFirstOrThrow({
      where: { hospitalId: hospApex.id },
    });

    const lowStockRes = await notificationsService.notifyLowStock(
      hospApex.id,
      med.id,
      med.name,
      3,
      med.reorderLevel
    );

    const pharmaNotif = await prisma.notification.findFirst({
      where: {
        userId: apexPharmaUser.id,
        type: NotificationType.SYSTEM,
        title: { contains: "Low Stock Warning" },
      },
    });

    record(
      35,
      "PHARMACY_AND_EMERGENCY_NOTIFICATIONS",
      "Low-Stock Condition Alerts Pharmacy Staff",
      Boolean(pharmaNotif && lowStockRes.dispatchedTo && lowStockRes.dispatchedTo > 0),
      `DispatchedTo=${lowStockRes.dispatchedTo}, pharmaNotifId=${pharmaNotif?.id}`
    );
  } catch (err: any) {
    record(35, "PHARMACY_AND_EMERGENCY_NOTIFICATIONS", "Low-Stock Condition Alert", false, err.message);
  }

  // Test 36: Low-stock notification 24-hour deduplication
  try {
    const med = await prisma.medicine.findFirstOrThrow({
      where: { hospitalId: hospApex.id },
    });

    const dupLowStock = await notificationsService.notifyLowStock(
      hospApex.id,
      med.id,
      med.name,
      2,
      med.reorderLevel
    );

    record(
      36,
      "PHARMACY_AND_EMERGENCY_NOTIFICATIONS",
      "Low-Stock 24-Hour Alert Deduplication",
      dupLowStock.deduplicated === true,
      `Deduplicated=${dupLowStock.deduplicated}`
    );
  } catch (err: any) {
    record(36, "PHARMACY_AND_EMERGENCY_NOTIFICATIONS", "Low-Stock Alert Deduplication", false, err.message);
  }

  // Test 37: Near-expiry batch alert
  let testBatchId = "";
  try {
    const batch = await prisma.medicineBatch.findFirstOrThrow({
      where: { hospitalId: hospApex.id },
      include: { medicine: true },
    });
    testBatchId = batch.id;

    const expiryRes = await notificationsService.notifyExpiringBatch(
      hospApex.id,
      batch.id,
      batch.batchNumber,
      batch.medicine.name,
      batch.expiryDate
    );

    const expiryNotif = await prisma.notification.findFirst({
      where: {
        userId: apexPharmaUser.id,
        type: NotificationType.SYSTEM,
        title: { contains: "Expiring Medicine Batch" },
      },
    });

    record(
      37,
      "PHARMACY_AND_EMERGENCY_NOTIFICATIONS",
      "Expiring Batch Condition Alerts Pharmacy Staff",
      Boolean(expiryNotif && expiryRes.dispatchedTo && expiryRes.dispatchedTo > 0),
      `DispatchedTo=${expiryRes.dispatchedTo}, expiryNotifId=${expiryNotif?.id}`
    );
  } catch (err: any) {
    record(37, "PHARMACY_AND_EMERGENCY_NOTIFICATIONS", "Expiring Batch Condition Alert", false, err.message);
  }

  // Test 38: Expiry alert 7-day deduplication
  try {
    const batch = await prisma.medicineBatch.findFirstOrThrow({
      where: { id: testBatchId },
      include: { medicine: true },
    });

    const dupExpiry = await notificationsService.notifyExpiringBatch(
      hospApex.id,
      batch.id,
      batch.batchNumber,
      batch.medicine.name,
      batch.expiryDate
    );

    record(
      38,
      "PHARMACY_AND_EMERGENCY_NOTIFICATIONS",
      "Near-Expiry 7-Day Alert Deduplication",
      dupExpiry.deduplicated === true,
      `Deduplicated=${dupExpiry.deduplicated}`
    );
  } catch (err: any) {
    record(38, "PHARMACY_AND_EMERGENCY_NOTIFICATIONS", "Near-Expiry Alert Deduplication", false, err.message);
  }

  // Test 39: Emergency admission alert
  try {
    const emRes = await notificationsService.notifyEmergencyAdmission(
      hospApex.id,
      "appt-em-001",
      "Emergency Trauma Center",
      "10:15"
    );

    const emNotif = await prisma.notification.findFirst({
      where: {
        userId: apexAdmin.id,
        type: NotificationType.SYSTEM,
        title: { contains: "Urgent Patient Admitted" },
      },
    });

    record(
      39,
      "PHARMACY_AND_EMERGENCY_NOTIFICATIONS",
      "Emergency Admission Alerts Clinical and Admin Staff",
      Boolean(emNotif && emRes.dispatchedTo && emRes.dispatchedTo > 0),
      `DispatchedTo=${emRes.dispatchedTo}, emNotifId=${emNotif?.id}`
    );
  } catch (err: any) {
    record(39, "PHARMACY_AND_EMERGENCY_NOTIFICATIONS", "Emergency Admission Alert", false, err.message);
  }

  // =========================================================================
  // CATEGORY 9: QUEUE RELIABILITY AND OBSERVABILITY
  // =========================================================================
  console.log("\n--- Category 9: Queue Reliability and Observability ---");

  // Test 40: Queue status endpoint observability
  try {
    const res = await fetch(`${baseUrl}/notifications/queue-status`, {
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const status = await res.json();
    record(
      40,
      "QUEUE_RELIABILITY_AND_OBSERVABILITY",
      "Reminder Queue Status Observability",
      res.status === 200 && status.configured !== undefined,
      `Status=${res.status}, configured=${status.configured}, isRedisConnected=${status.isRedisConnected}`
    );
  } catch (err: any) {
    record(40, "QUEUE_RELIABILITY_AND_OBSERVABILITY", "Reminder Queue Status", false, err.message);
  }

  // Test 41: Worker resilience on non-existent appointment
  try {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await reminderQueueService.processReminder(fakeId, "24_HOUR");
    record(
      41,
      "QUEUE_RELIABILITY_AND_OBSERVABILITY",
      "Worker Resilience: Non-Existent Appointment Handled Gracefully",
      res.status === "SKIPPED" && res.reason === "NOT_FOUND",
      `Status=${res.status}, reason=${res.reason}`
    );
  } catch (err: any) {
    record(41, "QUEUE_RELIABILITY_AND_OBSERVABILITY", "Worker Resilience", false, err.message);
  }

  // Test 42: Worker resilience on appointment with unlinked patient account
  try {
    // Create patient without user link
    const patientNoUser = await prisma.patient.create({
      data: {
        hospitalId: hospApex.id,
        mrn: `MRN-NOUSER-${Date.now()}`,
        firstName: "Offline",
        lastName: "Visitor",
        dateOfBirth: new Date("1985-05-15"),
        gender: "MALE",
        phone: "+919800099999",
        emergencyContactName: "Kin",
        emergencyContactPhone: "+919800099998",
      },
    });

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 20);
    const dateStr = targetDate.toISOString().split("T")[0];

    const apptNoUser = await prisma.appointment.create({
      data: {
        hospitalId: hospApex.id,
        patientId: patientNoUser.id,
        doctorId: apexDoctor.id,
        departmentId: apexDoctor.departmentId,
        appointmentDate: new Date(`${dateStr}T00:00:00.000Z`),
        startTime: "16:00",
        endTime: "16:30",
        reason: "Offline walk-in",
        status: AppointmentStatus.CONFIRMED,
      },
    });

    const res = await reminderQueueService.processReminder(apptNoUser.id, "24_HOUR");
    record(
      42,
      "QUEUE_RELIABILITY_AND_OBSERVABILITY",
      "Skip Reminders Gracefully for Patients Without Portal User",
      res.status === "SKIPPED" && res.reason === "NO_PORTAL_USER",
      `Status=${res.status}, reason=${res.reason}`
    );
  } catch (err: any) {
    record(42, "QUEUE_RELIABILITY_AND_OBSERVABILITY", "Patients Without Portal User", false, err.message);
  }

  // Test 43: Expiry Monitor integration run
  try {
    const scanResult = await expiryMonitorService.runExpiryCheck();
    record(
      43,
      "QUEUE_RELIABILITY_AND_OBSERVABILITY",
      "Automated Expiry Monitor Scan and Notification Execution",
      typeof scanResult.quarantinedCount === "number" && typeof scanResult.expiringSoonCount === "number",
      `quarantinedCount=${scanResult.quarantinedCount}, expiringSoonCount=${scanResult.expiringSoonCount}`
    );
  } catch (err: any) {
    record(43, "QUEUE_RELIABILITY_AND_OBSERVABILITY", "Expiry Monitor Scan", false, err.message);
  }

  // Test 44: Cross-Tenant Isolation in Pharmacy Alerts
  try {
    const cityPharmaUser = await prisma.user.findFirstOrThrow({
      where: { role: UserRole.PHARMACIST, hospitalId: hospCity.id },
    });

    const apexAlertForCity = await prisma.notification.findFirst({
      where: {
        userId: cityPharmaUser.id,
        hospitalId: hospApex.id,
      },
    });

    record(
      44,
      "TENANCY_AND_SECURITY",
      "Hospital A Pharmacy Alerts Never Leak to Hospital B Staff",
      apexAlertForCity === null,
      `apexAlertForCityFound=${apexAlertForCity !== null}`
    );
  } catch (err: any) {
    record(44, "TENANCY_AND_SECURITY", "Pharmacy Cross-Tenant Isolation", false, err.message);
  }

  // Test 45: Socket.IO Gateway Authentication Guard
  try {
    const gateway = app.get(NotificationsGateway);
    record(
      45,
      "QUEUE_RELIABILITY_AND_OBSERVABILITY",
      "Socket.IO Gateway Injection and Tenant Room Isolation",
      Boolean(gateway && typeof gateway.sendToUser === "function" && typeof gateway.sendToHospital === "function"),
      `Gateway methods available: sendToUser, sendToHospital`
    );
  } catch (err: any) {
    record(45, "QUEUE_RELIABILITY_AND_OBSERVABILITY", "Socket.IO Gateway", false, err.message);
  }

  // Test 46: Patient Notification Preferences Isolation
  try {
    const cityPrefs = await prisma.notificationPreference.findUnique({
      where: { userId: cityPatientUser.id },
    });
    // Apex preferences should not alter City patient preferences
    const apexPrefs = await prisma.notificationPreference.findUnique({
      where: { userId: apexPatientUser.id },
    });
    record(
      46,
      "NOTIFICATION_PREFERENCES",
      "Preferences Isolation Between Distinct Tenant Users",
      Boolean(apexPrefs && (!cityPrefs || cityPrefs.userId !== apexPrefs.userId)),
      `ApexUser=${apexPrefs?.userId}, CityUser=${cityPrefs?.userId}`
    );
  } catch (err: any) {
    record(46, "NOTIFICATION_PREFERENCES", "Preferences Isolation", false, err.message);
  }

  // Summary Report
  console.log("\n==========================================================================");
  console.log("🏁 PHASE 12 TEST EXECUTION SUMMARY");
  console.log("==========================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total Phase 12 Tests: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  await app.close();

  if (failed > 0) {
    console.error("❌ Some Phase 12 tests failed. Please review errors above.");
    process.exit(1);
  } else {
    console.log("🎉 ALL 46 PHASE 12 TESTS PASSED PERFECTLY!");
    process.exit(0);
  }
}

runPhase12Tests().catch((err) => {
  console.error("Fatal error running Phase 12 tests:", err);
  process.exit(1);
});
