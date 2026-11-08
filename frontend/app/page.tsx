"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./lib/auth-context";
import { apiRequest } from "./lib/api";
import {
  DashboardStatsResponse,
  SuperAdminDashboardDto,
  HospitalAdminDashboardDto,
  DoctorDashboardDto,
  NurseDashboardDto,
  ReceptionistDashboardDto,
  LabTechnicianDashboardDto,
  PharmacistDashboardDto,
  AccountantDashboardDto,
  PatientDashboardDto,
  UserRole,
} from "@medcore/types";
import {
  Building2,
  Stethoscope,
  Users,
  Calendar,
  Layers,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Pill,
  FlaskConical,
  Package,
  CreditCard,
  HeartPulse,
  Activity,
  AlertCircle,
  RefreshCw,
  PlusCircle,
  TrendingUp,
  Receipt,
  ShieldAlert,
} from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();

  const {
    data: stats,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<DashboardStatsResponse>({
    queryKey: ["dashboard-stats", user?.id, user?.role, user?.hospitalId],
    queryFn: () => apiRequest<DashboardStatsResponse>("/dashboard/stats"),
    enabled: !!user,
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", textAlign: "center" }}>
        <div className="panel" style={{ padding: 32 }}>
          <AlertCircle size={40} style={{ color: "var(--danger)", margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
            Failed to Load Dashboard
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 20px" }}>
            {(error as any)?.message || "Could not retrieve real-time hospital dashboard metrics."}
          </p>
          <button className="btn btn-primary" onClick={() => refetch()}>
            <RefreshCw size={16} />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div>
      {stats.role === UserRole.SUPER_ADMIN && (
        <SuperAdminDashboardView data={stats as SuperAdminDashboardDto} />
      )}
      {stats.role === UserRole.HOSPITAL_ADMIN && (
        <HospitalAdminDashboardView data={stats as HospitalAdminDashboardDto} />
      )}
      {stats.role === UserRole.DOCTOR && (
        <DoctorDashboardView data={stats as DoctorDashboardDto} />
      )}
      {stats.role === UserRole.NURSE && (
        <NurseDashboardView data={stats as NurseDashboardDto} />
      )}
      {stats.role === UserRole.RECEPTIONIST && (
        <ReceptionistDashboardView data={stats as ReceptionistDashboardDto} />
      )}
      {stats.role === UserRole.LAB_TECHNICIAN && (
        <LabTechnicianDashboardView data={stats as LabTechnicianDashboardDto} />
      )}
      {stats.role === UserRole.PHARMACIST && (
        <PharmacistDashboardView data={stats as PharmacistDashboardDto} />
      )}
      {stats.role === UserRole.ACCOUNTANT && (
        <AccountantDashboardView data={stats as AccountantDashboardDto} />
      )}
      {stats.role === UserRole.PATIENT && (
        <PatientDashboardView data={stats as PatientDashboardDto} />
      )}
    </div>
  );
}

// =====================================================================
// A. SUPER ADMIN DASHBOARD VIEW
// =====================================================================
function SuperAdminDashboardView({ data }: { data: SuperAdminDashboardDto }) {
  const total = data.totalAppointments || 1;
  const confirmedPct = Math.round((data.appointmentsByStatus.confirmed / total) * 100);
  const completedPct = Math.round((data.appointmentsByStatus.completed / total) * 100);
  const pendingPct = Math.round((data.appointmentsByStatus.pending / total) * 100);
  const cancelledPct = Math.round((data.appointmentsByStatus.cancelled / total) * 100);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Operations Overview</h1>
          <div className="page-subtitle">
            MedCore HMS Global Tenant Architecture & Multi-Hospital Administration
          </div>
        </div>
        <Link href="/hospitals" className="btn btn-primary">
          <Building2 size={16} />
          <span>Manage Hospitals</span>
        </Link>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Total Hospitals</span>
            <div className="metric-icon-well">
              <Building2 size={18} />
            </div>
          </div>
          <div className="metric-value">{data.totalHospitals}</div>
          <div className="metric-footer">
            <span>Registered healthcare organizations</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Active Tenants</span>
            <div className="metric-icon-well success">
              <Building2 size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--success)" }}>
            {data.activeHospitals}
          </div>
          <div className="metric-footer">
            <span>{data.onboardingHospitals} onboarding &bull; {data.suspendedHospitals} suspended</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Platform Users</span>
            <div className="metric-icon-well purple">
              <Users size={18} />
            </div>
          </div>
          <div className="metric-value">{data.totalUsers}</div>
          <div className="metric-footer">
            <span>Across all 9 clinical & admin roles</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Consulting Doctors</span>
            <div className="metric-icon-well warning">
              <Stethoscope size={18} />
            </div>
          </div>
          <div className="metric-value">{data.totalDoctors}</div>
          <div className="metric-footer">
            <span>{data.totalPatients} registered patients</span>
          </div>
        </div>
      </div>

      <div className="dashboard-split-grid">
        {/* Platform Appointments Distribution */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Calendar size={18} style={{ color: "var(--primary)" }} />
              <span>Platform Appointment Trends</span>
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
              Total: {data.totalAppointments}
            </span>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ width: `${confirmedPct}%`, backgroundColor: "#0284c7" }} title={`Confirmed: ${data.appointmentsByStatus.confirmed}`} />
              <div style={{ width: `${completedPct}%`, backgroundColor: "#10b981" }} title={`Completed: ${data.appointmentsByStatus.completed}`} />
              <div style={{ width: `${pendingPct}%`, backgroundColor: "#f59e0b" }} title={`Pending: ${data.appointmentsByStatus.pending}`} />
              <div style={{ width: `${cancelledPct}%`, backgroundColor: "#ef4444" }} title={`Cancelled: ${data.appointmentsByStatus.cancelled}`} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0284c7" }}>CONFIRMED</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{data.appointmentsByStatus.confirmed}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{confirmedPct}% of total</div>
              </div>
              <div style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981" }}>COMPLETED</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{data.appointmentsByStatus.completed}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{completedPct}% of total</div>
              </div>
              <div style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>PENDING</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{data.appointmentsByStatus.pending}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pendingPct}% of total</div>
              </div>
              <div style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>CANCELLED</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{data.appointmentsByStatus.cancelled}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{cancelledPct}% of total</div>
              </div>
            </div>
          </div>
        </div>

        {/* Registered Hospitals List */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Building2 size={18} style={{ color: "var(--primary)" }} />
              <span>Recent Hospital Tenants</span>
            </h3>
            <Link href="/hospitals" className="btn btn-sm btn-outline">
              View All
            </Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.recentHospitals.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                No registered hospitals found.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.recentHospitals.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      padding: 12,
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{h.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        Code: {h.code} &middot; City: {h.city} &middot; {h.departmentsCount} Depts, {h.doctorsCount} Doctors
                      </div>
                    </div>
                    <div>
                      <span className={`status-badge badge-${h.status.toLowerCase()}`}>
                        {h.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// B. HOSPITAL ADMIN DASHBOARD VIEW
// =====================================================================
function HospitalAdminDashboardView({ data }: { data: HospitalAdminDashboardDto }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{data.hospitalName}</h1>
          <div className="page-subtitle">
            Hospital Administration & Scoped Clinical Operations ({data.hospitalCode})
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/appointments" className="btn btn-primary btn-sm">
            <Calendar size={14} />
            <span>Appointments</span>
          </Link>
          <Link href="/billing" className="btn btn-outline btn-sm">
            <CreditCard size={14} />
            <span>Billing</span>
          </Link>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Registered Patients</span>
            <div className="metric-icon-well">
              <Users size={18} />
            </div>
          </div>
          <div className="metric-value">{data.totalPatients}</div>
          <div className="metric-footer">
            <span>Hospital MRN records</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Medical Staff</span>
            <div className="metric-icon-well success">
              <Stethoscope size={18} />
            </div>
          </div>
          <div className="metric-value">{data.totalDoctors}</div>
          <div className="metric-footer">
            <span>Across {data.totalDepartments} departments</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Today's Appointments</span>
            <div className="metric-icon-well purple">
              <Calendar size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--primary)" }}>
            {data.appointmentsSummary.today}
          </div>
          <div className="metric-footer">
            <span>{data.appointmentsSummary.pending} pending confirmation</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Outstanding Balance</span>
            <div className="metric-icon-well warning">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: data.billingSummary.outstandingBalance > 0 ? "var(--warning)" : "var(--success)" }}>
            ₹{data.billingSummary.outstandingBalance.toLocaleString("en-IN")}
          </div>
          <div className="metric-footer">
            <span>Billed: ₹{data.billingSummary.totalBilled.toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>

      {/* Operational Highlights Grid */}
      <div className="dashboard-triple-grid" style={{ marginBottom: 24 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Calendar size={18} style={{ color: "var(--primary)" }} />
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Appointment Pipeline</h4>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Confirmed Encounters:</span>
              <strong>{data.appointmentsSummary.confirmed}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Pending Triage:</span>
              <strong>{data.appointmentsSummary.pending}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Completed Consultations:</span>
              <strong>{data.appointmentsSummary.completed}</strong>
            </div>
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <FlaskConical size={18} style={{ color: "var(--purple)" }} />
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Laboratory Workflow</h4>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Awaiting Sample:</span>
              <strong>{data.labSummary.pendingCollection}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>In Processing:</span>
              <strong>{data.labSummary.inProgress}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Under Review / Approval:</span>
              <strong>{data.labSummary.underReview}</strong>
            </div>
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Package size={18} style={{ color: "var(--warning)" }} />
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Pharmacy Stock Alerts</h4>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Total Formulary:</span>
              <strong>{data.pharmacySummary.totalMedicines}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--danger)", fontWeight: 600 }}>Low Stock Medicines:</span>
              <strong style={{ color: "var(--danger)" }}>{data.pharmacySummary.lowStockCount}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--warning)", fontWeight: 600 }}>Batches Expiring (&lt;30d):</span>
              <strong style={{ color: "var(--warning)" }}>{data.pharmacySummary.nearExpiryCount}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">Recent Hospital Appointments</h3>
          <Link href="/appointments" className="btn btn-sm btn-outline">
            View All
          </Link>
        </div>
        <div className="table-responsive">
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle)", background: "#f8fafc" }}>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>PATIENT</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>DOCTOR</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>DEPARTMENT</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>DATE & TIME</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {data.recentAppointments.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                    No recent appointments found for this hospital tenant.
                  </td>
                </tr>
              ) : (
                data.recentAppointments.map((a) => (
                  <tr key={a.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600 }}>{a.patientName}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>MRN: {a.patientMrn}</div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>{a.doctorName}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>{a.departmentName}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#0284c7" }}>
                      {a.appointmentDate} @ {a.startTime}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className={`status-badge badge-${a.status.toLowerCase()}`}>{a.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// C. DOCTOR DASHBOARD VIEW
// =====================================================================
function DoctorDashboardView({ data }: { data: DoctorDashboardDto }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Doctor Consultation Workspace</h1>
          <div className="page-subtitle">
            {data.specialization} &bull; Department of {data.departmentName}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/emr" className="btn btn-primary btn-sm">
            <FileText size={14} />
            <span>Clinical EMR</span>
          </Link>
          <Link href="/prescriptions" className="btn btn-outline btn-sm">
            <Pill size={14} />
            <span>Prescriptions</span>
          </Link>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Today's Appointments</span>
            <div className="metric-icon-well">
              <Calendar size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--primary)" }}>
            {data.todayAppointmentsCount}
          </div>
          <div className="metric-footer">
            <span>Scheduled consultations for today</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Upcoming Bookings</span>
            <div className="metric-icon-well purple">
              <Clock size={18} />
            </div>
          </div>
          <div className="metric-value">{data.upcomingAppointmentsCount}</div>
          <div className="metric-footer">
            <span>Future confirmed encounters</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Completed Consultations</span>
            <div className="metric-icon-well success">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--success)" }}>
            {data.totalCompletedConsultations}
          </div>
          <div className="metric-footer">
            <span>Patient encounters successfully closed</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Pending Records (Drafts)</span>
            <div className="metric-icon-well warning">
              <FileText size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: data.pendingRecordsCount > 0 ? "var(--warning)" : "var(--text-main)" }}>
            {data.pendingRecordsCount}
          </div>
          <div className="metric-footer">
            <span>Encounters awaiting sign-off</span>
          </div>
        </div>
      </div>

      {/* Patient Consultation Queue */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-header">
          <h3 className="panel-title">
            <Activity size={18} style={{ color: "var(--primary)" }} />
            <span>Today's Consultation Queue</span>
          </h3>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
            {data.consultationQueue.length} active patients
          </span>
        </div>
        <div className="table-responsive">
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle)", background: "#f8fafc" }}>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>TIME</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>PATIENT DETAILS</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>CHIEF COMPLAINT</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>STATUS</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {data.consultationQueue.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                    No patients currently waiting in consultation queue for today.
                  </td>
                </tr>
              ) : (
                data.consultationQueue.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#0284c7" }}>
                      {c.startTime} - {c.endTime}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{c.patientName}</span>
                        {c.isEmergency && (
                          <span style={{ background: "var(--danger-subtle)", color: "var(--danger)", fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 800 }}>
                            STAT EMERGENCY
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        MRN: {c.patientMrn} &middot; Gender: {c.gender} &middot; DOB: {c.dateOfBirth}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>{c.reason || "Routine Consultation"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className={`status-badge badge-${c.status.toLowerCase()}`}>{c.status}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <Link href={`/emr`} className="btn btn-primary btn-sm">
                        <span>Consult</span>
                        <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two Column: Recent Rx and Lab Orders */}
      <div className="dashboard-split-grid">
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Pill size={18} style={{ color: "var(--primary)" }} />
              <span>Recent Prescriptions Authored</span>
            </h3>
            <Link href="/prescriptions" className="btn btn-sm btn-outline">View All</Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.recentPrescriptions.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No prescriptions yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.recentPrescriptions.map((rx) => (
                  <div key={rx.id} style={{ padding: 10, border: "1px solid var(--border-subtle)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{rx.patientName} (MRN: {rx.patientMrn})</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{rx.itemCount} items &middot; {new Date(rx.createdAt).toLocaleDateString()}</div>
                    </div>
                    <span className={`status-badge badge-${rx.status.toLowerCase()}`}>{rx.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <FlaskConical size={18} style={{ color: "var(--purple)" }} />
              <span>Recent Diagnostic Orders</span>
            </h3>
            <Link href="/laboratory" className="btn btn-sm btn-outline">View All</Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.recentLabOrders.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No lab orders yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.recentLabOrders.map((l) => (
                  <div key={l.id} style={{ padding: 10, border: "1px solid var(--border-subtle)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{l.patientName}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Priority: {l.priority} &middot; {l.testsCount} tests &middot; {new Date(l.orderDate).toLocaleDateString()}</div>
                    </div>
                    <span className={`status-badge badge-${l.status.toLowerCase()}`}>{l.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// D. NURSE DASHBOARD VIEW
// =====================================================================
function NurseDashboardView({ data }: { data: NurseDashboardDto }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Nursing Station & Triage</h1>
          <div className="page-subtitle">{data.hospitalName} &bull; Inpatient & Outpatient Clinical Triage</div>
        </div>
        <Link href="/emr" className="btn btn-primary btn-sm">
          <HeartPulse size={14} />
          <span>Record Vitals</span>
        </Link>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Today's Encounters</span>
            <div className="metric-icon-well">
              <Calendar size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--primary)" }}>{data.todayAppointmentsCount}</div>
          <div className="metric-footer">
            <span>Outpatients arriving for triage</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">In-Progress Consults</span>
            <div className="metric-icon-well warning">
              <Activity size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--warning)" }}>{data.inProgressConsultationsCount}</div>
          <div className="metric-footer">
            <span>Doctors currently consulting</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Hospital Registry</span>
            <div className="metric-icon-well success">
              <Users size={18} />
            </div>
          </div>
          <div className="metric-value">{data.totalActivePatients}</div>
          <div className="metric-footer">
            <span>Total registered patients</span>
          </div>
        </div>
      </div>

      <div className="dashboard-split-grid">
        {/* Today's Queue */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Clock size={18} style={{ color: "var(--primary)" }} />
              <span>Active Patient Flow (Today)</span>
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>{data.todayPatientQueue.length} in queue</span>
          </div>
          <div style={{ padding: 16 }}>
            {data.todayPatientQueue.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No patients in flow today.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.todayPatientQueue.map((q) => (
                  <div key={q.id} style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{q.patientName} (MRN: {q.patientMrn})</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {q.doctorName} &middot; {q.departmentName} &middot; Time: {q.startTime}
                      </div>
                    </div>
                    <span className={`status-badge badge-${q.status.toLowerCase()}`}>{q.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Vitals */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <HeartPulse size={18} style={{ color: "var(--danger)" }} />
              <span>Recent Vital Signs Recorded</span>
            </h3>
            <Link href="/emr" className="btn btn-sm btn-outline">Vitals Ledger</Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.recentVitalsRecorded.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No vitals recorded recently.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.recentVitalsRecorded.map((v) => (
                  <div key={v.id} style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{v.patientName} (MRN: {v.patientMrn})</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(v.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#0f172a" }}>
                      <span>BP: <strong>{v.bloodPressure}</strong></span>
                      {v.heartRate && <span>Pulse: <strong>{v.heartRate} bpm</strong></span>}
                      {v.temperature && <span>Temp: <strong>{v.temperature}</strong></span>}
                      {v.oxygenSaturation && <span>SpO2: <strong>{v.oxygenSaturation}%</strong></span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// E. RECEPTIONIST DASHBOARD VIEW
// =====================================================================
function ReceptionistDashboardView({ data }: { data: ReceptionistDashboardDto }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Front Desk & Reception</h1>
          <div className="page-subtitle">{data.hospitalName} &bull; Patient Check-In & Scheduling Shortcuts</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/appointments" className="btn btn-primary btn-sm">
            <Calendar size={14} />
            <span>Book Appointment</span>
          </Link>
          <Link href="/patients" className="btn btn-secondary btn-sm">
            <Users size={14} />
            <span>Register Patient</span>
          </Link>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Today's Appointments</span>
            <div className="metric-icon-well">
              <Calendar size={18} />
            </div>
          </div>
          <div className="metric-value">{data.todaySummary.total}</div>
          <div className="metric-footer">
            <span>{data.todaySummary.confirmed} confirmed bookings</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">In-Progress Triage</span>
            <div className="metric-icon-well purple">
              <Activity size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--primary)" }}>{data.todaySummary.inProgress}</div>
          <div className="metric-footer">
            <span>Patients currently with doctor</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Pending Confirmation</span>
            <div className="metric-icon-well warning">
              <Clock size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--warning)" }}>{data.todaySummary.pending}</div>
          <div className="metric-footer">
            <span>Awaiting receptionist check-in</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Uncollected Invoices</span>
            <div className="metric-icon-well danger">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--danger)" }}>
            ₹{data.pendingInvoicesBalance.toLocaleString("en-IN")}
          </div>
          <div className="metric-footer">
            <span>{data.pendingInvoicesCount} invoices pending checkout</span>
          </div>
        </div>
      </div>

      <div className="dashboard-split-grid">
        {/* Today's Schedule */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">Today's Appointment Schedule</h3>
            <Link href="/appointments" className="btn btn-sm btn-outline">Calendar</Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.todaySchedule.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No appointments scheduled today.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.todaySchedule.map((s) => (
                  <div key={s.id} style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.patientName} (MRN: {s.patientMrn})</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {s.doctorName} &middot; {s.departmentName} &middot; {s.startTime} - {s.endTime}
                      </div>
                    </div>
                    <span className={`status-badge badge-${s.status.toLowerCase()}`}>{s.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Registrations */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">Recent Patient Registrations</h3>
            <Link href="/patients" className="btn btn-sm btn-outline">Patients</Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.recentRegistrations.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No recent registrations.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.recentRegistrations.map((p) => (
                  <div key={p.id} style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name} (MRN: {p.mrn})</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Phone: {p.phone} &middot; Gender: {p.gender}</div>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// F. LAB TECHNICIAN DASHBOARD VIEW
// =====================================================================
function LabTechnicianDashboardView({ data }: { data: LabTechnicianDashboardDto }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Diagnostic Laboratory Workspace</h1>
          <div className="page-subtitle">{data.hospitalName} &bull; Specimen Processing & Pathology Pipeline</div>
        </div>
        <Link href="/laboratory" className="btn btn-primary btn-sm">
          <FlaskConical size={14} />
          <span>Diagnostic Catalogue</span>
        </Link>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Awaiting Sample</span>
            <div className="metric-icon-well warning">
              <FlaskConical size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--warning)" }}>{data.workflowSummary.awaitingSample}</div>
          <div className="metric-footer">
            <span>Ordered tests needing phlebotomy</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Samples Collected</span>
            <div className="metric-icon-well">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--primary)" }}>{data.workflowSummary.sampleCollected}</div>
          <div className="metric-footer">
            <span>In laboratory receiving queue</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">In Processing</span>
            <div className="metric-icon-well purple">
              <Activity size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--purple)" }}>{data.workflowSummary.processing}</div>
          <div className="metric-footer">
            <span>Currently running on analyzers</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Pending Review</span>
            <div className="metric-icon-well success">
              <FileText size={18} />
            </div>
          </div>
          <div className="metric-value">{data.workflowSummary.underReview}</div>
          <div className="metric-footer">
            <span>{data.workflowSummary.completed} tests finalized & approved</span>
          </div>
        </div>
      </div>

      {data.priorityStatCount > 0 && (
        <div className="alert alert-error" style={{ marginBottom: 20 }}>
          <AlertTriangle size={18} />
          <span>
            <strong>{data.priorityStatCount} STAT/Urgent tests</strong> require immediate sample processing and pathology sign-off!
          </span>
        </div>
      )}

      {/* Active Lab Orders Queue */}
      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">
            <FlaskConical size={18} style={{ color: "var(--primary)" }} />
            <span>Active Laboratory Work Queue</span>
          </h3>
          <Link href="/laboratory" className="btn btn-sm btn-outline">Full Laboratory</Link>
        </div>
        <div className="table-responsive">
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle)", background: "#f8fafc" }}>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>ORDER #</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>PATIENT</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>ORDERED TESTS</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>ORDERING DOCTOR</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>PRIORITY</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>STATUS</th>
                <th style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {data.activeQueue.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                    No active laboratory orders awaiting action.
                  </td>
                </tr>
              ) : (
                data.activeQueue.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13 }}>{o.orderNumber}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600 }}>{o.patientName}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>MRN: {o.patientMrn}</div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>{o.testNames.join(", ") || "Lab Profile"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>{o.doctorName}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className={`status-badge badge-${o.priority.toLowerCase()}`}>{o.priority}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className={`status-badge badge-${o.status.toLowerCase()}`}>{o.status}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <Link href="/laboratory" className="btn btn-secondary btn-sm">Process</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// G. PHARMACIST DASHBOARD VIEW
// =====================================================================
function PharmacistDashboardView({ data }: { data: PharmacistDashboardDto }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pharmacy & Inventory Station</h1>
          <div className="page-subtitle">{data.hospitalName} &bull; Prescription Dispensing & Formulary Stock Ledger</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/prescriptions" className="btn btn-primary btn-sm">
            <Pill size={14} />
            <span>Prescriptions Queue</span>
          </Link>
          <Link href="/pharmacy" className="btn btn-outline btn-sm">
            <Package size={14} />
            <span>Formulary & Stock</span>
          </Link>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Pending Dispensing</span>
            <div className="metric-icon-well warning">
              <Clock size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--warning)" }}>{data.prescriptionsQueue.pending}</div>
          <div className="metric-footer">
            <span>{data.prescriptionsQueue.partiallyDispensed} partially dispensed</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Dispensed Today</span>
            <div className="metric-icon-well success">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--success)" }}>{data.prescriptionsQueue.dispensedToday}</div>
          <div className="metric-footer">
            <span>Completed fulfillments today</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Low Stock Formulary</span>
            <div className="metric-icon-well danger">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: data.inventorySummary.lowStockCount > 0 ? "var(--danger)" : "var(--text-main)" }}>
            {data.inventorySummary.lowStockCount}
          </div>
          <div className="metric-footer">
            <span>Medicines at/below reorder level</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Near-Expiry Batches</span>
            <div className="metric-icon-well warning">
              <ShieldAlert size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: data.inventorySummary.nearExpiryCount > 0 ? "var(--warning)" : "var(--text-main)" }}>
            {data.inventorySummary.nearExpiryCount}
          </div>
          <div className="metric-footer">
            <span>Expiring within 30 days</span>
          </div>
        </div>
      </div>

      <div className="dashboard-split-grid">
        {/* Dispensing Queue */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Pill size={18} style={{ color: "var(--primary)" }} />
              <span>Prescriptions Awaiting Dispensing</span>
            </h3>
            <Link href="/prescriptions" className="btn btn-sm btn-outline">View All</Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.dispensingQueue.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                No pending prescriptions to dispense.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.dispensingQueue.map((d) => (
                  <div key={d.id} style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{d.patientName} (MRN: {d.patientMrn})</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        By {d.doctorName} &middot; {d.itemCount} medicines &middot; {new Date(d.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Link href={`/prescriptions`} className="btn btn-primary btn-sm">Dispense</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Low Stock Items */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Package size={18} style={{ color: "var(--danger)" }} />
              <span>Low Stock Formulary Alerts</span>
            </h3>
            <Link href="/pharmacy" className="btn btn-sm btn-outline">Inventory</Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.lowStockItems.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                All formulary stock levels are healthy.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.lowStockItems.map((m) => (
                  <div key={m.id} style={{ padding: 12, border: "1px solid #fee2e2", background: "#fff5f5", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#991b1b" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "#7f1d1d" }}>
                        Code: {m.code} &middot; Category: {m.category}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--danger)" }}>
                        {m.currentStock} units
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Reorder: {m.reorderLevel}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// H. ACCOUNTANT DASHBOARD VIEW
// =====================================================================
function AccountantDashboardView({ data }: { data: AccountantDashboardDto }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hospital Billing & Financial Reconciliations</h1>
          <div className="page-subtitle">{data.hospitalName} &bull; Authoritative Revenue & Invoicing Metrics</div>
        </div>
        <Link href="/billing" className="btn btn-primary btn-sm">
          <CreditCard size={14} />
          <span>Billing Operations</span>
        </Link>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Total Billed Revenue</span>
            <div className="metric-icon-well">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="metric-value">₹{data.financialMetrics.totalBilled.toLocaleString("en-IN")}</div>
          <div className="metric-footer">
            <span>From {data.financialMetrics.totalInvoices} non-void invoices</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Total Collected</span>
            <div className="metric-icon-well success">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--success)" }}>
            ₹{data.financialMetrics.totalCollected.toLocaleString("en-IN")}
          </div>
          <div className="metric-footer">
            <span>{data.statusBreakdown.paid} fully paid invoices</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Outstanding Balance</span>
            <div className="metric-icon-well warning">
              <AlertCircle size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: data.financialMetrics.outstandingBalance > 0 ? "var(--warning)" : "var(--success)" }}>
            ₹{data.financialMetrics.outstandingBalance.toLocaleString("en-IN")}
          </div>
          <div className="metric-footer">
            <span>Uncollected patient balances</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Partially Paid / Due</span>
            <div className="metric-icon-well danger">
              <Receipt size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--danger)" }}>
            {data.statusBreakdown.partiallyPaid + data.statusBreakdown.issued}
          </div>
          <div className="metric-footer">
            <span>{data.statusBreakdown.overdue} overdue invoices</span>
          </div>
        </div>
      </div>

      <div className="dashboard-split-grid">
        {/* Recent Payments Received */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <CreditCard size={18} style={{ color: "var(--success)" }} />
              <span>Recent Cash Counter & Gateway Payments</span>
            </h3>
            <Link href="/billing" className="btn btn-sm btn-outline">Ledger</Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.recentPayments.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No payments recorded yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.recentPayments.map((p) => (
                  <div key={p.id} style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.patientName}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Inv: {p.invoiceNumber} &middot; Method: {p.paymentMethod} &middot; {new Date(p.paidAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, color: "var(--success)", fontSize: 14 }}>
                        ₹{p.amount.toLocaleString("en-IN")}
                      </div>
                      <span className={`status-badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Receipt size={18} style={{ color: "var(--primary)" }} />
              <span>Recent Hospital Invoices</span>
            </h3>
            <Link href="/billing" className="btn btn-sm btn-outline">Invoices</Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.recentInvoices.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No invoices generated yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.recentInvoices.map((i) => (
                  <div key={i.id} style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{i.patientName} (MRN: {i.patientMrn})</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {i.invoiceNumber} &middot; {new Date(i.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>₹{i.totalAmount.toLocaleString("en-IN")}</div>
                      <div style={{ fontSize: 11, color: i.balanceAmount > 0 ? "var(--warning)" : "var(--success)" }}>
                        Bal: ₹{i.balanceAmount.toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// I. PATIENT DASHBOARD VIEW
// =====================================================================
function PatientDashboardView({ data }: { data: PatientDashboardDto }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome, {data.patientName}!</h1>
          <div className="page-subtitle">
            MRN: {data.mrn} &bull; {data.hospitalName} Patient Portal
          </div>
        </div>
        <Link href="/portal" className="btn btn-primary btn-sm">
          <HeartPulse size={14} />
          <span>Patient Portal Hub</span>
        </Link>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Upcoming Visits</span>
            <div className="metric-icon-well">
              <Calendar size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--primary)" }}>
            {data.upcomingAppointments.length}
          </div>
          <div className="metric-footer">
            <span>Scheduled doctor consultations</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Active Prescriptions</span>
            <div className="metric-icon-well purple">
              <Pill size={18} />
            </div>
          </div>
          <div className="metric-value">{data.activePrescriptionsCount}</div>
          <div className="metric-footer">
            <span>Medications in active treatment</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Approved Lab Reports</span>
            <div className="metric-icon-well success">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: "var(--success)" }}>
            {data.approvedLabReportsCount}
          </div>
          <div className="metric-footer">
            <span>Certified diagnostic tests</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-title">Outstanding Balance</span>
            <div className="metric-icon-well warning">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: data.invoicesSummary.outstandingBalance > 0 ? "var(--warning)" : "var(--success)" }}>
            ₹{data.invoicesSummary.outstandingBalance.toLocaleString("en-IN")}
          </div>
          <div className="metric-footer">
            <span>{data.invoicesSummary.totalInvoices} total bills issued</span>
          </div>
        </div>
      </div>

      <div className="dashboard-split-grid">
        {/* Upcoming Appointments */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Calendar size={18} style={{ color: "var(--primary)" }} />
              <span>My Upcoming Appointments</span>
            </h3>
            <Link href="/appointments" className="btn btn-sm btn-outline">Schedule</Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.upcomingAppointments.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                No upcoming appointments. Schedule your next visit with our medical specialists.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.upcomingAppointments.map((a) => (
                  <div key={a.id} style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.doctorName}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {a.departmentName} &middot; {a.specialization}
                      </div>
                      <div style={{ fontSize: 12, color: "#0284c7", marginTop: 2 }}>
                        {a.appointmentDate} @ {a.startTime}
                      </div>
                    </div>
                    <span className={`status-badge badge-${a.status.toLowerCase()}`}>{a.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* My Prescriptions */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Pill size={18} style={{ color: "var(--primary)" }} />
              <span>Recent Prescriptions</span>
            </h3>
            <Link href="/prescriptions" className="btn btn-sm btn-outline">View All</Link>
          </div>
          <div style={{ padding: 16 }}>
            {data.recentPrescriptions.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No prescriptions found.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.recentPrescriptions.map((r) => (
                  <div key={r.id} style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>Prescribed by {r.doctorName}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.medicinesSummary}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Date: {new Date(r.createdAt).toLocaleDateString()}</div>
                    </div>
                    <span className={`status-badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// SKELETON PLACEHOLDER
// =====================================================================
function DashboardSkeleton() {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div className="skeleton" style={{ width: 280, height: 28, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: 400, height: 16 }} />
      </div>

      <div className="metrics-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="metric-card" style={{ minHeight: 128 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div className="skeleton" style={{ width: "50%", height: 14 }} />
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
            </div>
            <div className="skeleton" style={{ width: "35%", height: 32, marginBottom: 12 }} />
            <div className="skeleton" style={{ width: "70%", height: 12 }} />
          </div>
        ))}
      </div>

      <div className="dashboard-split-grid">
        <div className="panel" style={{ minHeight: 280, padding: 24 }}>
          <div className="skeleton" style={{ width: 200, height: 20, marginBottom: 20 }} />
          <div className="skeleton" style={{ width: "100%", height: 180 }} />
        </div>
        <div className="panel" style={{ minHeight: 280, padding: 24 }}>
          <div className="skeleton" style={{ width: 200, height: 20, marginBottom: 20 }} />
          <div className="skeleton" style={{ width: "100%", height: 180 }} />
        </div>
      </div>
    </div>
  );
}
