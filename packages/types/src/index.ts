/**
 * Shared API contracts live here so frontend and backend can use
 * consistent request and response types.
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  HOSPITAL_ADMIN = "HOSPITAL_ADMIN",
  DOCTOR = "DOCTOR",
  NURSE = "NURSE",
  RECEPTIONIST = "RECEPTIONIST",
  LAB_TECHNICIAN = "LAB_TECHNICIAN",
  PHARMACIST = "PHARMACIST",
  ACCOUNTANT = "ACCOUNTANT",
  PATIENT = "PATIENT",
}

export enum HospitalStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
  ONBOARDING = "ONBOARDING",
}

export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
  PREFER_NOT_TO_SAY = "PREFER_NOT_TO_SAY",
}

export enum AppointmentStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  NO_SHOW = "NO_SHOW",
}

export enum AppointmentType {
  CONSULTATION = "CONSULTATION",
  FOLLOW_UP = "FOLLOW_UP",
  EMERGENCY = "EMERGENCY",
  ROUTINE_CHECKUP = "ROUTINE_CHECKUP",
}

export enum PrescriptionStatus {
  PENDING = "PENDING",
  DISPENSED = "DISPENSED",
  PARTIALLY_DISPENSED = "PARTIALLY_DISPENSED",
  CANCELLED = "CANCELLED",
}

export enum LabOrderStatus {
  ORDERED = "ORDERED",
  PENDING = "PENDING",
  SAMPLE_COLLECTED = "SAMPLE_COLLECTED",
  PROCESSING = "PROCESSING",
  IN_PROGRESS = "IN_PROGRESS",
  RESULT_UPLOADED = "RESULT_UPLOADED",
  UNDER_REVIEW = "UNDER_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum LabPriority {
  ROUTINE = "ROUTINE",
  URGENT = "URGENT",
  STAT = "STAT",
}

export enum InvoiceStatus {
  DRAFT = "DRAFT",
  ISSUED = "ISSUED",
  PAID = "PAID",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  OVERDUE = "OVERDUE",
  VOID = "VOID",
}

export enum PaymentStatus {
  INITIATED = "INITIATED",
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export enum PaymentMethod {
  CASH = "CASH",
  CREDIT_CARD = "CREDIT_CARD",
  DEBIT_CARD = "DEBIT_CARD",
  UPI = "UPI",
  NET_BANKING = "NET_BANKING",
  INSURANCE = "INSURANCE",
  STRIPE = "STRIPE",
  RAZORPAY = "RAZORPAY",
}

export interface AddressDto {
  id?: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}

export interface HospitalDto {
  id: string;
  code: string;
  name: string;
  tagline?: string | null;
  email: string;
  phone: string;
  website?: string | null;
  status: HospitalStatus;
  address?: AddressDto | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    departments?: number;
    doctors?: number;
    patients?: number;
    appointments?: number;
  };
}

export interface DepartmentDto {
  id: string;
  hospitalId: string;
  code: string;
  name: string;
  description?: string | null;
  headOfDepartmentId?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    doctors?: number;
    rooms?: number;
    appointments?: number;
  };
}

export interface DoctorDto {
  id: string;
  hospitalId: string;
  userId: string;
  departmentId: string;
  licenseNumber: string;
  specialization: string;
  experienceYears: number;
  consultationFee: number | string;
  bio?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  department?: {
    id: string;
    code: string;
    name: string;
  };
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    isActive: boolean;
  };
}

export interface DoctorAvailabilityDto {
  id: string;
  hospitalId: string;
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  isAvailable: boolean;
}

export interface DoctorScheduleExceptionDto {
  id: string;
  hospitalId: string;
  doctorId: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  isAvailable: boolean;
  reason?: string | null;
}

export interface AvailableSlotDto {
  time: string;
  endTime: string;
  isAvailable: boolean;
  reason?: string;
}

export interface PatientDto {
  id: string;
  hospitalId: string;
  userId?: string | null;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  bloodGroup?: string | null;
  phone: string;
  email?: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  addressId?: string | null;
  address?: AddressDto | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    appointments?: number;
    medicalRecords?: number;
    invoices?: number;
  };
}

export interface AppointmentDto {
  id: string;
  hospitalId: string;
  patientId: string;
  doctorId: string;
  departmentId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  type: AppointmentType;
  status: AppointmentStatus;
  reason: string;
  notes?: string | null;
  isEmergency: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  patient?: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  doctor?: {
    id: string;
    specialization: string;
    consultationFee: number | string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
  department?: {
    id: string;
    name: string;
    code: string;
  };
}

export enum RecordStatus {
  DRAFT = "DRAFT",
  FINALIZED = "FINALIZED",
  AMENDED = "AMENDED",
}

export enum DiagnosisType {
  PRIMARY = "PRIMARY",
  SECONDARY = "SECONDARY",
  PROVISIONAL = "PROVISIONAL",
  FINAL = "FINAL",
}

export enum AllergySeverity {
  MILD = "MILD",
  MODERATE = "MODERATE",
  SEVERE = "SEVERE",
  LIFE_THREATENING = "LIFE_THREATENING",
}

export interface MedicalRecordAmendmentDto {
  id: string;
  hospitalId: string;
  medicalRecordId: string;
  amendedById: string;
  reason: string;
  notes: string;
  createdAt: string;
  amendedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface VitalSignsDto {
  id: string;
  hospitalId: string;
  patientId?: string | null;
  medicalRecordId?: string | null;
  recordedById?: string | null;
  recordedAt: string;
  bloodPressureSystolic?: number | null;
  bloodPressureDiastolic?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  temperature?: number | string | null;
  oxygenSaturation?: number | null;
  heightCm?: number | string | null;
  weightKg?: number | string | null;
  bmi?: number | string | null;
  notes?: string | null;
  createdAt: string;
  recordedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

export interface DiagnosisDto {
  id: string;
  hospitalId: string;
  medicalRecordId: string;
  recordingDoctorId?: string | null;
  icdCode?: string | null;
  diagnosisName: string;
  description?: string | null;
  type: DiagnosisType;
  diagnosisDate?: string | null;
  notes?: string | null;
  createdAt: string;
  recordingDoctor?: {
    id: string;
    specialization: string;
    user: {
      firstName: string;
      lastName: string;
    };
  } | null;
}

export interface TreatmentPlanDto {
  id: string;
  hospitalId: string;
  medicalRecordId: string;
  createdById?: string | null;
  planDescription: string;
  instructions?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  followUpDate?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

export interface PatientAllergyDto {
  id: string;
  hospitalId: string;
  patientId: string;
  recordedById?: string | null;
  allergen: string;
  reaction?: string | null;
  severity: AllergySeverity;
  isActive: boolean;
  diagnosedDate?: string | null;
  notes?: string | null;
  createdAt: string;
  recordedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

export interface PatientMedicationHistoryDto {
  id: string;
  hospitalId: string;
  patientId: string;
  recordedById?: string | null;
  medicationName: string;
  dosage?: string | null;
  frequency?: string | null;
  route?: string | null;
  prescribingDoctor?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  recordedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

export interface MedicalRecordDto {
  id: string;
  hospitalId: string;
  patientId: string;
  doctorId: string;
  appointmentId?: string | null;
  visitDate: string;
  chiefComplaint: string;
  presentIllness?: string | null;
  pastMedicalHistory?: string | null;
  physicalExamination?: string | null;
  assessment?: string | null;
  clinicalNotes?: string | null;
  followUpInstructions?: string | null;
  status: RecordStatus;
  signedAt?: string | null;
  signedById?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  patient?: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    phone: string;
  };
  doctor?: {
    id: string;
    specialization: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
  appointment?: {
    id: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    type: string;
    status: string;
  } | null;
  signedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  vitalSigns?: VitalSignsDto[];
  diagnoses?: DiagnosisDto[];
  treatmentPlans?: TreatmentPlanDto[];
  amendments?: MedicalRecordAmendmentDto[];
}

export interface PatientClinicalOverviewDto {
  patient: PatientDto;
  recentEncounters: MedicalRecordDto[];
  latestVitalSigns?: VitalSignsDto | null;
  activeAllergies: PatientAllergyDto[];
  activeMedications: PatientMedicationHistoryDto[];
  recentDiagnoses: DiagnosisDto[];
}

// ==========================================
// PHASE 13: DASHBOARD CONTRACTS
// ==========================================

export interface SuperAdminDashboardDto {
  role: UserRole.SUPER_ADMIN;
  totalHospitals: number;
  activeHospitals: number;
  onboardingHospitals: number;
  suspendedHospitals: number;
  totalUsers: number;
  totalDoctors: number;
  totalPatients: number;
  totalAppointments: number;
  appointmentsByStatus: {
    confirmed: number;
    completed: number;
    pending: number;
    cancelled: number;
  };
  recentHospitals: Array<{
    id: string;
    code: string;
    name: string;
    status: HospitalStatus;
    city?: string;
    departmentsCount: number;
    doctorsCount: number;
    createdAt: string;
  }>;
}

export interface HospitalAdminDashboardDto {
  role: UserRole.HOSPITAL_ADMIN;
  hospitalName: string;
  hospitalCode: string;
  totalPatients: number;
  totalDoctors: number;
  totalDepartments: number;
  appointmentsSummary: {
    total: number;
    today: number;
    pending: number;
    confirmed: number;
    completed: number;
  };
  labSummary: {
    totalOrders: number;
    pendingCollection: number;
    inProgress: number;
    underReview: number;
    completed: number;
  };
  pharmacySummary: {
    totalMedicines: number;
    lowStockCount: number;
    nearExpiryCount: number;
  };
  billingSummary: {
    totalInvoices: number;
    totalBilled: number;
    totalCollected: number;
    outstandingBalance: number;
  };
  recentAppointments: Array<{
    id: string;
    patientName: string;
    patientMrn: string;
    doctorName: string;
    departmentName: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    status: AppointmentStatus;
  }>;
}

export interface DoctorDashboardDto {
  role: UserRole.DOCTOR;
  doctorId: string;
  specialization: string;
  departmentName: string;
  todayAppointmentsCount: number;
  upcomingAppointmentsCount: number;
  totalCompletedConsultations: number;
  pendingRecordsCount: number;
  consultationQueue: Array<{
    id: string;
    patientId: string;
    patientName: string;
    patientMrn: string;
    gender: string;
    dateOfBirth: string;
    startTime: string;
    endTime: string;
    status: AppointmentStatus;
    reason: string;
    isEmergency: boolean;
  }>;
  recentPrescriptions: Array<{
    id: string;
    patientName: string;
    patientMrn: string;
    status: string;
    itemCount: number;
    createdAt: string;
  }>;
  recentLabOrders: Array<{
    id: string;
    patientName: string;
    status: string;
    priority: string;
    orderDate: string;
    testsCount: number;
  }>;
}

export interface NurseDashboardDto {
  role: UserRole.NURSE;
  hospitalName: string;
  todayAppointmentsCount: number;
  inProgressConsultationsCount: number;
  totalActivePatients: number;
  todayPatientQueue: Array<{
    id: string;
    patientName: string;
    patientMrn: string;
    doctorName: string;
    departmentName: string;
    startTime: string;
    status: AppointmentStatus;
    isEmergency: boolean;
  }>;
  recentVitalsRecorded: Array<{
    id: string;
    patientName: string;
    patientMrn: string;
    bloodPressure: string;
    heartRate?: number | null;
    temperature?: number | string | null;
    oxygenSaturation?: number | null;
    recordedAt: string;
  }>;
}

export interface ReceptionistDashboardDto {
  role: UserRole.RECEPTIONIST;
  hospitalName: string;
  todaySummary: {
    total: number;
    pending: number;
    confirmed: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  };
  todaySchedule: Array<{
    id: string;
    patientName: string;
    patientMrn: string;
    patientPhone: string;
    doctorName: string;
    departmentName: string;
    startTime: string;
    endTime: string;
    status: AppointmentStatus;
    type: AppointmentType;
  }>;
  recentRegistrations: Array<{
    id: string;
    mrn: string;
    name: string;
    phone: string;
    gender: string;
    createdAt: string;
  }>;
  pendingInvoicesCount: number;
  pendingInvoicesBalance: number;
}

export interface LabTechnicianDashboardDto {
  role: UserRole.LAB_TECHNICIAN;
  hospitalName: string;
  workflowSummary: {
    awaitingSample: number;
    sampleCollected: number;
    processing: number;
    underReview: number;
    completed: number;
    totalOrders: number;
  };
  priorityStatCount: number;
  activeQueue: Array<{
    id: string;
    orderNumber: string;
    patientName: string;
    patientMrn: string;
    doctorName: string;
    status: LabOrderStatus;
    priority: LabPriority;
    orderDate: string;
    testNames: string[];
  }>;
}

export interface PharmacistDashboardDto {
  role: UserRole.PHARMACIST;
  hospitalName: string;
  prescriptionsQueue: {
    pending: number;
    partiallyDispensed: number;
    dispensedToday: number;
  };
  inventorySummary: {
    totalMedicines: number;
    lowStockCount: number;
    nearExpiryCount: number;
  };
  lowStockItems: Array<{
    id: string;
    name: string;
    code: string;
    category: string;
    currentStock: number;
    reorderLevel: number;
  }>;
  dispensingQueue: Array<{
    id: string;
    patientName: string;
    patientMrn: string;
    doctorName: string;
    status: PrescriptionStatus;
    createdAt: string;
    itemCount: number;
  }>;
}

export interface AccountantDashboardDto {
  role: UserRole.ACCOUNTANT;
  hospitalName: string;
  financialMetrics: {
    totalInvoices: number;
    totalBilled: number;
    totalCollected: number;
    outstandingBalance: number;
  };
  statusBreakdown: {
    paid: number;
    partiallyPaid: number;
    issued: number;
    overdue: number;
    draft: number;
  };
  recentPayments: Array<{
    id: string;
    invoiceNumber: string;
    patientName: string;
    amount: number;
    paymentMethod: PaymentMethod;
    status: PaymentStatus;
    paidAt: string;
  }>;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    patientName: string;
    patientMrn: string;
    totalAmount: number;
    balanceAmount: number;
    status: InvoiceStatus;
    createdAt: string;
  }>;
}

export interface PatientDashboardDto {
  role: UserRole.PATIENT;
  patientName: string;
  mrn: string;
  hospitalName: string;
  upcomingAppointments: Array<{
    id: string;
    doctorName: string;
    specialization: string;
    departmentName: string;
    appointmentDate: string;
    startTime: string;
    status: AppointmentStatus;
  }>;
  recentAppointments: Array<{
    id: string;
    doctorName: string;
    departmentName: string;
    appointmentDate: string;
    status: AppointmentStatus;
  }>;
  activePrescriptionsCount: number;
  recentPrescriptions: Array<{
    id: string;
    doctorName: string;
    status: PrescriptionStatus;
    createdAt: string;
    medicinesSummary: string;
  }>;
  approvedLabReportsCount: number;
  recentLabReports: Array<{
    id: string;
    testNames: string[];
    doctorName: string;
    orderDate: string;
    status: string;
  }>;
  invoicesSummary: {
    totalInvoices: number;
    outstandingBalance: number;
  };
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    balanceAmount: number;
    status: InvoiceStatus;
    createdAt: string;
  }>;
  unreadNotificationsCount: number;
}

export type DashboardStatsResponse =
  | SuperAdminDashboardDto
  | HospitalAdminDashboardDto
  | DoctorDashboardDto
  | NurseDashboardDto
  | ReceptionistDashboardDto
  | LabTechnicianDashboardDto
  | PharmacistDashboardDto
  | AccountantDashboardDto
  | PatientDashboardDto;

