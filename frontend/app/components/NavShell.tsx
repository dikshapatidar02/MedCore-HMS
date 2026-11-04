"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import {
  Building2,
  Stethoscope,
  Users,
  Calendar,
  Layers,
  LayoutDashboard,
  LogOut,
  Shield,
  Activity,
  FileText,
  Pill,
  FlaskConical,
  Package,
  CreditCard,
  Bell,
  HeartPulse,
  Menu,
  X,
  UserCheck,
} from "lucide-react";

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, login, logout } = useAuth();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on route transition
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const fetchUnread = async () => {
      try {
        const res = await apiRequest<{ count: number }>("/notifications/unread-count");
        if (isMounted && res && typeof res.count === "number") {
          setUnreadCount(res.count);
        }
      } catch {
        // Soft fallback
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user, pathname]);

  const isDevMode = process.env.NODE_ENV !== "production";

  const demoAccounts = [
    { label: "Super Admin", email: "superadmin@medcore.io", role: "SUPER_ADMIN" },
    { label: "Apex Admin", email: "admin.apex@medcore.io", role: "HOSPITAL_ADMIN" },
    { label: "Apex Doctor", email: "dr.arun.sharma@apexhealth.org", role: "DOCTOR" },
    { label: "Apex Nurse", email: "nurse.apex@medcore.io", role: "NURSE" },
    { label: "Apex Pharmacist", email: "pharma.apex@medcore.io", role: "PHARMACIST" },
    { label: "Apex Lab Tech", email: "lab.apex@medcore.io", role: "LAB_TECHNICIAN" },
    { label: "Apex Accountant", email: "billing.apex@medcore.io", role: "ACCOUNTANT" },
    { label: "Apex Receptionist", email: "reception.apex@medcore.io", role: "RECEPTIONIST" },
    { label: "Patient (Rajesh)", email: "patient.rajesh.sharma0@example.com", role: "PATIENT" },
  ];

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      await login(loginEmail, loginPassword);
    } catch (err: any) {
      setLoginError(err.message || "Failed to sign in. Please check credentials.");
    }
  };

  const getNavItems = () => {
    switch (user?.role) {
      case "SUPER_ADMIN":
        return [
          { label: "Overview", href: "/", icon: LayoutDashboard },
          { label: "Hospitals", href: "/hospitals", icon: Building2 },
          { label: "Departments", href: "/departments", icon: Layers },
          { label: "Doctors", href: "/doctors", icon: Stethoscope },
          { label: "Patients", href: "/patients", icon: Users },
          { label: "Appointments", href: "/appointments", icon: Calendar },
          { label: "Clinical EMR", href: "/emr", icon: FileText },
          { label: "Prescriptions", href: "/prescriptions", icon: Pill },
          { label: "Laboratory", href: "/laboratory", icon: FlaskConical },
          { label: "Pharmacy", href: "/pharmacy", icon: Package },
          { label: "Billing", href: "/billing", icon: CreditCard },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ];
      case "HOSPITAL_ADMIN":
        return [
          { label: "Dashboard", href: "/", icon: LayoutDashboard },
          { label: "Departments", href: "/departments", icon: Layers },
          { label: "Doctors", href: "/doctors", icon: Stethoscope },
          { label: "Patients", href: "/patients", icon: Users },
          { label: "Appointments", href: "/appointments", icon: Calendar },
          { label: "Clinical EMR", href: "/emr", icon: FileText },
          { label: "Prescriptions", href: "/prescriptions", icon: Pill },
          { label: "Laboratory", href: "/laboratory", icon: FlaskConical },
          { label: "Pharmacy", href: "/pharmacy", icon: Package },
          { label: "Billing", href: "/billing", icon: CreditCard },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ];
      case "DOCTOR":
        return [
          { label: "Doctor Dashboard", href: "/", icon: LayoutDashboard },
          { label: "My Appointments", href: "/appointments", icon: Calendar },
          { label: "Clinical EMR", href: "/emr", icon: FileText },
          { label: "Prescriptions", href: "/prescriptions", icon: Pill },
          { label: "Laboratory", href: "/laboratory", icon: FlaskConical },
          { label: "Patients Directory", href: "/patients", icon: Users },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ];
      case "NURSE":
        return [
          { label: "Nursing Dashboard", href: "/", icon: LayoutDashboard },
          { label: "Patient Queue", href: "/appointments", icon: Calendar },
          { label: "Patients Directory", href: "/patients", icon: Users },
          { label: "Clinical EMR", href: "/emr", icon: FileText },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ];
      case "RECEPTIONIST":
        return [
          { label: "Front Desk Dashboard", href: "/", icon: LayoutDashboard },
          { label: "Appointments", href: "/appointments", icon: Calendar },
          { label: "Patient Registration", href: "/patients", icon: Users },
          { label: "Doctor Directory", href: "/doctors", icon: Stethoscope },
          { label: "Departments", href: "/departments", icon: Layers },
          { label: "Billing", href: "/billing", icon: CreditCard },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ];
      case "LAB_TECHNICIAN":
        return [
          { label: "Lab Dashboard", href: "/", icon: LayoutDashboard },
          { label: "Laboratory Orders", href: "/laboratory", icon: FlaskConical },
          { label: "Patients Lookup", href: "/patients", icon: Users },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ];
      case "PHARMACIST":
        return [
          { label: "Pharmacy Dashboard", href: "/", icon: LayoutDashboard },
          { label: "Prescriptions Queue", href: "/prescriptions", icon: Pill },
          { label: "Formulary & Stock", href: "/pharmacy", icon: Package },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ];
      case "ACCOUNTANT":
        return [
          { label: "Billing Dashboard", href: "/", icon: LayoutDashboard },
          { label: "Invoices & Payments", href: "/billing", icon: CreditCard },
          { label: "Patients Directory", href: "/patients", icon: Users },
          { label: "Appointments", href: "/appointments", icon: Calendar },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ];
      case "PATIENT":
        return [
          { label: "My Dashboard", href: "/", icon: LayoutDashboard },
          { label: "Patient Portal", href: "/portal", icon: HeartPulse },
          { label: "My Prescriptions", href: "/prescriptions", icon: Pill },
          { label: "My Lab Reports", href: "/laboratory", icon: FlaskConical },
          { label: "My Invoices", href: "/billing", icon: CreditCard },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ];
      default:
        return [
          { label: "Dashboard", href: "/", icon: LayoutDashboard },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ];
    }
  };

  const navItems = getNavItems();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Activity
            className="animate-spin"
            style={{ width: 36, height: 36, color: "var(--primary)", margin: "0 auto 12px" }}
          />
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Connecting to MedCore HMS...</div>
        </div>
      </div>
    );
  }

  // Not logged in -> Show Authentication Portal
  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            background: "#ffffff",
            borderRadius: 20,
            padding: 36,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "linear-gradient(135deg, #0284c7, #06b6d4)",
                display: "grid",
                placeItems: "center",
                color: "white",
              }}
            >
              <Activity size={24} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>MedCore HMS</div>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                Enterprise Hospital SaaS
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "20px 0 6px", color: "#0f172a" }}>
            Sign In to Clinical Workspace
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>
            Select an authorized role or sign in with registered credentials.
          </p>

          {loginError && <div className="alert alert-error">{loginError}</div>}

          <form onSubmit={handleManualLogin}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-control"
                placeholder="name@hospital.org"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            >
              Sign In
            </button>
          </form>

          {isDevMode && (
            <>
              <div
                style={{
                  margin: "24px 0 14px",
                  textAlign: "center",
                  fontSize: 12,
                  color: "#94a3b8",
                  position: "relative",
                }}
              >
                <span>Development Quick-Fill Email Helper</span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: 11, padding: "4px 8px" }}
                    onClick={() => {
                      setLoginEmail(acc.email);
                      setLoginPassword("");
                    }}
                    title={`Fill ${acc.email}`}
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <Activity style={{ color: "#38bdf8" }} />
            <span>MedCore HMS</span>
            <span className="brand-badge">PHASE 13</span>
          </div>
          <button
            className="mobile-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close Navigation"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "active" : ""}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Shield size={14} style={{ color: "#38bdf8" }} />
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>Multi-Tenant Guard</span>
          </div>
          <div style={{ color: "#64748b" }}>
            Hospital: {user.hospitalId ? user.hospitalId.slice(0, 14) + "..." : "Global / Cross-Tenant"}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        <header className="top-navbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="mobile-hamburger-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open Navigation Menu"
            >
              <Menu size={20} />
            </button>

            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#0369a1",
                background: "#e0f2fe",
                padding: "4px 10px",
                borderRadius: 6,
              }}
            >
              TENANT: {user.hospitalId || "SUPER_ADMIN_SCOPE"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link
              href="/notifications"
              className="btn btn-ghost btn-sm"
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px 10px",
                borderRadius: 8,
              }}
              title="Notifications"
            >
              <Bell size={18} style={{ color: "#475569" }} />
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 4,
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: 9999,
                    background: "#ef4444",
                    color: "#ffffff",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                {user.firstName} {user.lastName}
              </div>
              <div style={{ fontSize: 11, color: "#0284c7", fontWeight: 700 }}>
                {user.role}
              </div>
            </div>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => logout()}
              title="Sign Out"
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <main className="content-body">{children}</main>
      </div>
    </div>
  );
}
