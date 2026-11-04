import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import {
  HospitalStatus as PrismaHospitalStatus,
  AppointmentStatus as PrismaAppointmentStatus,
  LabOrderStatus as PrismaLabOrderStatus,
  PrescriptionStatus as PrismaPrescriptionStatus,
  InvoiceStatus as PrismaInvoiceStatus,
  PaymentStatus as PrismaPaymentStatus,
  BatchStatus,
  LabPriority as PrismaLabPriority,
} from "@prisma/client";
import {
  UserRole,
  HospitalStatus,
  AppointmentStatus,
  LabOrderStatus,
  PrescriptionStatus,
  InvoiceStatus,
  PaymentStatus,
  PaymentMethod,
  LabPriority,
  SuperAdminDashboardDto,
  HospitalAdminDashboardDto,
  DoctorDashboardDto,
  NurseDashboardDto,
  ReceptionistDashboardDto,
  LabTechnicianDashboardDto,
  PharmacistDashboardDto,
  AccountantDashboardDto,
  PatientDashboardDto,
  DashboardStatsResponse,
} from "@medcore/types";

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService
  ) {}

  private getTodayBounds(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { start, end };
  }

  /**
   * Main entrypoint: dispatches to the caller's role dashboard
   */
  async getDashboardStats(user: AuthenticatedUser): Promise<DashboardStatsResponse> {
    switch (user.role) {
      case UserRole.SUPER_ADMIN:
        return this.getSuperAdminStats();
      case UserRole.HOSPITAL_ADMIN:
        return this.getHospitalAdminStats(user);
      case UserRole.DOCTOR:
        return this.getDoctorStats(user);
      case UserRole.NURSE:
        return this.getNurseStats(user);
      case UserRole.RECEPTIONIST:
        return this.getReceptionistStats(user);
      case UserRole.LAB_TECHNICIAN:
        return this.getLabTechnicianStats(user);
      case UserRole.PHARMACIST:
        return this.getPharmacistStats(user);
      case UserRole.ACCOUNTANT:
        return this.getAccountantStats(user);
      case UserRole.PATIENT:
        return this.getPatientStats(user);
      default:
        throw new ForbiddenException(`Unsupported dashboard role: ${user.role}`);
    }
  }

  // ==========================================
  // 1. SUPER_ADMIN DASHBOARD
  // ==========================================
  async getSuperAdminStats(): Promise<SuperAdminDashboardDto> {
    const [
      totalHospitals,
      activeHospitals,
      onboardingHospitals,
      suspendedHospitals,
      totalUsers,
      totalDoctors,
      totalPatients,
      totalAppointments,
      confirmedAppts,
      completedAppts,
      pendingAppts,
      cancelledAppts,
      recentHospitalsData,
    ] = await Promise.all([
      this.prisma.hospital.count(),
      this.prisma.hospital.count({ where: { status: PrismaHospitalStatus.ACTIVE } }),
      this.prisma.hospital.count({ where: { status: PrismaHospitalStatus.ONBOARDING } }),
      this.prisma.hospital.count({ where: { status: PrismaHospitalStatus.SUSPENDED } }),
      this.prisma.user.count(),
      this.prisma.doctor.count({ where: { deletedAt: null } }),
      this.prisma.patient.count({ where: { deletedAt: null } }),
      this.prisma.appointment.count({ where: { deletedAt: null } }),
      this.prisma.appointment.count({ where: { status: PrismaAppointmentStatus.CONFIRMED, deletedAt: null } }),
      this.prisma.appointment.count({ where: { status: PrismaAppointmentStatus.COMPLETED, deletedAt: null } }),
      this.prisma.appointment.count({ where: { status: PrismaAppointmentStatus.PENDING, deletedAt: null } }),
      this.prisma.appointment.count({ where: { status: PrismaAppointmentStatus.CANCELLED, deletedAt: null } }),
      this.prisma.hospital.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          address: { select: { city: true } },
          _count: {
            select: { departments: true, doctors: true },
          },
        },
      }),
    ]);

    return {
      role: UserRole.SUPER_ADMIN,
      totalHospitals,
      activeHospitals,
      onboardingHospitals,
      suspendedHospitals,
      totalUsers,
      totalDoctors,
      totalPatients,
      totalAppointments,
      appointmentsByStatus: {
        confirmed: confirmedAppts,
        completed: completedAppts,
        pending: pendingAppts,
        cancelled: cancelledAppts,
      },
      recentHospitals: recentHospitalsData.map((h) => ({
        id: h.id,
        code: h.code,
        name: h.name,
        status: h.status as unknown as HospitalStatus,
        city: h.address?.city || "—",
        departmentsCount: h._count.departments,
        doctorsCount: h._count.doctors,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  }

  // ==========================================
  // 2. HOSPITAL_ADMIN DASHBOARD
  // ==========================================
  async getHospitalAdminStats(user: AuthenticatedUser): Promise<HospitalAdminDashboardDto> {
    const hospitalId = user.hospitalId;
    if (!hospitalId) {
      throw new ForbiddenException("Hospital Administrator must be bound to a hospital tenant.");
    }

    const { start: todayStart, end: todayEnd } = this.getTodayBounds();
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { name: true, code: true },
    });

    const [
      totalPatients,
      totalDoctors,
      totalDepartments,
      totalAppts,
      todayAppts,
      pendingAppts,
      confirmedAppts,
      completedAppts,
      totalLabOrders,
      pendingCollectionOrders,
      inProgressLabOrders,
      underReviewLabOrders,
      completedLabOrders,
      totalMedicines,
      medicinesList,
      nearExpiryBatches,
      invoiceAgg,
      recentApptsList,
    ] = await Promise.all([
      this.prisma.patient.count({ where: { hospitalId, deletedAt: null } }),
      this.prisma.doctor.count({ where: { hospitalId, deletedAt: null } }),
      this.prisma.department.count({ where: { hospitalId } }),
      this.prisma.appointment.count({ where: { hospitalId, deletedAt: null } }),
      this.prisma.appointment.count({
        where: {
          hospitalId,
          deletedAt: null,
          appointmentDate: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.prisma.appointment.count({ where: { hospitalId, status: PrismaAppointmentStatus.PENDING, deletedAt: null } }),
      this.prisma.appointment.count({ where: { hospitalId, status: PrismaAppointmentStatus.CONFIRMED, deletedAt: null } }),
      this.prisma.appointment.count({ where: { hospitalId, status: PrismaAppointmentStatus.COMPLETED, deletedAt: null } }),
      this.prisma.labOrder.count({ where: { hospitalId } }),
      this.prisma.labOrder.count({
        where: { hospitalId, status: { in: [PrismaLabOrderStatus.ORDERED, PrismaLabOrderStatus.PENDING] } },
      }),
      this.prisma.labOrder.count({
        where: {
          hospitalId,
          status: { in: [PrismaLabOrderStatus.SAMPLE_COLLECTED, PrismaLabOrderStatus.PROCESSING, PrismaLabOrderStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.labOrder.count({
        where: { hospitalId, status: { in: [PrismaLabOrderStatus.RESULT_UPLOADED, PrismaLabOrderStatus.UNDER_REVIEW] } },
      }),
      this.prisma.labOrder.count({
        where: { hospitalId, status: { in: [PrismaLabOrderStatus.APPROVED, PrismaLabOrderStatus.COMPLETED] } },
      }),
      this.prisma.medicine.count({
        where: { OR: [{ hospitalId }, { hospitalId: null }] },
      }),
      this.prisma.medicine.findMany({
        where: { OR: [{ hospitalId }, { hospitalId: null }] },
        include: {
          batches: {
            where: {
              status: BatchStatus.ACTIVE,
              expiryDate: { gt: new Date() },
            },
          },
        },
      }),
      this.prisma.medicineBatch.count({
        where: {
          hospitalId,
          status: BatchStatus.ACTIVE,
          expiryDate: { gt: new Date(), lte: thirtyDaysAhead },
        },
      }),
      this.prisma.invoice.aggregate({
        where: { hospitalId, status: { not: PrismaInvoiceStatus.VOID } },
        _count: { _all: true },
        _sum: { totalAmount: true, paidAmount: true, outstandingBalance: true },
      }),
      this.prisma.appointment.findMany({
        where: { hospitalId, deletedAt: null },
        take: 5,
        orderBy: { appointmentDate: "desc" },
        include: {
          patient: { select: { firstName: true, lastName: true, mrn: true } },
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          department: { select: { name: true } },
        },
      }),
    ]);

    const lowStockCount = medicinesList.filter((m) => {
      const stock = m.batches.reduce((sum: number, b) => sum + b.currentQuantity, 0);
      return stock <= m.reorderLevel;
    }).length;

    return {
      role: UserRole.HOSPITAL_ADMIN,
      hospitalName: hospital?.name || "Hospital Workspace",
      hospitalCode: hospital?.code || "HOSP",
      totalPatients,
      totalDoctors,
      totalDepartments,
      appointmentsSummary: {
        total: totalAppts,
        today: todayAppts,
        pending: pendingAppts,
        confirmed: confirmedAppts,
        completed: completedAppts,
      },
      labSummary: {
        totalOrders: totalLabOrders,
        pendingCollection: pendingCollectionOrders,
        inProgress: inProgressLabOrders,
        underReview: underReviewLabOrders,
        completed: completedLabOrders,
      },
      pharmacySummary: {
        totalMedicines,
        lowStockCount,
        nearExpiryCount: nearExpiryBatches,
      },
      billingSummary: {
        totalInvoices: invoiceAgg._count?._all || 0,
        totalBilled: Number(invoiceAgg._sum?.totalAmount || 0),
        totalCollected: Number(invoiceAgg._sum?.paidAmount || 0),
        outstandingBalance: Number(invoiceAgg._sum?.outstandingBalance || 0),
      },
      recentAppointments: recentApptsList.map((a) => ({
        id: a.id,
        patientName: `${a.patient.firstName} ${a.patient.lastName}`,
        patientMrn: a.patient.mrn,
        doctorName: a.doctor?.user ? `Dr. ${a.doctor.user.firstName} ${a.doctor.user.lastName}` : "—",
        departmentName: a.department?.name || "General",
        appointmentDate: a.appointmentDate.toISOString().split("T")[0],
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status as unknown as AppointmentStatus,
      })),
    };
  }

  // ==========================================
  // 3. DOCTOR DASHBOARD
  // ==========================================
  async getDoctorStats(user: AuthenticatedUser): Promise<DoctorDashboardDto> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: user.id },
      include: {
        department: { select: { name: true } },
      },
    });

    if (!doctor || doctor.deletedAt) {
      throw new NotFoundException("Doctor clinical profile not found for authenticated user.");
    }

    const { start: todayStart, end: todayEnd } = this.getTodayBounds();

    const [
      todayCount,
      upcomingCount,
      completedCount,
      pendingRecordsCount,
      consultationQueueData,
      recentRxData,
      recentLabData,
    ] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          doctorId: doctor.id,
          deletedAt: null,
          appointmentDate: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.prisma.appointment.count({
        where: {
          doctorId: doctor.id,
          deletedAt: null,
          appointmentDate: { gt: todayEnd },
          status: { in: [PrismaAppointmentStatus.PENDING, PrismaAppointmentStatus.CONFIRMED] },
        },
      }),
      this.prisma.appointment.count({
        where: {
          doctorId: doctor.id,
          status: PrismaAppointmentStatus.COMPLETED,
        },
      }),
      this.prisma.medicalRecord.count({
        where: {
          doctorId: doctor.id,
          status: "DRAFT",
          deletedAt: null,
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          doctorId: doctor.id,
          deletedAt: null,
          appointmentDate: { gte: todayStart, lte: todayEnd },
          status: { in: [PrismaAppointmentStatus.CONFIRMED, PrismaAppointmentStatus.IN_PROGRESS, PrismaAppointmentStatus.PENDING] },
        },
        orderBy: { startTime: "asc" },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mrn: true,
              gender: true,
              dateOfBirth: true,
            },
          },
        },
      }),
      this.prisma.prescription.findMany({
        where: { doctorId: doctor.id },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          patient: { select: { firstName: true, lastName: true, mrn: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.labOrder.findMany({
        where: { doctorId: doctor.id },
        take: 5,
        orderBy: { orderDate: "desc" },
        include: {
          patient: { select: { firstName: true, lastName: true } },
          _count: { select: { results: true } },
        },
      }),
    ]);

    return {
      role: UserRole.DOCTOR,
      doctorId: doctor.id,
      specialization: doctor.specialization,
      departmentName: doctor.department?.name || "General Medicine",
      todayAppointmentsCount: todayCount,
      upcomingAppointmentsCount: upcomingCount,
      totalCompletedConsultations: completedCount,
      pendingRecordsCount,
      consultationQueue: consultationQueueData.map((a) => ({
        id: a.id,
        patientId: a.patient.id,
        patientName: `${a.patient.firstName} ${a.patient.lastName}`,
        patientMrn: a.patient.mrn,
        gender: a.patient.gender,
        dateOfBirth: a.patient.dateOfBirth.toISOString().split("T")[0],
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status as unknown as AppointmentStatus,
        reason: a.reason,
        isEmergency: a.isEmergency,
      })),
      recentPrescriptions: recentRxData.map((r) => ({
        id: r.id,
        patientName: `${r.patient.firstName} ${r.patient.lastName}`,
        patientMrn: r.patient.mrn,
        status: r.status,
        itemCount: r._count.items,
        createdAt: r.createdAt.toISOString(),
      })),
      recentLabOrders: recentLabData.map((l) => ({
        id: l.id,
        patientName: `${l.patient.firstName} ${l.patient.lastName}`,
        status: l.status,
        priority: l.priority,
        orderDate: l.orderDate.toISOString(),
        testsCount: l._count.results,
      })),
    };
  }

  // ==========================================
  // 4. NURSE DASHBOARD
  // ==========================================
  async getNurseStats(user: AuthenticatedUser): Promise<NurseDashboardDto> {
    const hospitalId = user.hospitalId;
    if (!hospitalId) {
      throw new ForbiddenException("Nurse must be assigned to an active hospital tenant.");
    }

    const { start: todayStart, end: todayEnd } = this.getTodayBounds();

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { name: true },
    });

    const [
      todayCount,
      inProgressCount,
      activePatientsCount,
      todayQueueData,
      recentVitalsData,
    ] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          hospitalId,
          deletedAt: null,
          appointmentDate: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.prisma.appointment.count({
        where: {
          hospitalId,
          deletedAt: null,
          status: PrismaAppointmentStatus.IN_PROGRESS,
        },
      }),
      this.prisma.patient.count({
        where: { hospitalId, deletedAt: null },
      }),
      this.prisma.appointment.findMany({
        where: {
          hospitalId,
          deletedAt: null,
          appointmentDate: { gte: todayStart, lte: todayEnd },
          status: { in: [PrismaAppointmentStatus.CONFIRMED, PrismaAppointmentStatus.IN_PROGRESS, PrismaAppointmentStatus.PENDING] },
        },
        orderBy: { startTime: "asc" },
        take: 8,
        include: {
          patient: { select: { firstName: true, lastName: true, mrn: true } },
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          department: { select: { name: true } },
        },
      }),
      this.prisma.vitalSigns.findMany({
        where: { hospitalId },
        take: 6,
        orderBy: { recordedAt: "desc" },
        include: {
          patient: { select: { firstName: true, lastName: true, mrn: true } },
        },
      }),
    ]);

    return {
      role: UserRole.NURSE,
      hospitalName: hospital?.name || "Nursing Unit",
      todayAppointmentsCount: todayCount,
      inProgressConsultationsCount: inProgressCount,
      totalActivePatients: activePatientsCount,
      todayPatientQueue: todayQueueData.map((a) => ({
        id: a.id,
        patientName: `${a.patient.firstName} ${a.patient.lastName}`,
        patientMrn: a.patient.mrn,
        doctorName: a.doctor?.user ? `Dr. ${a.doctor.user.firstName} ${a.doctor.user.lastName}` : "—",
        departmentName: a.department?.name || "General",
        startTime: a.startTime,
        status: a.status as unknown as AppointmentStatus,
        isEmergency: a.isEmergency,
      })),
      recentVitalsRecorded: recentVitalsData.map((v) => ({
        id: v.id,
        patientName: v.patient ? `${v.patient.firstName} ${v.patient.lastName}` : "Registered Patient",
        patientMrn: v.patient?.mrn || "—",
        bloodPressure: v.bloodPressureSystolic && v.bloodPressureDiastolic ? `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic} mmHg` : "—",
        heartRate: v.heartRate,
        temperature: v.temperature ? `${v.temperature}°F` : null,
        oxygenSaturation: v.oxygenSaturation,
        recordedAt: v.recordedAt.toISOString(),
      })),
    };
  }

  // ==========================================
  // 5. RECEPTIONIST DASHBOARD
  // ==========================================
  async getReceptionistStats(user: AuthenticatedUser): Promise<ReceptionistDashboardDto> {
    const hospitalId = user.hospitalId;
    if (!hospitalId) {
      throw new ForbiddenException("Receptionist must be assigned to an active hospital tenant.");
    }

    const { start: todayStart, end: todayEnd } = this.getTodayBounds();

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { name: true },
    });

    const [
      todayTotal,
      todayPending,
      todayConfirmed,
      todayInProgress,
      todayCompleted,
      todayCancelled,
      todayScheduleData,
      recentRegistrationsData,
      pendingInvoicesAgg,
    ] = await Promise.all([
      this.prisma.appointment.count({
        where: { hospitalId, deletedAt: null, appointmentDate: { gte: todayStart, lte: todayEnd } },
      }),
      this.prisma.appointment.count({
        where: { hospitalId, deletedAt: null, appointmentDate: { gte: todayStart, lte: todayEnd }, status: PrismaAppointmentStatus.PENDING },
      }),
      this.prisma.appointment.count({
        where: { hospitalId, deletedAt: null, appointmentDate: { gte: todayStart, lte: todayEnd }, status: PrismaAppointmentStatus.CONFIRMED },
      }),
      this.prisma.appointment.count({
        where: { hospitalId, deletedAt: null, appointmentDate: { gte: todayStart, lte: todayEnd }, status: PrismaAppointmentStatus.IN_PROGRESS },
      }),
      this.prisma.appointment.count({
        where: { hospitalId, deletedAt: null, appointmentDate: { gte: todayStart, lte: todayEnd }, status: PrismaAppointmentStatus.COMPLETED },
      }),
      this.prisma.appointment.count({
        where: { hospitalId, deletedAt: null, appointmentDate: { gte: todayStart, lte: todayEnd }, status: PrismaAppointmentStatus.CANCELLED },
      }),
      this.prisma.appointment.findMany({
        where: { hospitalId, deletedAt: null, appointmentDate: { gte: todayStart, lte: todayEnd } },
        orderBy: { startTime: "asc" },
        take: 10,
        include: {
          patient: { select: { firstName: true, lastName: true, mrn: true, phone: true } },
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          department: { select: { name: true } },
        },
      }),
      this.prisma.patient.findMany({
        where: { hospitalId, deletedAt: null },
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          mrn: true,
          firstName: true,
          lastName: true,
          phone: true,
          gender: true,
          createdAt: true,
        },
      }),
      this.prisma.invoice.aggregate({
        where: {
          hospitalId,
          status: { in: [PrismaInvoiceStatus.ISSUED, PrismaInvoiceStatus.PARTIALLY_PAID] },
        },
        _count: { _all: true },
        _sum: { outstandingBalance: true },
      }),
    ]);

    return {
      role: UserRole.RECEPTIONIST,
      hospitalName: hospital?.name || "Front Desk",
      todaySummary: {
        total: todayTotal,
        pending: todayPending,
        confirmed: todayConfirmed,
        inProgress: todayInProgress,
        completed: todayCompleted,
        cancelled: todayCancelled,
      },
      todaySchedule: todayScheduleData.map((a) => ({
        id: a.id,
        patientName: `${a.patient.firstName} ${a.patient.lastName}`,
        patientMrn: a.patient.mrn,
        patientPhone: a.patient.phone,
        doctorName: a.doctor?.user ? `Dr. ${a.doctor.user.firstName} ${a.doctor.user.lastName}` : "—",
        departmentName: a.department?.name || "General",
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status as unknown as AppointmentStatus,
        type: a.type as unknown as any,
      })),
      recentRegistrations: recentRegistrationsData.map((p) => ({
        id: p.id,
        mrn: p.mrn,
        name: `${p.firstName} ${p.lastName}`,
        phone: p.phone,
        gender: p.gender,
        createdAt: p.createdAt.toISOString(),
      })),
      pendingInvoicesCount: pendingInvoicesAgg._count?._all || 0,
      pendingInvoicesBalance: Number(pendingInvoicesAgg._sum?.outstandingBalance || 0),
    };
  }

  // ==========================================
  // 6. LAB_TECHNICIAN DASHBOARD
  // ==========================================
  async getLabTechnicianStats(user: AuthenticatedUser): Promise<LabTechnicianDashboardDto> {
    const hospitalId = user.hospitalId;
    if (!hospitalId) {
      throw new ForbiddenException("Lab Technician must be assigned to an active hospital tenant.");
    }

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { name: true },
    });

    const [
      awaitingSample,
      sampleCollected,
      processing,
      underReview,
      completed,
      totalOrders,
      priorityStatCount,
      activeQueueData,
    ] = await Promise.all([
      this.prisma.labOrder.count({
        where: { hospitalId, status: { in: [PrismaLabOrderStatus.ORDERED, PrismaLabOrderStatus.PENDING] } },
      }),
      this.prisma.labOrder.count({
        where: { hospitalId, status: PrismaLabOrderStatus.SAMPLE_COLLECTED },
      }),
      this.prisma.labOrder.count({
        where: { hospitalId, status: { in: [PrismaLabOrderStatus.PROCESSING, PrismaLabOrderStatus.IN_PROGRESS] } },
      }),
      this.prisma.labOrder.count({
        where: { hospitalId, status: { in: [PrismaLabOrderStatus.RESULT_UPLOADED, PrismaLabOrderStatus.UNDER_REVIEW] } },
      }),
      this.prisma.labOrder.count({
        where: { hospitalId, status: { in: [PrismaLabOrderStatus.APPROVED, PrismaLabOrderStatus.COMPLETED] } },
      }),
      this.prisma.labOrder.count({ where: { hospitalId } }),
      this.prisma.labOrder.count({
        where: {
          hospitalId,
          priority: { in: [PrismaLabPriority.URGENT, PrismaLabPriority.STAT] },
          status: { notIn: [PrismaLabOrderStatus.APPROVED, PrismaLabOrderStatus.COMPLETED, PrismaLabOrderStatus.CANCELLED] },
        },
      }),
      this.prisma.labOrder.findMany({
        where: {
          hospitalId,
          status: { notIn: [PrismaLabOrderStatus.APPROVED, PrismaLabOrderStatus.COMPLETED, PrismaLabOrderStatus.CANCELLED] },
        },
        take: 8,
        orderBy: [{ priority: "desc" }, { orderDate: "asc" }],
        include: {
          patient: { select: { firstName: true, lastName: true, mrn: true } },
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          results: {
            include: { labTest: { select: { name: true } } },
          },
        },
      }),
    ]);

    return {
      role: UserRole.LAB_TECHNICIAN,
      hospitalName: hospital?.name || "Diagnostic Laboratory",
      workflowSummary: {
        awaitingSample,
        sampleCollected,
        processing,
        underReview,
        completed,
        totalOrders,
      },
      priorityStatCount,
      activeQueue: activeQueueData.map((o) => ({
        id: o.id,
        orderNumber: `ORD-${o.id.substring(0, 8).toUpperCase()}`,
        patientName: `${o.patient.firstName} ${o.patient.lastName}`,
        patientMrn: o.patient.mrn,
        doctorName: o.doctor?.user ? `Dr. ${o.doctor.user.firstName} ${o.doctor.user.lastName}` : "—",
        status: o.status as unknown as LabOrderStatus,
        priority: o.priority as unknown as LabPriority,
        orderDate: o.orderDate.toISOString(),
        testNames: o.results.map((r) => r.labTest.name),
      })),
    };
  }

  // ==========================================
  // 7. PHARMACIST DASHBOARD
  // ==========================================
  async getPharmacistStats(user: AuthenticatedUser): Promise<PharmacistDashboardDto> {
    const hospitalId = user.hospitalId;
    if (!hospitalId) {
      throw new ForbiddenException("Pharmacist must be assigned to an active hospital tenant.");
    }

    const { start: todayStart } = this.getTodayBounds();
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { name: true },
    });

    const [
      pendingPrescriptions,
      partiallyDispensed,
      dispensedToday,
      totalMedicines,
      medicinesList,
      nearExpiryBatches,
      dispensingQueueData,
    ] = await Promise.all([
      this.prisma.prescription.count({
        where: { hospitalId, status: PrismaPrescriptionStatus.PENDING },
      }),
      this.prisma.prescription.count({
        where: { hospitalId, status: PrismaPrescriptionStatus.PARTIALLY_DISPENSED },
      }),
      this.prisma.prescription.count({
        where: {
          hospitalId,
          status: PrismaPrescriptionStatus.DISPENSED,
          updatedAt: { gte: todayStart },
        },
      }),
      this.prisma.medicine.count({
        where: { OR: [{ hospitalId }, { hospitalId: null }] },
      }),
      this.prisma.medicine.findMany({
        where: { OR: [{ hospitalId }, { hospitalId: null }] },
        include: {
          batches: {
            where: {
              status: BatchStatus.ACTIVE,
              expiryDate: { gt: new Date() },
            },
          },
        },
      }),
      this.prisma.medicineBatch.count({
        where: {
          hospitalId,
          status: BatchStatus.ACTIVE,
          expiryDate: { gt: new Date(), lte: thirtyDaysAhead },
        },
      }),
      this.prisma.prescription.findMany({
        where: {
          hospitalId,
          status: { in: [PrismaPrescriptionStatus.PENDING, PrismaPrescriptionStatus.PARTIALLY_DISPENSED] },
        },
        take: 8,
        orderBy: { createdAt: "asc" },
        include: {
          patient: { select: { firstName: true, lastName: true, mrn: true } },
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          _count: { select: { items: true } },
        },
      }),
    ]);

    const enrichedMeds = medicinesList.map((m) => {
      const currentStock = m.batches.reduce((sum: number, b) => sum + b.currentQuantity, 0);
      return {
        id: m.id,
        name: m.name,
        code: m.code,
        category: m.category || "General",
        currentStock,
        reorderLevel: m.reorderLevel,
        isLowStock: currentStock <= m.reorderLevel,
      };
    });

    const lowStockItems = enrichedMeds.filter((m) => m.isLowStock).slice(0, 8);

    return {
      role: UserRole.PHARMACIST,
      hospitalName: hospital?.name || "Central Pharmacy",
      prescriptionsQueue: {
        pending: pendingPrescriptions,
        partiallyDispensed,
        dispensedToday,
      },
      inventorySummary: {
        totalMedicines,
        lowStockCount: enrichedMeds.filter((m) => m.isLowStock).length,
        nearExpiryCount: nearExpiryBatches,
      },
      lowStockItems: lowStockItems.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        category: m.category,
        currentStock: m.currentStock,
        reorderLevel: m.reorderLevel,
      })),
      dispensingQueue: dispensingQueueData.map((rx) => ({
        id: rx.id,
        patientName: `${rx.patient.firstName} ${rx.patient.lastName}`,
        patientMrn: rx.patient.mrn,
        doctorName: rx.doctor?.user ? `Dr. ${rx.doctor.user.firstName} ${rx.doctor.user.lastName}` : "—",
        status: rx.status as unknown as PrescriptionStatus,
        createdAt: rx.createdAt.toISOString(),
        itemCount: rx._count.items,
      })),
    };
  }

  // ==========================================
  // 8. ACCOUNTANT DASHBOARD
  // ==========================================
  async getAccountantStats(user: AuthenticatedUser): Promise<AccountantDashboardDto> {
    const hospitalId = user.hospitalId;
    if (!hospitalId) {
      throw new ForbiddenException("Accountant must be assigned to an active hospital tenant.");
    }

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { name: true },
    });

    const [
      invoiceAgg,
      paidCount,
      partiallyPaidCount,
      issuedCount,
      overdueCount,
      draftCount,
      recentPaymentsData,
      recentInvoicesData,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { hospitalId, status: { not: PrismaInvoiceStatus.VOID } },
        _count: { _all: true },
        _sum: { totalAmount: true, paidAmount: true, outstandingBalance: true },
      }),
      this.prisma.invoice.count({ where: { hospitalId, status: PrismaInvoiceStatus.PAID } }),
      this.prisma.invoice.count({ where: { hospitalId, status: PrismaInvoiceStatus.PARTIALLY_PAID } }),
      this.prisma.invoice.count({ where: { hospitalId, status: PrismaInvoiceStatus.ISSUED } }),
      this.prisma.invoice.count({ where: { hospitalId, status: PrismaInvoiceStatus.OVERDUE } }),
      this.prisma.invoice.count({ where: { hospitalId, status: PrismaInvoiceStatus.DRAFT } }),
      this.prisma.payment.findMany({
        where: { hospitalId },
        take: 5,
        orderBy: { paymentDate: "desc" },
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              patient: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.invoice.findMany({
        where: { hospitalId },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          patient: { select: { firstName: true, lastName: true, mrn: true } },
        },
      }),
    ]);

    return {
      role: UserRole.ACCOUNTANT,
      hospitalName: hospital?.name || "Finance & Billing",
      financialMetrics: {
        totalInvoices: invoiceAgg._count?._all || 0,
        totalBilled: Number(invoiceAgg._sum?.totalAmount || 0),
        totalCollected: Number(invoiceAgg._sum?.paidAmount || 0),
        outstandingBalance: Number(invoiceAgg._sum?.outstandingBalance || 0),
      },
      statusBreakdown: {
        paid: paidCount,
        partiallyPaid: partiallyPaidCount,
        issued: issuedCount,
        overdue: overdueCount,
        draft: draftCount,
      },
      recentPayments: recentPaymentsData.map((p) => ({
        id: p.id,
        invoiceNumber: p.invoice?.invoiceNumber || "—",
        patientName: p.invoice?.patient ? `${p.invoice.patient.firstName} ${p.invoice.patient.lastName}` : "Patient",
        amount: Number(p.amount),
        paymentMethod: p.paymentMethod as unknown as PaymentMethod,
        status: p.status as unknown as PaymentStatus,
        paidAt: p.paymentDate.toISOString(),
      })),
      recentInvoices: recentInvoicesData.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        patientName: `${i.patient.firstName} ${i.patient.lastName}`,
        patientMrn: i.patient.mrn,
        totalAmount: Number(i.totalAmount),
        balanceAmount: Number(i.outstandingBalance),
        status: i.status as unknown as InvoiceStatus,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  }

  // ==========================================
  // 9. PATIENT DASHBOARD
  // ==========================================
  async getPatientStats(user: AuthenticatedUser): Promise<PatientDashboardDto> {
    const patient = await this.prisma.patient.findUnique({
      where: { userId: user.id },
      include: {
        hospital: { select: { name: true } },
      },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException("Patient portal profile not linked to authenticated user.");
    }

    const { start: todayStart } = this.getTodayBounds();

    const [
      upcomingApptsData,
      recentApptsData,
      activePrescriptionsCount,
      recentPrescriptionsData,
      approvedLabCount,
      recentLabData,
      invoicesAgg,
      recentInvoicesData,
      unreadCount,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          patientId: patient.id,
          deletedAt: null,
          appointmentDate: { gte: todayStart },
          status: { in: [PrismaAppointmentStatus.PENDING, PrismaAppointmentStatus.CONFIRMED, PrismaAppointmentStatus.IN_PROGRESS] },
        },
        orderBy: [{ appointmentDate: "asc" }, { startTime: "asc" }],
        take: 3,
        include: {
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          department: { select: { name: true } },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          patientId: patient.id,
          deletedAt: null,
          status: { in: [PrismaAppointmentStatus.COMPLETED, PrismaAppointmentStatus.CANCELLED] },
        },
        orderBy: { appointmentDate: "desc" },
        take: 3,
        include: {
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          department: { select: { name: true } },
        },
      }),
      this.prisma.prescription.count({
        where: { patientId: patient.id, status: { not: PrismaPrescriptionStatus.CANCELLED } },
      }),
      this.prisma.prescription.findMany({
        where: { patientId: patient.id },
        take: 3,
        orderBy: { createdAt: "desc" },
        include: {
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          items: {
            include: { medicine: { select: { name: true } } },
          },
        },
      }),
      this.prisma.labOrder.count({
        where: {
          patientId: patient.id,
          status: { in: [PrismaLabOrderStatus.APPROVED, PrismaLabOrderStatus.COMPLETED] },
        },
      }),
      this.prisma.labOrder.findMany({
        where: {
          patientId: patient.id,
          status: { in: [PrismaLabOrderStatus.APPROVED, PrismaLabOrderStatus.COMPLETED] },
        },
        take: 3,
        orderBy: { orderDate: "desc" },
        include: {
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          results: {
            include: { labTest: { select: { name: true } } },
          },
        },
      }),
      this.prisma.invoice.aggregate({
        where: { patientId: patient.id, status: { not: PrismaInvoiceStatus.VOID } },
        _count: { _all: true },
        _sum: { outstandingBalance: true },
      }),
      this.prisma.invoice.findMany({
        where: { patientId: patient.id },
        take: 3,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.notification.count({
        where: { userId: user.id, isRead: false },
      }),
    ]);

    return {
      role: UserRole.PATIENT,
      patientName: `${patient.firstName} ${patient.lastName}`,
      mrn: patient.mrn,
      hospitalName: patient.hospital?.name || "MedCore Medical Center",
      upcomingAppointments: upcomingApptsData.map((a) => ({
        id: a.id,
        doctorName: a.doctor?.user ? `Dr. ${a.doctor.user.firstName} ${a.doctor.user.lastName}` : "—",
        specialization: a.doctor?.specialization || "Clinical Consultation",
        departmentName: a.department?.name || "General",
        appointmentDate: a.appointmentDate.toISOString().split("T")[0],
        startTime: a.startTime,
        status: a.status as unknown as AppointmentStatus,
      })),
      recentAppointments: recentApptsData.map((a) => ({
        id: a.id,
        doctorName: a.doctor?.user ? `Dr. ${a.doctor.user.firstName} ${a.doctor.user.lastName}` : "—",
        departmentName: a.department?.name || "General",
        appointmentDate: a.appointmentDate.toISOString().split("T")[0],
        status: a.status as unknown as AppointmentStatus,
      })),
      activePrescriptionsCount,
      recentPrescriptions: recentPrescriptionsData.map((rx) => ({
        id: rx.id,
        doctorName: rx.doctor?.user ? `Dr. ${rx.doctor.user.firstName} ${rx.doctor.user.lastName}` : "—",
        status: rx.status as unknown as PrescriptionStatus,
        createdAt: rx.createdAt.toISOString(),
        medicinesSummary: rx.items.map((i) => i.medicine?.name || "Medication").join(", ") || "No items",
      })),
      approvedLabReportsCount: approvedLabCount,
      recentLabReports: recentLabData.map((l) => ({
        id: l.id,
        testNames: l.results.map((r) => r.labTest.name),
        doctorName: l.doctor?.user ? `Dr. ${l.doctor.user.firstName} ${l.doctor.user.lastName}` : "—",
        orderDate: l.orderDate.toISOString(),
        status: l.status,
      })),
      invoicesSummary: {
        totalInvoices: invoicesAgg._count?._all || 0,
        outstandingBalance: Number(invoicesAgg._sum?.outstandingBalance || 0),
      },
      recentInvoices: recentInvoicesData.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        totalAmount: Number(i.totalAmount),
        balanceAmount: Number(i.outstandingBalance),
        status: i.status as unknown as InvoiceStatus,
        createdAt: i.createdAt.toISOString(),
      })),
      unreadNotificationsCount: unreadCount,
    };
  }
}
