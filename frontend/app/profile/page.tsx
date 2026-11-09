"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "../lib/auth-context";
import {
  User,
  Building2,
  Shield,
  Mail,
  Phone,
  CheckCircle2,
  Stethoscope,
  HeartPulse,
  LogOut,
  ArrowLeft,
  KeyRound,
  Calendar,
  Layers,
  Hospital,
} from "lucide-react";

function formatRole(role?: string): string {
  if (!role) return "Clinical Staff";
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Administrator";
    case "HOSPITAL_ADMIN":
      return "Hospital Administrator";
    case "DOCTOR":
      return "Consulting Physician";
    case "NURSE":
      return "Registered Nurse";
    case "RECEPTIONIST":
      return "Front Desk Officer";
    case "LAB_TECHNICIAN":
      return "Laboratory Specialist";
    case "PHARMACIST":
      return "Chief Pharmacist";
    case "ACCOUNTANT":
      return "Financial Accountant";
    case "PATIENT":
      return "Patient Portal User";
    default:
      return role.replace(/_/g, " ");
  }
}

export default function ProfilePage() {
  const { user, logout } = useAuth();

  const userInitials =
    ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")) ||
    (user?.email?.[0] || "U").toUpperCase();

  const hospitalName =
    (user as any)?.hospital?.name ||
    (user?.hospitalId === "hosp-apex-001"
      ? "Apex Multispecialty Hospital"
      : user?.hospitalId === "hosp-demo-001"
        ? "MedCore Demo Hospital"
        : user?.hospitalId
          ? user.hospitalId
          : "Global Platform System");

  const hospitalCode =
    (user as any)?.hospital?.code ||
    (user?.hospitalId === "hosp-demo-001"
      ? "DEMO-MAIN"
      : user?.hospitalId === "hosp-apex-001"
        ? "APEX-MAIN"
        : user?.hospitalId || "PLATFORM-GLOBAL");

  return (
    <div className="page-container" style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 48 }}>
      {/* Navigation Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/"
          className="btn btn-ghost btn-sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#64748b", paddingLeft: 0 }}
        >
          <ArrowLeft size={14} />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      {/* Hero Profile Header Panel */}
      <div
        className="panel"
        style={{
          padding: 24,
          marginBottom: 24,
          background: "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)",
          border: "1px solid #bae6fd",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                fontSize: 22,
                fontWeight: 700,
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.25)",
              }}
            >
              {userInitials}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                  {user?.firstName} {user?.lastName}
                </h1>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#0369a1",
                    background: "#e0f2fe",
                    padding: "3px 9px",
                    borderRadius: 9999,
                  }}
                >
                  <Shield size={11} />
                  {formatRole(user?.role)}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#166534",
                    background: "#dcfce7",
                    padding: "3px 9px",
                    borderRadius: 9999,
                  }}
                >
                  <CheckCircle2 size={11} />
                  Active Account
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, color: "#64748b", fontSize: 13 }}>
                <Hospital size={14} style={{ color: "#0284c7" }} />
                <span style={{ fontWeight: 600, color: "#334155" }}>{hospitalName}</span>
                <span>•</span>
                <span>Code: {hospitalCode}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => logout()}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#dc2626", borderColor: "#fecaca" }}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Grid of Profile Information */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        {/* Personal & Contact Information */}
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <User size={16} style={{ color: "#0284c7" }} />
            <span>Personal &amp; Contact Information</span>
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Full Name</span>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a" }}>
                {user?.firstName} {user?.lastName}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Email Address</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, color: "#0f172a" }}>
                <Mail size={13} style={{ color: "#64748b" }} />
                <span>{user?.email}</span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Phone Number</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, color: "#0f172a" }}>
                <Phone size={13} style={{ color: "#64748b" }} />
                <span>{user?.phone || "Not registered"}</span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>User Account ID</span>
              <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b", background: "#f8fafc", padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                {user?.id}
              </div>
            </div>
          </div>
        </div>

        {/* Hospital Tenancy & Organization */}
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Building2 size={16} style={{ color: "#0284c7" }} />
            <span>Hospital Tenancy &amp; Organization</span>
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Hospital Name</span>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a" }}>
                {hospitalName}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Hospital Code</span>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0369a1" }}>
                {hospitalCode}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Tenancy Boundary</span>
              <div style={{ fontSize: 13, color: "#475569" }}>
                {user?.role === "SUPER_ADMIN"
                  ? "Global Tenancy — Authorized across all healthcare tenant networks"
                  : "Strict Hospital Isolation — Scoped strictly to your healthcare organization"}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Hospital ID</span>
              <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b", background: "#f8fafc", padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                {user?.hospitalId || "platform-global-superadmin"}
              </div>
            </div>
          </div>
        </div>

        {/* Clinical / Role Specialization Details */}
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Stethoscope size={16} style={{ color: "#0284c7" }} />
            <span>Role &amp; Professional Specialization</span>
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Primary Role</span>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a" }}>
                {formatRole(user?.role)}
              </div>
            </div>

            {user?.doctorProfile && (
              <>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Medical License Number</span>
                  <div style={{ fontSize: 13.5, color: "#0f172a", fontWeight: 600 }}>
                    {user.doctorProfile.licenseNumber}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Clinical Specialization</span>
                  <div style={{ fontSize: 13.5, color: "#0f172a" }}>
                    {user.doctorProfile.specialization}
                  </div>
                </div>
                {user.doctorProfile.department && (
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Clinical Department</span>
                    <div style={{ fontSize: 13.5, color: "#0f172a" }}>
                      {user.doctorProfile.department.name} ({user.doctorProfile.department.code})
                    </div>
                  </div>
                )}
              </>
            )}

            {user?.patientProfile && (
              <>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Medical Record Number (MRN)</span>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0284c7" }}>
                    {user.patientProfile.mrn}
                  </div>
                </div>
                {user.patientProfile.bloodGroup && (
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Blood Group</span>
                    <div style={{ fontSize: 13.5, color: "#0f172a" }}>
                      {user.patientProfile.bloodGroup}
                    </div>
                  </div>
                )}
              </>
            )}

            {!user?.doctorProfile && !user?.patientProfile && (
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Operational Scope</span>
                <div style={{ fontSize: 13, color: "#475569" }}>
                  {user?.role === "HOSPITAL_ADMIN" && "Full administrative control over hospital staff, departments, and finances."}
                  {user?.role === "NURSE" && "Inpatient care station, patient queue management, and vitals recording."}
                  {user?.role === "RECEPTIONIST" && "Front desk scheduling, patient registration, and point-of-sale cashiering."}
                  {user?.role === "PHARMACIST" && "Medication dispensing, formulary stock management, and prescription fulfillment."}
                  {user?.role === "LAB_TECHNICIAN" && "Specimen processing, diagnostic orders, and laboratory results authorization."}
                  {user?.role === "ACCOUNTANT" && "Financial invoicing, payments processing, and billing audit."}
                  {user?.role === "SUPER_ADMIN" && "Global platform administration, hospital approvals, and platform governance."}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security & Access Session */}
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={16} style={{ color: "#0284c7" }} />
            <span>Security &amp; Session Controls</span>
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Session Encryption</span>
              <div style={{ fontSize: 13, color: "#166534", fontWeight: 600 }}>
                256-bit TLS • Cryptographically Signed JWT
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Compliance Standard</span>
              <div style={{ fontSize: 13, color: "#475569" }}>
                HIPAA &amp; NABH Architectural Data Isolation
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>RBAC Role Key</span>
              <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b", background: "#f8fafc", padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                {user?.role}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

