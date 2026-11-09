import {
  PrismaClient,
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

export const DEMO_CONFIG = {
  hospitalId: "hosp-demo-001",
  hospitalCode: "DEMO-MAIN",
  hospitalName: "MedCore Demo Hospital",
  password: "Demo@MedCore2026",
  accounts: {
    admin: "demo.admin@medcore.io",
    doctor: "demo.doctor@medcore.io",
    nurse: "demo.nurse@medcore.io",
    receptionist: "demo.receptionist@medcore.io",
    pharmacist: "demo.pharma@medcore.io",
    lab: "demo.lab@medcore.io",
    billing: "demo.billing@medcore.io",
  },
};

export interface DemoSeedLogger {
  log: (msg: string) => void;
  error: (msg: string, ...args: any[]) => void;
}

export async function seedDemoData(
  prisma: PrismaClient | any,
  logger: DemoSeedLogger = console,
) {
  logger.log("🌱 Verifying and synchronizing MedCore HMS Demo Hospital and preconfigured accounts...");

  const passwordHash = bcrypt.hashSync(DEMO_CONFIG.password, 10);

  // 1. Shared Demo Address
  const address = await prisma.address.upsert({
    where: { id: "addr-demo-hospital" },
    update: {},
    create: {
      id: "addr-demo-hospital",
      street: "100 Innovation Healthcare Boulevard, Cyber City",
      city: "Gurugram",
      state: "Haryana",
      postalCode: "122002",
      country: "India",
    },
  });

  // 2. Demo Hospital (ACTIVE)
  const hospital = await prisma.hospital.upsert({
    where: { code: DEMO_CONFIG.hospitalCode },
    update: {
      status: HospitalStatus.ACTIVE,
      name: DEMO_CONFIG.hospitalName,
    },
    create: {
      id: DEMO_CONFIG.hospitalId,
      code: DEMO_CONFIG.hospitalCode,
      name: DEMO_CONFIG.hospitalName,
      tagline: "Excellence in Digital Healthcare & Clinical Operations",
      email: "demo.contact@medcore.io",
      phone: "+91-11-29500001",
      website: "https://medcore-demo.internal",
      status: HospitalStatus.ACTIVE,
      addressId: address.id,
    },
  });

  // 3. Dedicated Active Demo Accounts
  const demoUsersConfig = [
    {
      id: "user-demo-admin",
      email: DEMO_CONFIG.accounts.admin,
      role: UserRole.HOSPITAL_ADMIN,
      firstName: "Rajesh",
      lastName: "Singhania",
      phone: "+91-9800000001",
    },
    {
      id: "user-demo-doctor",
      email: DEMO_CONFIG.accounts.doctor,
      role: UserRole.DOCTOR,
      firstName: "Arun",
      lastName: "Sharma",
      phone: "+91-9800000002",
    },
    {
      id: "user-demo-nurse",
      email: DEMO_CONFIG.accounts.nurse,
      role: UserRole.NURSE,
      firstName: "Sunita",
      lastName: "Menon",
      phone: "+91-9800000003",
    },
    {
      id: "user-demo-receptionist",
      email: DEMO_CONFIG.accounts.receptionist,
      role: UserRole.RECEPTIONIST,
      firstName: "Neha",
      lastName: "Verma",
      phone: "+91-9800000004",
    },
    {
      id: "user-demo-pharma",
      email: DEMO_CONFIG.accounts.pharmacist,
      role: UserRole.PHARMACIST,
      firstName: "Ritu",
      lastName: "Agarwal",
      phone: "+91-9800000005",
    },
    {
      id: "user-demo-lab",
      email: DEMO_CONFIG.accounts.lab,
      role: UserRole.LAB_TECHNICIAN,
      firstName: "Anand",
      lastName: "Khurana",
      phone: "+91-9800000006",
    },
    {
      id: "user-demo-billing",
      email: DEMO_CONFIG.accounts.billing,
      role: UserRole.ACCOUNTANT,
      firstName: "Suresh",
      lastName: "Iyer",
      phone: "+91-9800000007",
    },
  ];

  for (const u of demoUsersConfig) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        isActive: true,
        hospitalId: hospital.id,
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
        passwordHash, // Keeps password synchronized with standard Demo@MedCore2026
      },
      create: {
        id: u.id,
        email: u.email,
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        passwordHash,
        hospitalId: hospital.id,
        isActive: true,
      },
    });
  }

  // 4. Clinical Departments
  const departmentsData = [
    { code: "CARD", name: "Cardiology", description: "Heart, coronary, and vascular diagnostics and interventions." },
    { code: "NEUR", name: "Neurology", description: "Brain, spine, and central nervous system therapeutics." },
    { code: "PEDI", name: "Pediatrics", description: "Comprehensive pediatric and child healthcare." },
    { code: "GENM", name: "General Internal Medicine", description: "Adult primary healthcare and preventive diagnostics." },
    { code: "ORTH", name: "Orthopedics & Joint Care", description: "Musculoskeletal injuries, arthroscopy, and joint replacement." },
  ];

  const deptMap: Record<string, any> = {};
  for (const d of departmentsData) {
    const dept = await prisma.department.upsert({
      where: { hospitalId_code: { hospitalId: hospital.id, code: d.code } },
      update: { name: d.name, description: d.description },
      create: {
        id: `dept-demo-${d.code.toLowerCase()}`,
        hospitalId: hospital.id,
        code: d.code,
        name: d.name,
        description: d.description,
      },
    });
    deptMap[d.code] = dept;
  }

  // 5. Rooms
  const roomsData = [
    { roomNumber: "ICU-CARD-01", type: RoomType.ICU, capacity: 1, departmentId: deptMap["CARD"].id },
    { roomNumber: "GEN-CARD-101", type: RoomType.GENERAL_WARD, capacity: 4, departmentId: deptMap["CARD"].id },
    { roomNumber: "PVT-ORTH-201", type: RoomType.PRIVATE, capacity: 1, departmentId: deptMap["ORTH"].id },
    { roomNumber: "OT-MAIN-01", type: RoomType.OPERATION_THEATER, capacity: 1, departmentId: deptMap["NEUR"].id },
  ];

  for (const r of roomsData) {
    await prisma.room.upsert({
      where: { hospitalId_roomNumber: { hospitalId: hospital.id, roomNumber: r.roomNumber } },
      update: {},
      create: {
        hospitalId: hospital.id,
        roomNumber: r.roomNumber,
        type: r.type,
        capacity: r.capacity,
        departmentId: r.departmentId,
      },
    });
  }

  // 6. Demo Doctor Profile & Schedule
  const doctor = await prisma.doctor.upsert({
    where: { hospitalId_licenseNumber: { hospitalId: hospital.id, licenseNumber: "MCI-DEMO-10001" } },
    update: {
      specialization: "Interventional Cardiology",
      consultationFee: 1200.0,
    },
    create: {
      id: "doc-demo-cardio-01",
      hospitalId: hospital.id,
      userId: "user-demo-doctor",
      departmentId: deptMap["CARD"].id,
      licenseNumber: "MCI-DEMO-10001",
      specialization: "Interventional Cardiology",
      experienceYears: 15,
      consultationFee: 1200.0,
      bio: "Senior Consultant Cardiologist specializing in coronary interventions, preventive cardiology, and telemetry.",
    },
  });

  // Doctor Availability (Monday to Friday, 09:00 - 13:00 and 14:00 - 17:00)
  for (let day = 1; day <= 5; day++) {
    await prisma.doctorAvailability.upsert({
      where: {
        hospitalId_doctorId_dayOfWeek_startTime: {
          hospitalId: hospital.id,
          doctorId: doctor.id,
          dayOfWeek: day,
          startTime: "09:00",
        },
      },
      update: {},
      create: {
        hospitalId: hospital.id,
        doctorId: doctor.id,
        dayOfWeek: day,
        startTime: "09:00",
        endTime: "13:00",
        slotDurationMinutes: 30,
        isAvailable: true,
      },
    });

    await prisma.doctorAvailability.upsert({
      where: {
        hospitalId_doctorId_dayOfWeek_startTime: {
          hospitalId: hospital.id,
          doctorId: doctor.id,
          dayOfWeek: day,
          startTime: "14:00",
        },
      },
      update: {},
      create: {
        hospitalId: hospital.id,
        doctorId: doctor.id,
        dayOfWeek: day,
        startTime: "14:00",
        endTime: "17:00",
        slotDurationMinutes: 30,
        isAvailable: true,
      },
    });
  }

  // 7. Synthetic Patients
  const patientsConfig = [
    {
      id: "pat-demo-001",
      mrn: "MRN-DEMO-0001",
      firstName: "Aarav",
      lastName: "Mehta",
      dob: new Date("1982-05-14"),
      gender: Gender.MALE,
      bloodGroup: "O+",
      phone: "+91-9870000001",
      email: "aarav.mehta@example.com",
      emergencyContactName: "Kavita Mehta",
      emergencyContactPhone: "+91-9870000099",
    },
    {
      id: "pat-demo-002",
      mrn: "MRN-DEMO-0002",
      firstName: "Priya",
      lastName: "Sharma",
      dob: new Date("1990-11-20"),
      gender: Gender.FEMALE,
      bloodGroup: "B+",
      phone: "+91-9870000002",
      email: "priya.sharma@example.com",
      emergencyContactName: "Vikram Sharma",
      emergencyContactPhone: "+91-9870000098",
    },
    {
      id: "pat-demo-003",
      mrn: "MRN-DEMO-0003",
      firstName: "Rohan",
      lastName: "Gupta",
      dob: new Date("1975-08-03"),
      gender: Gender.MALE,
      bloodGroup: "A+",
      phone: "+91-9870000003",
      email: "rohan.gupta@example.com",
      emergencyContactName: "Pooja Gupta",
      emergencyContactPhone: "+91-9870000097",
    },
    {
      id: "pat-demo-004",
      mrn: "MRN-DEMO-0004",
      firstName: "Ananya",
      lastName: "Patel",
      dob: new Date("1996-03-29"),
      gender: Gender.FEMALE,
      bloodGroup: "AB+",
      phone: "+91-9870000004",
      email: "ananya.patel@example.com",
      emergencyContactName: "Sanjay Patel",
      emergencyContactPhone: "+91-9870000096",
    },
  ];

  const createdPatients: any[] = [];
  for (const p of patientsConfig) {
    const patient = await prisma.patient.upsert({
      where: { hospitalId_mrn: { hospitalId: hospital.id, mrn: p.mrn } },
      update: {
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
      },
      create: {
        id: p.id,
        hospitalId: hospital.id,
        mrn: p.mrn,
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dob,
        gender: p.gender,
        bloodGroup: p.bloodGroup,
        phone: p.phone,
        email: p.email,
        emergencyContactName: p.emergencyContactName,
        emergencyContactPhone: p.emergencyContactPhone,
      },
    });
    createdPatients.push(patient);
  }

  // Allergy for Patient 1 (Aarav Mehta)
  const existingAllergy = await prisma.patientAllergy.findFirst({
    where: { hospitalId: hospital.id, patientId: createdPatients[0].id },
  });
  if (!existingAllergy) {
    await prisma.patientAllergy.create({
      data: {
        hospitalId: hospital.id,
        patientId: createdPatients[0].id,
        allergen: "Amoxicillin / Penicillin",
        reaction: "Severe Skin Rash & Facial Angioedema",
        severity: AllergySeverity.SEVERE,
        diagnosedDate: new Date("2024-01-15"),
      },
    });
  }

  // Medication history for Patient 1
  const existingMedHistory = await prisma.patientMedicationHistory.findFirst({
    where: { hospitalId: hospital.id, patientId: createdPatients[0].id },
  });
  if (!existingMedHistory) {
    await prisma.patientMedicationHistory.create({
      data: {
        hospitalId: hospital.id,
        patientId: createdPatients[0].id,
        medicationName: "Amlodipine 5mg",
        dosage: "1 tablet",
        frequency: "Once daily in the morning",
        startDate: new Date("2023-06-01"),
        isActive: true,
        notes: "Chronic hypertension management.",
      },
    });
  }

  // 8. Standardized Formulary Medicines
  const medicinesConfig = [
    { code: "MED-DEMO-AMOX", name: "AmoxClav 625", genericName: "Amoxicillin + Potassium Clavulanate", category: "Antibiotic", form: MedicineForm.TABLET, strength: "625 mg", manufacturer: "Sun Pharma", unitPrice: 22.50 },
    { code: "MED-DEMO-PARA", name: "Dolo 650", genericName: "Paracetamol", category: "Analgesic / Antipyretic", form: MedicineForm.TABLET, strength: "650 mg", manufacturer: "Micro Labs", unitPrice: 3.20 },
    { code: "MED-DEMO-ATOR", name: "Atorva 20", genericName: "Atorvastatin Calcium", category: "Antihyperlipidemic", form: MedicineForm.TABLET, strength: "20 mg", manufacturer: "Zydus", unitPrice: 15.00 },
    { code: "MED-DEMO-PANT", name: "Pan 40", genericName: "Pantoprazole Sodium", category: "Proton Pump Inhibitor", form: MedicineForm.TABLET, strength: "40 mg", manufacturer: "Alkem", unitPrice: 9.80 },
    { code: "MED-DEMO-AMLO", name: "Amlong 5", genericName: "Amlodipine Besylate", category: "Calcium Channel Blocker", form: MedicineForm.TABLET, strength: "5 mg", manufacturer: "Micro Labs", unitPrice: 6.00 },
  ];

  const medMap: Record<string, any> = {};
  for (const m of medicinesConfig) {
    const med = await prisma.medicine.upsert({
      where: { hospitalId_code: { hospitalId: hospital.id, code: m.code } },
      update: { unitPrice: m.unitPrice },
      create: {
        id: `med-${m.code.toLowerCase()}`,
        hospitalId: hospital.id,
        code: m.code,
        name: m.name,
        genericName: m.genericName,
        category: m.category,
        form: m.form,
        strength: m.strength,
        manufacturer: m.manufacturer,
        unitPrice: m.unitPrice,
      },
    });
    medMap[m.code] = med;
  }

  // 9. Standardized Laboratory Tests
  const labTestsConfig = [
    { code: "LAB-DEMO-CBC", name: "Complete Blood Count (CBC)", category: "Hematology", price: 450.00, referenceRange: "Hb: 12-16 g/dL, WBC: 4000-11000 /uL, Plt: 1.5-4.5 Lakh", units: "Standard" },
    { code: "LAB-DEMO-LIPID", name: "Comprehensive Lipid Profile", category: "Biochemistry", price: 900.00, referenceRange: "Total Chol: <200 mg/dL, LDL: <100 mg/dL, HDL: >40 mg/dL", units: "mg/dL" },
    { code: "LAB-DEMO-KFT", name: "Kidney Function Test (KFT)", category: "Biochemistry", price: 750.00, referenceRange: "Urea: 15-45 mg/dL, Creatinine: 0.7-1.3 mg/dL", units: "mg/dL" },
  ];

  const labMap: Record<string, any> = {};
  for (const t of labTestsConfig) {
    const test = await prisma.labTest.upsert({
      where: { hospitalId_code: { hospitalId: hospital.id, code: t.code } },
      update: { price: t.price },
      create: {
        id: `lab-${t.code.toLowerCase()}`,
        hospitalId: hospital.id,
        code: t.code,
        name: t.name,
        category: t.category,
        price: t.price,
        referenceRange: t.referenceRange,
        units: t.units,
      },
    });
    labMap[t.code] = test;
  }

  // 10. Appointments (Completed yesterday, Today confirmed, Tomorrow confirmed, Next week pending)
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  const appointmentsConfig = [
    {
      id: "apt-demo-001",
      patientId: createdPatients[0].id,
      date: yesterday,
      startTime: "10:00",
      endTime: "10:30",
      type: AppointmentType.CONSULTATION,
      status: AppointmentStatus.COMPLETED,
      reason: "Cardiovascular evaluation, intermittent palpitations, and BP check",
    },
    {
      id: "apt-demo-002",
      patientId: createdPatients[1].id,
      date: now,
      startTime: "11:30",
      endTime: "12:00",
      type: AppointmentType.CONSULTATION,
      status: AppointmentStatus.CONFIRMED,
      reason: "Shortness of breath and mild chest tightness on exertion",
    },
    {
      id: "apt-demo-003",
      patientId: createdPatients[2].id,
      date: tomorrow,
      startTime: "14:30",
      endTime: "15:00",
      type: AppointmentType.FOLLOW_UP,
      status: AppointmentStatus.CONFIRMED,
      reason: "Post-angioplasty 6-month routine cardiology review",
    },
    {
      id: "apt-demo-004",
      patientId: createdPatients[3].id,
      date: nextWeek,
      startTime: "09:30",
      endTime: "10:00",
      type: AppointmentType.CONSULTATION,
      status: AppointmentStatus.PENDING,
      reason: "Preventive cardiology screening and family history consult",
    },
  ];

  for (const a of appointmentsConfig) {
    await prisma.appointment.upsert({
      where: { id: a.id },
      update: {
        status: a.status,
        appointmentDate: a.date,
      },
      create: {
        id: a.id,
        hospitalId: hospital.id,
        patientId: a.patientId,
        doctorId: doctor.id,
        departmentId: deptMap["CARD"].id,
        appointmentDate: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        type: a.type,
        status: a.status,
        reason: a.reason,
        notes: "Scheduled via MedCore Demo Access System.",
      },
    });
  }

  // 11. Complete Clinical EMR for Completed Appointment (apt-demo-001)
  const medRecord = await prisma.medicalRecord.upsert({
    where: { id: "medrec-demo-001" },
    update: {},
    create: {
      id: "medrec-demo-001",
      hospitalId: hospital.id,
      patientId: createdPatients[0].id,
      doctorId: doctor.id,
      appointmentId: "apt-demo-001",
      visitDate: yesterday,
      chiefComplaint: "Periodic palpitations, exertional shortness of breath, and elevated morning BP readings (145/90).",
      physicalExamination: "S1 S2 normal, regular rhythm, no murmurs. Bilateral lung fields clear. No pedal edema.",
      assessment: "Stage 1 Essential Hypertension with early hypertensive cardiopathy risk. Stable baseline telemetry.",
    },
  });

  // Vital Signs
  const existingVitals = await prisma.vitalSigns.findFirst({
    where: { medicalRecordId: medRecord.id },
  });
  if (!existingVitals) {
    await prisma.vitalSigns.create({
      data: {
        hospitalId: hospital.id,
        medicalRecordId: medRecord.id,
        bloodPressureSystolic: 140,
        bloodPressureDiastolic: 88,
        heartRate: 76,
        respiratoryRate: 18,
        temperature: 98.4,
        oxygenSaturation: 98,
        heightCm: 172.0,
        weightKg: 74.5,
        bmi: 25.18,
        notes: "Triage vitals logged by Nurse Sunita Menon.",
      },
    });
  }

  // Diagnosis
  const existingDiagnosis = await prisma.diagnosis.findFirst({
    where: { medicalRecordId: medRecord.id },
  });
  if (!existingDiagnosis) {
    await prisma.diagnosis.create({
      data: {
        hospitalId: hospital.id,
        medicalRecordId: medRecord.id,
        recordingDoctorId: doctor.id,
        icdCode: "I10",
        diagnosisName: "Essential (primary) hypertension",
        type: DiagnosisType.PRIMARY,
        notes: "Prescribed dual antihypertensive/lipid therapy and low-sodium dietary restrictions.",
      },
    });
  }

  // Treatment Plan
  const existingPlan = await prisma.treatmentPlan.findFirst({
    where: { medicalRecordId: medRecord.id },
  });
  if (!existingPlan) {
    await prisma.treatmentPlan.create({
      data: {
        hospitalId: hospital.id,
        medicalRecordId: medRecord.id,
        planDescription: "Low sodium dietary regimen (<2g/day), brisk walking 30 mins daily, avoid unprescribed NSAIDs.",
        instructions: "Maintain twice-weekly BP journal. Report immediately if chest discomfort or dizziness occurs.",
        followUpDate: new Date(yesterday.getTime() + 14 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Prescription with Items
  const prescription = await prisma.prescription.upsert({
    where: { id: "rx-demo-001" },
    update: {},
    create: {
      id: "rx-demo-001",
      hospitalId: hospital.id,
      medicalRecordId: medRecord.id,
      patientId: createdPatients[0].id,
      doctorId: doctor.id,
      status: PrescriptionStatus.DISPENSED,
      notes: "Dispensed by Chief Pharmacist Ritu Agarwal. Take with water after meals.",
    },
  });

  const existingRxItem1 = await prisma.prescriptionItem.findFirst({
    where: { prescriptionId: prescription.id, medicineId: medMap["MED-DEMO-ATOR"].id },
  });
  if (!existingRxItem1) {
    await prisma.prescriptionItem.create({
      data: {
        hospitalId: hospital.id,
        prescriptionId: prescription.id,
        medicineId: medMap["MED-DEMO-ATOR"].id,
        dosage: "1 tablet",
        frequency: "Once daily at bedtime",
        duration: "30 days",
        quantity: 30,
        instructions: "Swallow whole with water at bedtime.",
        dispensedQuantity: 30,
      },
    });
  }

  const existingRxItem2 = await prisma.prescriptionItem.findFirst({
    where: { prescriptionId: prescription.id, medicineId: medMap["MED-DEMO-PANT"].id },
  });
  if (!existingRxItem2) {
    await prisma.prescriptionItem.create({
      data: {
        hospitalId: hospital.id,
        prescriptionId: prescription.id,
        medicineId: medMap["MED-DEMO-PANT"].id,
        dosage: "1 tablet",
        frequency: "Once daily before breakfast",
        duration: "30 days",
        quantity: 30,
        instructions: "Take 30 minutes before food in the morning.",
        dispensedQuantity: 30,
      },
    });
  }

  // Lab Order with Result
  const labOrder = await prisma.labOrder.upsert({
    where: { id: "labord-demo-001" },
    update: {},
    create: {
      id: "labord-demo-001",
      hospitalId: hospital.id,
      medicalRecordId: medRecord.id,
      patientId: createdPatients[0].id,
      doctorId: doctor.id,
      priority: LabPriority.ROUTINE,
      status: LabOrderStatus.COMPLETED,
      clinicalNotes: "Comprehensive cardiovascular baseline and lipid evaluation.",
    },
  });

  const existingLabResult = await prisma.labResult.findFirst({
    where: { labOrderId: labOrder.id },
  });
  if (!existingLabResult) {
    await prisma.labResult.create({
      data: {
        hospitalId: hospital.id,
        labOrderId: labOrder.id,
        labTestId: labMap["LAB-DEMO-LIPID"].id,
        resultValue: "178 mg/dL",
        referenceRange: labMap["LAB-DEMO-LIPID"].referenceRange,
        unit: labMap["LAB-DEMO-LIPID"].units,
        status: LabResultStatus.NORMAL,
        findings: "Total cholesterol and lipid fractions within normal limits for age cohort. Maintain diet plan.",
        performedAt: yesterday,
        performedById: "user-demo-lab",
      },
    });
  }

  // 12. Invoices & Payments (1 Paid, 1 Pending)
  const paidInvoice = await prisma.invoice.upsert({
    where: { id: "inv-demo-001" },
    update: {},
    create: {
      id: "inv-demo-001",
      hospitalId: hospital.id,
      patientId: createdPatients[0].id,
      appointmentId: "apt-demo-001",
      invoiceNumber: "INV-DEMO-0001",
      issueDate: yesterday,
      dueDate: yesterday,
      subtotal: 2100.0,
      taxAmount: 105.0,
      discountAmount: 0.0,
      totalAmount: 2205.0,
      paidAmount: 2205.0,
      status: InvoiceStatus.PAID,
      notes: "Settled at counter via UPI instant bank transfer.",
    },
  });

  const existingItem1 = await prisma.invoiceItem.findFirst({
    where: { invoiceId: paidInvoice.id, itemType: InvoiceItemType.CONSULTATION },
  });
  if (!existingItem1) {
    await prisma.invoiceItem.create({
      data: {
        hospitalId: hospital.id,
        invoiceId: paidInvoice.id,
        description: "Specialist Cardiology Consultation - Dr. Arun Sharma",
        quantity: 1,
        unitPrice: 1200.0,
        totalPrice: 1200.0,
        itemType: InvoiceItemType.CONSULTATION,
      },
    });
  }

  const existingItem2 = await prisma.invoiceItem.findFirst({
    where: { invoiceId: paidInvoice.id, itemType: InvoiceItemType.LAB_TEST },
  });
  if (!existingItem2) {
    await prisma.invoiceItem.create({
      data: {
        hospitalId: hospital.id,
        invoiceId: paidInvoice.id,
        description: "Laboratory Investigation: Comprehensive Lipid Profile",
        quantity: 1,
        unitPrice: 900.0,
        totalPrice: 900.0,
        itemType: InvoiceItemType.LAB_TEST,
      },
    });
  }

  const existingPayment = await prisma.payment.findFirst({
    where: { invoiceId: paidInvoice.id },
  });
  if (!existingPayment) {
    await prisma.payment.create({
      data: {
        hospitalId: hospital.id,
        invoiceId: paidInvoice.id,
        paymentDate: yesterday,
        amount: 2205.0,
        paymentMethod: PaymentMethod.UPI,
        transactionReference: "UPI-DEMO-2026-0001",
        status: PaymentStatus.COMPLETED,
        notes: "Instant merchant UPI settlement.",
      },
    });
  }

  // Pending Invoice for Today's Appointment
  const pendingInvoice = await prisma.invoice.upsert({
    where: { id: "inv-demo-002" },
    update: {},
    create: {
      id: "inv-demo-002",
      hospitalId: hospital.id,
      patientId: createdPatients[1].id,
      appointmentId: "apt-demo-002",
      invoiceNumber: "INV-DEMO-0002",
      issueDate: now,
      dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      subtotal: 1200.0,
      taxAmount: 60.0,
      discountAmount: 0.0,
      totalAmount: 1260.0,
      paidAmount: 0.0,
      status: InvoiceStatus.ISSUED,
      notes: "Pending cashier settlement.",
    },
  });

  const existingPendingItem = await prisma.invoiceItem.findFirst({
    where: { invoiceId: pendingInvoice.id },
  });
  if (!existingPendingItem) {
    await prisma.invoiceItem.create({
      data: {
        hospitalId: hospital.id,
        invoiceId: pendingInvoice.id,
        description: "Specialist Cardiology Consultation - Dr. Arun Sharma",
        quantity: 1,
        unitPrice: 1200.0,
        totalPrice: 1200.0,
        itemType: InvoiceItemType.CONSULTATION,
      },
    });
  }

  // 13. System Notifications
  const notificationsConfig = [
    {
      userId: "user-demo-doctor",
      title: "Completed Consultation: Aarav Mehta",
      message: "EMR, diagnosis (I10), and lipid panel review completed.",
      type: NotificationType.APPOINTMENT,
      isRead: true,
    },
    {
      userId: "user-demo-doctor",
      title: "Upcoming Appointment: Priya Sharma",
      message: "Cardiology consultation scheduled for today.",
      type: NotificationType.APPOINTMENT,
      isRead: false,
    },
    {
      userId: "user-demo-admin",
      title: "Daily Clinical Operations Ready",
      message: "MedCore Demo Hospital operational: 4 appointments, 1 ICU bed, formulary stock verified.",
      type: NotificationType.SYSTEM,
      isRead: false,
    },
  ];

  for (const n of notificationsConfig) {
    const existingNotif = await prisma.notification.findFirst({
      where: { hospitalId: hospital.id, userId: n.userId, title: n.title },
    });
    if (!existingNotif) {
      await prisma.notification.create({
        data: {
          hospitalId: hospital.id,
          userId: n.userId,
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: n.isRead,
        },
      });
    }
  }

  // 14. Demo Audit Log
  const existingAudit = await prisma.auditLog.findFirst({
    where: { hospitalId: hospital.id, entityId: hospital.id, action: AuditAction.CREATE },
  });
  if (!existingAudit) {
    await prisma.auditLog.create({
      data: {
        hospitalId: hospital.id,
        userId: "user-demo-admin",
        action: AuditAction.CREATE,
        entityName: "Hospital",
        entityId: hospital.id,
        details: {
          action: "DEMO_HOSPITAL_BOOTSTRAP",
          code: hospital.code,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  logger.log("✅ MedCore HMS Demo Hospital and preconfigured demo accounts successfully verified and ready.");
  return {
    hospital,
    accounts: DEMO_CONFIG.accounts,
  };
}
