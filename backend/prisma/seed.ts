import {
  PrismaClient,
  UserRole,
  HospitalStatus,
  Gender,
  AppointmentStatus,
  AppointmentType,
  RoomType,
  RoomStatus,
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

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting MedCore HMS database seed...");

  const passwordHash = bcrypt.hashSync("DemoPassword@123", 10);

  // 1. Shared Addresses
  const addressDelhi = await prisma.address.upsert({
    where: { id: "addr-apex-hospital" },
    update: {},
    create: {
      id: "addr-apex-hospital",
      street: "14 Institutional Area, Sector 62",
      city: "Noida",
      state: "Uttar Pradesh",
      postalCode: "201309",
      country: "India",
    },
  });

  const addressBengaluru = await prisma.address.upsert({
    where: { id: "addr-city-hospital" },
    update: {},
    create: {
      id: "addr-city-hospital",
      street: "88 Outer Ring Road, Bellandur",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560103",
      country: "India",
    },
  });

  // 2. Hospitals (At least 2 hospitals)
  const hospitalApex = await prisma.hospital.upsert({
    where: { code: "APEX-MAIN" },
    update: {},
    create: {
      id: "hosp-apex-001",
      code: "APEX-MAIN",
      name: "Apex Multispecialty Hospital & Research Institute",
      tagline: "Excellence in Clinical Care and Surgical Innovation",
      email: "contact@apexhealth.org",
      phone: "+91-120-2490001",
      website: "https://apexhealth.org",
      status: HospitalStatus.ACTIVE,
      addressId: addressDelhi.id,
    },
  });

  const hospitalCity = await prisma.hospital.upsert({
    where: { code: "CITY-CARE" },
    update: {},
    create: {
      id: "hosp-city-002",
      code: "CITY-CARE",
      name: "CityCare Super Speciality Hospital",
      tagline: "Compassionate Healing, Advanced Technology",
      email: "info@citycarehospitals.com",
      phone: "+91-80-45678900",
      website: "https://citycarehospitals.com",
      status: HospitalStatus.ACTIVE,
      addressId: addressBengaluru.id,
    },
  });

  console.log(`✅ Seeded 2 Hospitals: ${hospitalApex.name}, ${hospitalCity.name}`);

  // 3. Platform Super Admin (hospitalId: null for global tenancy)
  await prisma.user.upsert({
    where: { email: "superadmin@medcore.io" },
    update: {},
    create: {
      id: "user-superadmin-001",
      role: UserRole.SUPER_ADMIN,
      email: "superadmin@medcore.io",
      passwordHash,
      firstName: "Super",
      lastName: "Administrator",
      phone: "+91-9876500001",
      isActive: true,
    },
  });

  // 4. Staff Users for All 9 Roles across the two hospitals
  // Hospital 1 (Apex) Staff
  await prisma.user.upsert({
    where: { email: "admin.apex@medcore.io" },
    update: {},
    create: {
      id: "user-admin-apex",
      hospitalId: hospitalApex.id,
      role: UserRole.HOSPITAL_ADMIN,
      email: "admin.apex@medcore.io",
      passwordHash,
      firstName: "Vikram",
      lastName: "Singhania",
      phone: "+91-9811000001",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "nurse.apex@medcore.io" },
    update: {},
    create: {
      id: "user-nurse-apex",
      hospitalId: hospitalApex.id,
      role: UserRole.NURSE,
      email: "nurse.apex@medcore.io",
      passwordHash,
      firstName: "Sunita",
      lastName: "Menon",
      phone: "+91-9811000002",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "reception.apex@medcore.io" },
    update: {},
    create: {
      id: "user-reception-apex",
      hospitalId: hospitalApex.id,
      role: UserRole.RECEPTIONIST,
      email: "reception.apex@medcore.io",
      passwordHash,
      firstName: "Neha",
      lastName: "Sharma",
      phone: "+91-9811000003",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "lab.apex@medcore.io" },
    update: {},
    create: {
      id: "user-lab-apex",
      hospitalId: hospitalApex.id,
      role: UserRole.LAB_TECHNICIAN,
      email: "lab.apex@medcore.io",
      passwordHash,
      firstName: "Anand",
      lastName: "Verma",
      phone: "+91-9811000004",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "pharma.apex@medcore.io" },
    update: {},
    create: {
      id: "user-pharma-apex",
      hospitalId: hospitalApex.id,
      role: UserRole.PHARMACIST,
      email: "pharma.apex@medcore.io",
      passwordHash,
      firstName: "Ritu",
      lastName: "Agarwal",
      phone: "+91-9811000005",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "billing.apex@medcore.io" },
    update: {},
    create: {
      id: "user-billing-apex",
      hospitalId: hospitalApex.id,
      role: UserRole.ACCOUNTANT,
      email: "billing.apex@medcore.io",
      passwordHash,
      firstName: "Suresh",
      lastName: "Iyer",
      phone: "+91-9811000006",
      isActive: true,
    },
  });

  // Hospital 2 (CityCare) Staff
  await prisma.user.upsert({
    where: { email: "admin.city@medcore.io" },
    update: {},
    create: {
      id: "user-admin-city",
      hospitalId: hospitalCity.id,
      role: UserRole.HOSPITAL_ADMIN,
      email: "admin.city@medcore.io",
      passwordHash,
      firstName: "Kavita",
      lastName: "Rao",
      phone: "+91-9822000001",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "nurse.city@medcore.io" },
    update: {},
    create: {
      id: "user-nurse-city",
      hospitalId: hospitalCity.id,
      role: UserRole.NURSE,
      email: "nurse.city@medcore.io",
      passwordHash,
      firstName: "Deepa",
      lastName: "Nair",
      phone: "+91-9822000002",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "reception.city@medcore.io" },
    update: {},
    create: {
      id: "user-reception-city",
      hospitalId: hospitalCity.id,
      role: UserRole.RECEPTIONIST,
      email: "reception.city@medcore.io",
      passwordHash,
      firstName: "Pooja",
      lastName: "Hegde",
      phone: "+91-9822000003",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "lab.city@medcore.io" },
    update: {},
    create: {
      id: "user-lab-city",
      hospitalId: hospitalCity.id,
      role: UserRole.LAB_TECHNICIAN,
      email: "lab.city@medcore.io",
      passwordHash,
      firstName: "Ramesh",
      lastName: "Gowda",
      phone: "+91-9822000004",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "pharma.city@medcore.io" },
    update: {},
    create: {
      id: "user-pharma-city",
      hospitalId: hospitalCity.id,
      role: UserRole.PHARMACIST,
      email: "pharma.city@medcore.io",
      passwordHash,
      firstName: "Priya",
      lastName: "Shetty",
      phone: "+91-9822000005",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "billing.city@medcore.io" },
    update: {},
    create: {
      id: "user-billing-city",
      hospitalId: hospitalCity.id,
      role: UserRole.ACCOUNTANT,
      email: "billing.city@medcore.io",
      passwordHash,
      firstName: "Harish",
      lastName: "Kulkarni",
      phone: "+91-9822000006",
      isActive: true,
    },
  });

  console.log("✅ Seeded administrative, nursing, lab, pharmacy, and billing staff covering all 9 roles.");

  // 5. Departments
  const deptCardioApex = await prisma.department.upsert({
    where: { hospitalId_code: { hospitalId: hospitalApex.id, code: "CARD" } },
    update: {},
    create: {
      id: "dept-apex-card",
      hospitalId: hospitalApex.id,
      code: "CARD",
      name: "Cardiology",
      description: "Heart and vascular disease diagnostics, intervention, and preventive care.",
    },
  });

  const deptNeuroApex = await prisma.department.upsert({
    where: { hospitalId_code: { hospitalId: hospitalApex.id, code: "NEUR" } },
    update: {},
    create: {
      id: "dept-apex-neur",
      hospitalId: hospitalApex.id,
      code: "NEUR",
      name: "Neurology & Neurosurgery",
      description: "Brain, spine, and peripheral nerve disorders treatment.",
    },
  });

  const deptPediaApex = await prisma.department.upsert({
    where: { hospitalId_code: { hospitalId: hospitalApex.id, code: "PEDI" } },
    update: {},
    create: {
      id: "dept-apex-pedi",
      hospitalId: hospitalApex.id,
      code: "PEDI",
      name: "Pediatrics & Neonatology",
      description: "Comprehensive medical care for infants, children, and adolescents.",
    },
  });

  const deptOrthoApex = await prisma.department.upsert({
    where: { hospitalId_code: { hospitalId: hospitalApex.id, code: "ORTH" } },
    update: {},
    create: {
      id: "dept-apex-orth",
      hospitalId: hospitalApex.id,
      code: "ORTH",
      name: "Orthopedics & Joint Replacement",
      description: "Musculoskeletal trauma, arthroscopy, and joint replacement.",
    },
  });

  // CityCare Departments
  const deptGenCity = await prisma.department.upsert({
    where: { hospitalId_code: { hospitalId: hospitalCity.id, code: "GENM" } },
    update: {},
    create: {
      id: "dept-city-genm",
      hospitalId: hospitalCity.id,
      code: "GENM",
      name: "General Internal Medicine",
      description: "Adult primary care, chronic condition management, and infectious diseases.",
    },
  });

  const deptDermaCity = await prisma.department.upsert({
    where: { hospitalId_code: { hospitalId: hospitalCity.id, code: "DERM" } },
    update: {},
    create: {
      id: "dept-city-derm",
      hospitalId: hospitalCity.id,
      code: "DERM",
      name: "Dermatology",
      description: "Skin, hair, nail, and allergy clinical diagnostics.",
    },
  });

  const deptOncoCity = await prisma.department.upsert({
    where: { hospitalId_code: { hospitalId: hospitalCity.id, code: "ONCO" } },
    update: {},
    create: {
      id: "dept-city-onco",
      hospitalId: hospitalCity.id,
      code: "ONCO",
      name: "Medical Oncology",
      description: "Cancer diagnostics, chemotherapy protocols, and supportive oncology.",
    },
  });

  const deptGastroCity = await prisma.department.upsert({
    where: { hospitalId_code: { hospitalId: hospitalCity.id, code: "GAST" } },
    update: {},
    create: {
      id: "dept-city-gast",
      hospitalId: hospitalCity.id,
      code: "GAST",
      name: "Gastroenterology & Hepatology",
      description: "Digestive tract, liver, and biliary system disorders care.",
    },
  });

  // 6. Rooms
  const roomsData = [
    { hospitalId: hospitalApex.id, departmentId: deptCardioApex.id, roomNumber: "ICU-CARD-01", type: RoomType.ICU, capacity: 1 },
    { hospitalId: hospitalApex.id, departmentId: deptCardioApex.id, roomNumber: "GEN-CARD-101", type: RoomType.GENERAL_WARD, capacity: 4 },
    { hospitalId: hospitalApex.id, departmentId: deptOrthoApex.id, roomNumber: "PVT-ORTH-201", type: RoomType.PRIVATE, capacity: 1 },
    { hospitalId: hospitalApex.id, departmentId: deptNeuroApex.id, roomNumber: "OT-NEUR-01", type: RoomType.OPERATION_THEATER, capacity: 1 },
    { hospitalId: hospitalCity.id, departmentId: deptGenCity.id, roomNumber: "GEN-MED-101", type: RoomType.GENERAL_WARD, capacity: 6 },
    { hospitalId: hospitalCity.id, departmentId: deptOncoCity.id, roomNumber: "SEMI-ONC-201", type: RoomType.SEMI_PRIVATE, capacity: 2 },
    { hospitalId: hospitalCity.id, departmentId: deptGastroCity.id, roomNumber: "ICU-GAST-01", type: RoomType.ICU, capacity: 1 },
    { hospitalId: hospitalCity.id, departmentId: deptDermaCity.id, roomNumber: "OPD-DERM-01", type: RoomType.PRIVATE, capacity: 1 },
  ];

  for (const r of roomsData) {
    await prisma.room.upsert({
      where: { hospitalId_roomNumber: { hospitalId: r.hospitalId, roomNumber: r.roomNumber } },
      update: {},
      create: r,
    });
  }

  // 7. Doctors (At least 8 doctors across different specialisations)
  const doctorsData = [
    // Apex Hospital (4 doctors)
    {
      userId: "user-doc-apex-01",
      email: "dr.arun.sharma@apexhealth.org",
      firstName: "Arun",
      lastName: "Sharma",
      phone: "+91-9811100011",
      hospitalId: hospitalApex.id,
      departmentId: deptCardioApex.id,
      licenseNumber: "MCI-CARD-10291",
      specialization: "Interventional Cardiology",
      experienceYears: 16,
      consultationFee: 1200.0,
      bio: "Senior Interventional Cardiologist specializing in coronary angioplasty and structural heart disease.",
    },
    {
      userId: "user-doc-apex-02",
      email: "dr.meera.sen@apexhealth.org",
      firstName: "Meera",
      lastName: "Sen",
      phone: "+91-9811100012",
      hospitalId: hospitalApex.id,
      departmentId: deptNeuroApex.id,
      licenseNumber: "MCI-NEUR-20412",
      specialization: "Clinical Neurology",
      experienceYears: 12,
      consultationFee: 1100.0,
      bio: "Specialist in neuro-degenerative diseases, stroke rehabilitation, and epilepsy management.",
    },
    {
      userId: "user-doc-apex-03",
      email: "dr.rajesh.gupta@apexhealth.org",
      firstName: "Rajesh",
      lastName: "Gupta",
      phone: "+91-9811100013",
      hospitalId: hospitalApex.id,
      departmentId: deptPediaApex.id,
      licenseNumber: "MCI-PEDI-30514",
      specialization: "Pediatric Critical Care",
      experienceYears: 9,
      consultationFee: 800.0,
      bio: "Pediatrician focused on child development, neonatology, and adolescent preventative healthcare.",
    },
    {
      userId: "user-doc-apex-04",
      email: "dr.anjali.kapoor@apexhealth.org",
      firstName: "Anjali",
      lastName: "Kapoor",
      phone: "+91-9811100014",
      hospitalId: hospitalApex.id,
      departmentId: deptOrthoApex.id,
      licenseNumber: "MCI-ORTH-40819",
      specialization: "Orthopedic Surgery",
      experienceYears: 14,
      consultationFee: 1000.0,
      bio: "Fellowship-trained orthopedic surgeon specializing in knee and hip joint replacements.",
    },
    // CityCare Hospital (4 doctors)
    {
      userId: "user-doc-city-01",
      email: "dr.sanjay.reddy@citycarehospitals.com",
      firstName: "Sanjay",
      lastName: "Reddy",
      phone: "+91-9822200021",
      hospitalId: hospitalCity.id,
      departmentId: deptGenCity.id,
      licenseNumber: "KMC-GENM-50119",
      specialization: "Internal Medicine",
      experienceYears: 18,
      consultationFee: 750.0,
      bio: "Physician with extensive background in adult lifestyle diseases, diabetic care, and geriatrics.",
    },
    {
      userId: "user-doc-city-02",
      email: "dr.tanvi.patil@citycarehospitals.com",
      firstName: "Tanvi",
      lastName: "Patil",
      phone: "+91-9822200022",
      hospitalId: hospitalCity.id,
      departmentId: deptDermaCity.id,
      licenseNumber: "KMC-DERM-60228",
      specialization: "Dermatology & Cosmetology",
      experienceYears: 8,
      consultationFee: 900.0,
      bio: "Board-certified dermatologist experienced in autoimmune skin conditions and medical aesthetics.",
    },
    {
      userId: "user-doc-city-03",
      email: "dr.karthik.babu@citycarehospitals.com",
      firstName: "Karthik",
      lastName: "Babu",
      phone: "+91-9822200023",
      hospitalId: hospitalCity.id,
      departmentId: deptOncoCity.id,
      licenseNumber: "KMC-ONCO-70335",
      specialization: "Medical Oncology",
      experienceYears: 15,
      consultationFee: 1500.0,
      bio: "Consultant Medical Oncologist specializing in targeted therapies and immunotherapy.",
    },
    {
      userId: "user-doc-city-04",
      email: "dr.shalini.mishra@citycarehospitals.com",
      firstName: "Shalini",
      lastName: "Mishra",
      phone: "+91-9822200024",
      hospitalId: hospitalCity.id,
      departmentId: deptGastroCity.id,
      licenseNumber: "KMC-GAST-80447",
      specialization: "Gastroenterology",
      experienceYears: 11,
      consultationFee: 1000.0,
      bio: "Gastroenterologist skilled in therapeutic endoscopy, hepatology, and inflammatory bowel diseases.",
    },
  ];

  const createdDoctors: any[] = [];

  for (const d of doctorsData) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: {},
      create: {
        id: d.userId,
        hospitalId: d.hospitalId,
        role: UserRole.DOCTOR,
        email: d.email,
        passwordHash,
        firstName: d.firstName,
        lastName: d.lastName,
        phone: d.phone,
        isActive: true,
      },
    });

    const doctor = await prisma.doctor.upsert({
      where: { hospitalId_licenseNumber: { hospitalId: d.hospitalId, licenseNumber: d.licenseNumber } },
      update: {},
      create: {
        id: `doc-${d.licenseNumber}`,
        hospitalId: d.hospitalId,
        userId: user.id,
        departmentId: d.departmentId,
        licenseNumber: d.licenseNumber,
        specialization: d.specialization,
        experienceYears: d.experienceYears,
        consultationFee: d.consultationFee,
        bio: d.bio,
      },
    });

    createdDoctors.push(doctor);

    // Doctor Availability: Mon to Fri, 09:00 - 13:00 and 14:00 - 17:00
    for (let day = 1; day <= 5; day++) {
      await prisma.doctorAvailability.upsert({
        where: {
          hospitalId_doctorId_dayOfWeek_startTime: {
            hospitalId: d.hospitalId,
            doctorId: doctor.id,
            dayOfWeek: day,
            startTime: "09:00",
          },
        },
        update: {},
        create: {
          hospitalId: d.hospitalId,
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
            hospitalId: d.hospitalId,
            doctorId: doctor.id,
            dayOfWeek: day,
            startTime: "14:00",
          },
        },
        update: {},
        create: {
          hospitalId: d.hospitalId,
          doctorId: doctor.id,
          dayOfWeek: day,
          startTime: "14:00",
          endTime: "17:00",
          slotDurationMinutes: 30,
          isAvailable: true,
        },
      });
    }

    // Doctor Schedule Exception (e.g. planned medical conference)
    await prisma.doctorScheduleException.create({
      data: {
        hospitalId: d.hospitalId,
        doctorId: doctor.id,
        date: new Date("2026-11-20"),
        isAvailable: false,
        reason: "National Medical Conference Speaker",
      },
    });
  }

  console.log(`✅ Seeded ${createdDoctors.length} Doctors with weekly schedules and exceptions.`);

  // 8. Patients (At least 30 patients: 16 in Apex, 16 in CityCare)
  const patientFirstNames = [
    "Rajesh", "Pooja", "Amit", "Kiran", "Sanjay", "Ananya", "Rohan", "Sunita",
    "Deepak", "Sneha", "Manoj", "Divya", "Vikas", "Rashmi", "Alok", "Priyanka",
    "Suresh", "Meena", "Rahul", "Swati", "Naveen", "Shilpa", "Gaurav", "Aarti",
    "Tarun", "Bhavna", "Kunal", "Preeti", "Sachin", "Jyoti", "Vivek", "Nandini"
  ];

  const patientLastNames = [
    "Sharma", "Patel", "Verma", "Singh", "Kumar", "Iyer", "Nair", "Reddy",
    "Chopra", "Gupta", "Bose", "Joshi", "Deshmukh", "Choudhury", "Bhat", "Menon",
    "Aggarwal", "Pillai", "Kulkarni", "Ghosh", "Malhotra", "Hegde", "Pandey", "Saxena",
    "Dubey", "Mehta", "Soni", "Tripathi", "Mishra", "Das", "Rao", "Shetty"
  ];

  const createdPatients: any[] = [];

  for (let i = 0; i < 32; i++) {
    const isApex = i < 16;
    const targetHospital = isApex ? hospitalApex : hospitalCity;
    const pad = (i + 1).toString().padStart(4, "0");
    const mrn = isApex ? `MRN-APEX-${pad}` : `MRN-CITY-${pad}`;
    const gender = i % 2 === 0 ? Gender.MALE : Gender.FEMALE;
    const birthYear = 1960 + (i * 2);
    const dob = new Date(`${birthYear}-04-15`);
    const email = `patient.${patientFirstNames[i].toLowerCase()}.${patientLastNames[i].toLowerCase()}${i}@example.com`;

    // Create user account for the first 8 patients to enable portal login testing
    let userId: string | null = null;
    if (i < 8) {
      const pUser = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          id: `user-patient-${i + 1}`,
          hospitalId: targetHospital.id,
          role: UserRole.PATIENT,
          email,
          passwordHash,
          firstName: patientFirstNames[i],
          lastName: patientLastNames[i],
          phone: `+91-97000${i.toString().padStart(5, "0")}`,
          isActive: true,
        },
      });
      userId = pUser.id;
    }

    const patient = await prisma.patient.upsert({
      where: { hospitalId_mrn: { hospitalId: targetHospital.id, mrn } },
      update: {},
      create: {
        id: `pat-${mrn}`,
        hospitalId: targetHospital.id,
        userId,
        mrn,
        firstName: patientFirstNames[i],
        lastName: patientLastNames[i],
        dateOfBirth: dob,
        gender,
        bloodGroup: ["A+", "B+", "O+", "AB+", "O-"][i % 5],
        phone: `+91-97000${i.toString().padStart(5, "0")}`,
        email,
        emergencyContactName: `${patientFirstNames[(i + 1) % 32]} ${patientLastNames[i]}`,
        emergencyContactPhone: `+91-97111${i.toString().padStart(5, "0")}`,
      },
    });

    createdPatients.push(patient);

    // Allergies for some patients
    if (i % 3 === 0) {
      await prisma.patientAllergy.create({
        data: {
          hospitalId: targetHospital.id,
          patientId: patient.id,
          allergen: ["Amoxicillin / Penicillin", "NSAIDs (Ibuprofen)", "Sulfa Drugs", "Peanuts"][i % 4],
          reaction: ["Severe Skin Rash & Hives", "Bronchospasm", "Facial Angioedema", "Anaphylaxis"][i % 4],
          severity: AllergySeverity.SEVERE,
          diagnosedDate: new Date("2024-02-10"),
        },
      });
    }

    // Medication history
    if (i % 2 === 0) {
      await prisma.patientMedicationHistory.create({
        data: {
          hospitalId: targetHospital.id,
          patientId: patient.id,
          medicationName: i % 4 === 0 ? "Metformin 500mg" : "Amlodipine 5mg",
          dosage: "1 tablet",
          frequency: "Once daily with breakfast",
          startDate: new Date("2023-01-15"),
          isActive: true,
          notes: "Chronic hypertension / glycemic management.",
        },
      });
    }
  }

  console.log(`✅ Seeded ${createdPatients.length} Patients with Allergies & Medication Histories.`);

  // 9. Standardized Formulary Medicines
  const medicinesData = [
    { code: "MED-AMOX-500", name: "AmoxClav 625", genericName: "Amoxicillin + Potassium Clavulanate", category: "Antibiotic", form: MedicineForm.TABLET, strength: "625 mg", manufacturer: "Sun Pharma", unitPrice: 22.50 },
    { code: "MED-PARA-650", name: "Dolo 650", genericName: "Paracetamol", category: "Analgesic / Antipyretic", form: MedicineForm.TABLET, strength: "650 mg", manufacturer: "Micro Labs", unitPrice: 3.20 },
    { code: "MED-METF-500", name: "Glycomet 500", genericName: "Metformin Hydrochloride", category: "Antidiabetic", form: MedicineForm.TABLET, strength: "500 mg", manufacturer: "USV Ltd", unitPrice: 4.50 },
    { code: "MED-ATOR-20",  name: "Atorva 20", genericName: "Atorvastatin Calcium", category: "Antihyperlipidemic", form: MedicineForm.TABLET, strength: "20 mg", manufacturer: "Zydus", unitPrice: 15.00 },
    { code: "MED-PANT-40",  name: "Pan 40", genericName: "Pantoprazole Sodium", category: "Proton Pump Inhibitor", form: MedicineForm.TABLET, strength: "40 mg", manufacturer: "Alkem", unitPrice: 9.80 },
    { code: "MED-AZIT-500", name: "Azee 500", genericName: "Azithromycin", category: "Macrolide Antibiotic", form: MedicineForm.TABLET, strength: "500 mg", manufacturer: "Cipla", unitPrice: 28.00 },
    { code: "MED-AMLO-05",  name: "Amlong 5", genericName: "Amlodipine Besylate", category: "Calcium Channel Blocker", form: MedicineForm.TABLET, strength: "5 mg", manufacturer: "Micro Labs", unitPrice: 6.00 },
    { code: "MED-CETR-10",  name: "Cetzine 10", genericName: "Cetirizine Hydrochloride", category: "Antihistamine", form: MedicineForm.TABLET, strength: "10 mg", manufacturer: "Dr. Reddy's", unitPrice: 5.40 },
  ];

  const createdMedicines: any[] = [];
  for (const med of medicinesData) {
    const m = await prisma.medicine.upsert({
      where: { hospitalId_code: { hospitalId: hospitalApex.id, code: med.code } },
      update: {},
      create: {
        ...med,
        hospitalId: hospitalApex.id,
      },
    });
    createdMedicines.push(m);

    // Also seed in Hospital 2
    await prisma.medicine.upsert({
      where: { hospitalId_code: { hospitalId: hospitalCity.id, code: med.code } },
      update: {},
      create: {
        ...med,
        hospitalId: hospitalCity.id,
      },
    });
  }

  // 10. Standardized Laboratory Tests
  const labTestsData = [
    { code: "LAB-CBC", name: "Complete Blood Count (CBC)", category: "Hematology", price: 450.00, referenceRange: "Hb: 12-16 g/dL, WBC: 4000-11000 /uL, Plt: 1.5-4.5 Lakh", units: "Standard" },
    { code: "LAB-LFT", name: "Liver Function Test (LFT)", category: "Biochemistry", price: 850.00, referenceRange: "Bilirubin: 0.2-1.2 mg/dL, SGOT: 5-40 U/L, SGPT: 7-56 U/L", units: "U/L, mg/dL" },
    { code: "LAB-KFT", name: "Kidney Function Test (KFT)", category: "Biochemistry", price: 750.00, referenceRange: "Urea: 15-45 mg/dL, Creatinine: 0.7-1.3 mg/dL", units: "mg/dL" },
    { code: "LAB-LIPID", name: "Lipid Profile Panel", category: "Biochemistry", price: 900.00, referenceRange: "Total Chol: <200 mg/dL, LDL: <100 mg/dL, HDL: >40 mg/dL", units: "mg/dL" },
    { code: "LAB-HBA1C", name: "Glycated Hemoglobin (HbA1c)", category: "Endocrinology", price: 600.00, referenceRange: "<5.7% Normal, 5.7-6.4% Prediabetes, >6.5% Diabetes", units: "%" },
  ];

  const createdLabTests: any[] = [];
  for (const test of labTestsData) {
    const t = await prisma.labTest.upsert({
      where: { hospitalId_code: { hospitalId: hospitalApex.id, code: test.code } },
      update: {},
      create: {
        ...test,
        hospitalId: hospitalApex.id,
      },
    });
    createdLabTests.push(t);

    await prisma.labTest.upsert({
      where: { hospitalId_code: { hospitalId: hospitalCity.id, code: test.code } },
      update: {},
      create: {
        ...test,
        hospitalId: hospitalCity.id,
      },
    });
  }

  console.log(`✅ Seeded ${createdMedicines.length} Medicines and ${createdLabTests.length} Laboratory Tests.`);

  // 11. Appointments covering at least 2 weeks (Past 10 days + Upcoming 7 days)
  const today = new Date();
  const appointmentStatuses = [
    AppointmentStatus.COMPLETED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.PENDING,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
  ];

  let appointmentCount = 0;
  let medicalRecordCount = 0;
  let invoiceCount = 0;

  for (let i = 0; i < 20; i++) {
    const isApex = i < 10;
    const hospital = isApex ? hospitalApex : hospitalCity;
    const docPool = createdDoctors.filter((d) => d.hospitalId === hospital.id);
    const patPool = createdPatients.filter((p) => p.hospitalId === hospital.id);

    const doctor = docPool[i % docPool.length];
    const patient = patPool[i % patPool.length];

    // Offset between -10 days and +5 days
    const dayOffset = (i % 16) - 10;
    const aptDate = new Date(today);
    aptDate.setDate(today.getDate() + dayOffset);

    const isPast = dayOffset < 0;
    const isToday = dayOffset === 0;
    const status = isPast
      ? (i % 5 === 0 ? AppointmentStatus.CANCELLED : AppointmentStatus.COMPLETED)
      : isToday
      ? AppointmentStatus.IN_PROGRESS
      : AppointmentStatus.CONFIRMED;

    const isEmergency = i === 3 || i === 11;
    const type = isEmergency
      ? AppointmentType.EMERGENCY
      : i % 4 === 0
      ? AppointmentType.FOLLOW_UP
      : AppointmentType.CONSULTATION;

    const appointment = await prisma.appointment.create({
      data: {
        id: `apt-${hospital.code}-${i + 1}`,
        hospitalId: hospital.id,
        patientId: patient.id,
        doctorId: doctor.id,
        departmentId: doctor.departmentId,
        appointmentDate: aptDate,
        startTime: "10:00",
        endTime: "10:30",
        type,
        status,
        reason: isEmergency
          ? "Acute retrosternal chest pain and diaphoresis"
          : "Routine cardiovascular checkup and prescription refill",
        notes: "Patient reported mild fatigue over past 3 days.",
        isEmergency,
      },
    });
    appointmentCount++;

    // 12. Medical Record (EMR) for completed appointments
    if (status === AppointmentStatus.COMPLETED) {
      const medRecord = await prisma.medicalRecord.create({
        data: {
          id: `medrec-${appointment.id}`,
          hospitalId: hospital.id,
          patientId: patient.id,
          doctorId: doctor.id,
          appointmentId: appointment.id,
          visitDate: aptDate,
          chiefComplaint: isEmergency
            ? "Substernal heaviness radiating to left shoulder"
            : "Periodic palpitations and exertional dyspnea",
          physicalExamination: "S1 S2 heard, no murmurs. Bilateral chest clear. Mild bilateral pedal edema.",
          assessment: "Stage 1 Essential Hypertension with early hypertensive cardiopathy.",
        },
      });
      medicalRecordCount++;

      // Vitals
      await prisma.vitalSigns.create({
        data: {
          hospitalId: hospital.id,
          medicalRecordId: medRecord.id,
          bloodPressureSystolic: 142,
          bloodPressureDiastolic: 88,
          heartRate: 78,
          respiratoryRate: 18,
          temperature: 98.4,
          oxygenSaturation: 98,
          heightCm: 172.0,
          weightKg: 76.5,
          bmi: 25.86,
          notes: "Vitals recorded by triage nurse Sunita.",
        },
      });

      // Diagnosis
      await prisma.diagnosis.create({
        data: {
          hospitalId: hospital.id,
          medicalRecordId: medRecord.id,
          icdCode: "I10",
          diagnosisName: "Essential (primary) hypertension",
          type: DiagnosisType.PRIMARY,
          notes: "Initiated dual antihypertensive regimen and sodium restriction.",
        },
      });

      // Treatment Plan
      await prisma.treatmentPlan.create({
        data: {
          hospitalId: hospital.id,
          medicalRecordId: medRecord.id,
          planDescription: "Lifestyle modifications, low sodium diet (<2g/day), daily 30-min brisk walk.",
          instructions: "Review BP chart in 14 days. Report immediately if chest pain recurs.",
          followUpDate: new Date(new Date().setDate(today.getDate() + 14)),
        },
      });

      // Prescriptions with PrescriptionItem M:N relationship
      const prescription = await prisma.prescription.create({
        data: {
          id: `rx-${medRecord.id}`,
          hospitalId: hospital.id,
          medicalRecordId: medRecord.id,
          patientId: patient.id,
          doctorId: doctor.id,
          status: PrescriptionStatus.DISPENSED,
          notes: "Take after food with plenty of water.",
        },
      });

      const selectedMed = createdMedicines[i % createdMedicines.length];
      await prisma.prescriptionItem.create({
        data: {
          hospitalId: hospital.id,
          prescriptionId: prescription.id,
          medicineId: selectedMed.id,
          dosage: "1 tablet",
          frequency: "Once daily in the morning",
          duration: "30 days",
          quantity: 30,
          instructions: "Do not skip doses. Take with water.",
          dispensedQuantity: 30,
        },
      });

      // Lab Order with Lab Results
      const selectedTest = createdLabTests[i % createdLabTests.length];
      const labOrder = await prisma.labOrder.create({
        data: {
          id: `labord-${medRecord.id}`,
          hospitalId: hospital.id,
          medicalRecordId: medRecord.id,
          patientId: patient.id,
          doctorId: doctor.id,
          priority: isEmergency ? LabPriority.STAT : LabPriority.ROUTINE,
          status: LabOrderStatus.COMPLETED,
          clinicalNotes: "Rule out acute myocardial infarction / evaluate baseline lipid profile.",
        },
      });

      await prisma.labResult.create({
        data: {
          hospitalId: hospital.id,
          labOrderId: labOrder.id,
          labTestId: selectedTest.id,
          resultValue: "185 mg/dL",
          referenceRange: selectedTest.referenceRange,
          unit: selectedTest.units,
          status: LabResultStatus.NORMAL,
          findings: "Serum values within acceptable clinical boundaries for patient age cohort.",
          performedAt: new Date(aptDate.getTime() + 3600000),
          performedById: "user-lab-apex",
          attachmentMetadata: {
            fileName: `report-${selectedTest.code}-${patient.mrn}.pdf`,
            mimeType: "application/pdf",
            fileSizeBytes: 245120,
            storageBucket: "lab-reports-archive",
          },
        },
      });

      // Invoice linked to Appointment (1:1 following PRD)
      const invoiceNumber = `INV-${hospital.code}-${(i + 1).toString().padStart(4, "0")}`;
      const consultationFee = Number(doctor.consultationFee);
      const labFee = Number(selectedTest.price);
      const subtotal = consultationFee + labFee;
      const taxAmount = Number((subtotal * 0.05).toFixed(2));
      const totalAmount = subtotal + taxAmount;

      const invoice = await prisma.invoice.create({
        data: {
          id: `inv-${appointment.id}`,
          hospitalId: hospital.id,
          patientId: patient.id,
          appointmentId: appointment.id,
          invoiceNumber,
          issueDate: aptDate,
          dueDate: new Date(aptDate.getTime() + 7 * 86400000),
          subtotal,
          taxAmount,
          discountAmount: 0.0,
          totalAmount,
          paidAmount: totalAmount,
          status: InvoiceStatus.PAID,
          notes: "Billed at counter via UPI.",
        },
      });
      invoiceCount++;

      await prisma.invoiceItem.create({
        data: {
          hospitalId: hospital.id,
          invoiceId: invoice.id,
          description: `Specialist Consultation - ${doctor.specialization}`,
          quantity: 1,
          unitPrice: consultationFee,
          totalPrice: consultationFee,
          itemType: InvoiceItemType.CONSULTATION,
        },
      });

      await prisma.invoiceItem.create({
        data: {
          hospitalId: hospital.id,
          invoiceId: invoice.id,
          description: `Laboratory Panel: ${selectedTest.name}`,
          quantity: 1,
          unitPrice: labFee,
          totalPrice: labFee,
          itemType: InvoiceItemType.LAB_TEST,
        },
      });

      await prisma.payment.create({
        data: {
          hospitalId: hospital.id,
          invoiceId: invoice.id,
          paymentDate: aptDate,
          amount: totalAmount,
          paymentMethod: PaymentMethod.UPI,
          transactionReference: `UPI-REF-${hospital.code}-${i + 10001}`,
          status: PaymentStatus.COMPLETED,
          notes: "Instant bank settlement via QR code.",
        },
      });
    }

    // 13. Notifications & Audit Logs
    await prisma.notification.create({
      data: {
        hospitalId: hospital.id,
        userId: doctor.userId,
        title: `Appointment ${status}: ${patient.firstName} ${patient.lastName}`,
        message: `Appointment scheduled for ${aptDate.toLocaleDateString()} at 10:00 AM (${type}).`,
        type: NotificationType.APPOINTMENT,
        isRead: isPast,
      },
    });

    await prisma.auditLog.create({
      data: {
        hospitalId: hospital.id,
        userId: doctor.userId,
        action: AuditAction.CREATE,
        entityName: "Appointment",
        entityId: appointment.id,
        details: { patientId: patient.id, doctorId: doctor.id, status, type },
        ipAddress: "192.168.1.105",
      },
    });
  }

  console.log(`✅ Seeded ${appointmentCount} Appointments across 2+ weeks.`);
  console.log(`✅ Seeded ${medicalRecordCount} Complete Medical Records (Vitals, Diagnoses, Treatment Plans, Prescriptions, Lab Orders).`);
  console.log(`✅ Seeded ${invoiceCount} Invoices with Line Items and Recorded UPI/Cash Payments.`);

  console.log("🎉 MedCore HMS Phase 2 database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error running seed script:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
