"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { apiRequest, API_BASE } from "../lib/api";
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
  ChevronLeft,
  ChevronRight,
  Lock,
  Hospital,
  Eye,
  EyeOff,
  User,
  Mail,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  UserPlus,
  KeyRound,
  Loader2,
  Search,
  RefreshCw,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  section?: string;
}

// ─── Validation helpers ────────────────────────────────────────────────────
function validateEmail(email: string): string | null {
  if (!email.trim()) return "Email address is required.";
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return "Please enter a valid email address.";
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  return null;
}

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "#e2e8f0" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Weak", color: "#ef4444" };
  if (score <= 2) return { score, label: "Fair", color: "#f59e0b" };
  if (score <= 3) return { score, label: "Good", color: "#0284c7" };
  return { score, label: "Strong", color: "#059669" };
}

// ─── Password input with toggle ────────────────────────────────────────────
function PasswordInput({
  value,
  onChange,
  placeholder,
  id,
  autoComplete,
  hasError,
  showStrength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  id: string;
  autoComplete: string;
  hasError?: boolean;
  showStrength?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const strength = showStrength ? getPasswordStrength(value) : null;

  return (
    <div>
      <div className="auth-input-wrapper">
        <span className="auth-input-icon">
          <KeyRound size={16} />
        </span>
        <input
          id={id}
          type={visible ? "text" : "password"}
          className={`auth-input auth-input-padded${hasError ? " auth-input-error" : ""}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="auth-eye-btn"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          title={visible ? "Hide password" : "Show password"}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {showStrength && value && (
        <div className="auth-strength-bar-wrap">
          <div className="auth-strength-track">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="auth-strength-segment"
                style={{
                  backgroundColor: i <= strength!.score ? strength!.color : "#e2e8f0",
                  transition: "background-color 0.3s ease",
                }}
              />
            ))}
          </div>
          {strength!.label && (
            <span className="auth-strength-label" style={{ color: strength!.color }}>
              {strength!.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatRoleName(role?: string): string {
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
      return "Patient Portal";
    default:
      return role.replace(/_/g, " ");
  }
}

// ─── Main NavShell ─────────────────────────────────────────────────────────
export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, initError, login, logout, retryAuth, clearAuth } = useAuth();

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginEmailErr, setLoginEmailErr] = useState<string | null>(null);
  const [loginPasswordErr, setLoginPasswordErr] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginTouched, setLoginTouched] = useState({ email: false, password: false });

  // Register state
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regHospital, setRegHospital] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [isRegSubmitting, setIsRegSubmitting] = useState(false);
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});
  const [regTouched, setRegTouched] = useState<Record<string, boolean>>({});

  // Panel state
  const [activePanel, setActivePanel] = useState<"login" | "register">("login");

  // App state
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    { label: "Super Admin", email: "superadmin@medcore.io", badge: "Global" },
    { label: "Hospital Admin", email: "admin.apex@medcore.io", badge: "Hospital" },
    { label: "Doctor", email: "dr.arun.sharma@apexhealth.org", badge: "Clinical" },
    { label: "Nurse", email: "nurse.apex@medcore.io", badge: "Nursing" },
    { label: "Pharmacist", email: "pharma.apex@medcore.io", badge: "Pharmacy" },
    { label: "Lab Tech", email: "lab.apex@medcore.io", badge: "Diagnostics" },
    { label: "Accountant", email: "billing.apex@medcore.io", badge: "Finance" },
    { label: "Receptionist", email: "reception.apex@medcore.io", badge: "Front Desk" },
    { label: "Patient", email: "patient.rajesh.sharma0@example.com", badge: "Portal" },
  ];

  // ─── Login validation ──────────────────────────────────────────────────
  const validateLoginField = useCallback((field: "email" | "password", value: string) => {
    if (field === "email") setLoginEmailErr(validateEmail(value));
    if (field === "password") setLoginPasswordErr(!value ? "Password is required." : null);
  }, []);

  const handleLoginBlur = (field: "email" | "password") => {
    setLoginTouched((t) => ({ ...t, [field]: true }));
    if (field === "email") validateLoginField("email", loginEmail);
    if (field === "password") validateLoginField("password", loginPassword);
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginTouched({ email: true, password: true });
    const emailErr = validateEmail(loginEmail);
    const passErr = !loginPassword ? "Password is required." : null;
    setLoginEmailErr(emailErr);
    setLoginPasswordErr(passErr);
    if (emailErr || passErr) return;

    setLoginError(null);
    setIsSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
    } catch (err: any) {
      setLoginError(err.message || "Invalid credentials. Please verify your email and password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Registration validation ───────────────────────────────────────────
  const validateRegField = useCallback(
    (field: string, value: string, all?: Record<string, string>) => {
      let err = "";
      if (field === "firstName" && !value.trim()) err = "First name is required.";
      if (field === "lastName" && !value.trim()) err = "Last name is required.";
      if (field === "username") {
        if (!value.trim()) err = "Username is required.";
        else if (value.trim().length < 3) err = "Username must be at least 3 characters.";
        else if (!/^[a-zA-Z0-9._-]+$/.test(value.trim()))
          err = "Only letters, numbers, dots, hyphens allowed.";
      }
      if (field === "email") err = validateEmail(value) || "";
      if (field === "password") err = validatePassword(value) || "";
      if (field === "confirm") {
        const pwd = all?.password ?? regPassword;
        if (!value) err = "Please confirm your password.";
        else if (value !== pwd) err = "Passwords do not match.";
      }
      if (field === "hospital" && !value.trim()) err = "Hospital name is required.";
      setRegErrors((prev) => ({ ...prev, [field]: err }));
      return err;
    },
    [regPassword]
  );

  const handleRegBlur = (field: string, value: string) => {
    setRegTouched((t) => ({ ...t, [field]: true }));
    validateRegField(field, value);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const fields: Record<string, string> = {
      firstName: regFirstName,
      lastName: regLastName,
      username: regUsername,
      email: regEmail,
      password: regPassword,
      confirm: regConfirm,
      hospital: regHospital,
    };
    const allTouched = Object.keys(fields).reduce(
      (acc, k) => ({ ...acc, [k]: true }),
      {} as Record<string, boolean>
    );
    setRegTouched(allTouched);
    const errorMap: Record<string, string> = {};
    Object.entries(fields).forEach(([k, v]) => {
      const err = validateRegField(k, v, fields);
      if (err) errorMap[k] = err;
    });
    if (Object.keys(errorMap).some((k) => errorMap[k])) return;

    setRegError(null);
    setRegSuccess(null);
    setIsRegSubmitting(true);
    try {
      await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          firstName: regFirstName.trim(),
          lastName: regLastName.trim(),
          username: regUsername.trim(),
          email: regEmail.trim().toLowerCase(),
          password: regPassword,
          hospitalName: regHospital.trim(),
        }),
      });
      setRegSuccess(
        "Registration request submitted! Your hospital administrator will review and activate your account."
      );
      setRegFirstName("");
      setRegLastName("");
      setRegUsername("");
      setRegEmail("");
      setRegPassword("");
      setRegConfirm("");
      setRegHospital("");
      setRegTouched({});
      setRegErrors({});
    } catch (err: any) {
      setRegError(err.message || "Registration failed. Please check your details and try again.");
    } finally {
      setIsRegSubmitting(false);
    }
  };

  // ─── Nav items per role ────────────────────────────────────────────────
  const getNavItems = (): NavItem[] => {
    switch (user?.role) {
      case "SUPER_ADMIN":
        return [
          { label: "Overview", href: "/", icon: LayoutDashboard, section: "Core" },
          { label: "Hospitals", href: "/hospitals", icon: Building2, section: "Tenants" },
          { label: "Users & Governance", href: "/users", icon: Users, section: "Governance" },
          { label: "Departments", href: "/departments", icon: Layers, section: "Operations" },
          { label: "Doctors", href: "/doctors", icon: Stethoscope, section: "Operations" },
          { label: "Patients", href: "/patients", icon: Users, section: "Clinical" },
          { label: "Appointments", href: "/appointments", icon: Calendar, section: "Clinical" },
          { label: "Clinical EMR", href: "/emr", icon: FileText, section: "Clinical" },
          { label: "Prescriptions", href: "/prescriptions", icon: Pill, section: "Pharmacy" },
          { label: "Laboratory", href: "/laboratory", icon: FlaskConical, section: "Diagnostics" },
          { label: "Pharmacy", href: "/pharmacy", icon: Package, section: "Pharmacy" },
          { label: "Billing", href: "/billing", icon: CreditCard, section: "Finance" },
          { label: "Notifications", href: "/notifications", icon: Bell, section: "System" },
        ];
      case "HOSPITAL_ADMIN":
        return [
          { label: "Dashboard", href: "/", icon: LayoutDashboard, section: "Core" },
          { label: "Users & Staff", href: "/users", icon: Users, section: "Hospital" },
          { label: "Departments", href: "/departments", icon: Layers, section: "Hospital" },
          { label: "Doctors", href: "/doctors", icon: Stethoscope, section: "Hospital" },
          { label: "Patients", href: "/patients", icon: Users, section: "Clinical Care" },
          { label: "Appointments", href: "/appointments", icon: Calendar, section: "Clinical Care" },
          { label: "Clinical EMR", href: "/emr", icon: FileText, section: "Clinical Care" },
          { label: "Prescriptions", href: "/prescriptions", icon: Pill, section: "Clinical Care" },
          { label: "Laboratory", href: "/laboratory", icon: FlaskConical, section: "Diagnostics" },
          { label: "Pharmacy", href: "/pharmacy", icon: Package, section: "Formulary" },
          { label: "Billing", href: "/billing", icon: CreditCard, section: "Revenue" },
          { label: "Notifications", href: "/notifications", icon: Bell, section: "System" },
        ];
      case "DOCTOR":
        return [
          { label: "Doctor Dashboard", href: "/", icon: LayoutDashboard, section: "Practice" },
          { label: "My Appointments", href: "/appointments", icon: Calendar, section: "Practice" },
          { label: "Clinical EMR", href: "/emr", icon: FileText, section: "Clinical Care" },
          { label: "Prescriptions", href: "/prescriptions", icon: Pill, section: "Clinical Care" },
          { label: "Laboratory", href: "/laboratory", icon: FlaskConical, section: "Diagnostics" },
          { label: "Patients Directory", href: "/patients", icon: Users, section: "Directory" },
          { label: "Notifications", href: "/notifications", icon: Bell, section: "System" },
        ];
      case "NURSE":
        return [
          { label: "Nursing Station", href: "/", icon: LayoutDashboard, section: "Station" },
          { label: "Patient Queue", href: "/appointments", icon: Calendar, section: "Care Queue" },
          { label: "Patients Directory", href: "/patients", icon: Users, section: "Care Queue" },
          { label: "Clinical EMR", href: "/emr", icon: FileText, section: "Clinical Care" },
          { label: "Notifications", href: "/notifications", icon: Bell, section: "System" },
        ];
      case "RECEPTIONIST":
        return [
          { label: "Front Desk", href: "/", icon: LayoutDashboard, section: "Front Desk" },
          { label: "Appointments", href: "/appointments", icon: Calendar, section: "Scheduling" },
          { label: "Patient Registration", href: "/patients", icon: Users, section: "Registration" },
          { label: "Doctor Directory", href: "/doctors", icon: Stethoscope, section: "Directory" },
          { label: "Departments", href: "/departments", icon: Layers, section: "Directory" },
          { label: "Billing & Cashier", href: "/billing", icon: CreditCard, section: "Cashier" },
          { label: "Notifications", href: "/notifications", icon: Bell, section: "System" },
        ];
      case "LAB_TECHNICIAN":
        return [
          { label: "Lab Workspace", href: "/", icon: LayoutDashboard, section: "Laboratory" },
          { label: "Laboratory Orders", href: "/laboratory", icon: FlaskConical, section: "Specimens" },
          { label: "Patients Lookup", href: "/patients", icon: Users, section: "Lookup" },
          { label: "Notifications", href: "/notifications", icon: Bell, section: "System" },
        ];
      case "PHARMACIST":
        return [
          { label: "Pharmacy Overview", href: "/", icon: LayoutDashboard, section: "Overview" },
          { label: "Prescriptions Queue", href: "/prescriptions", icon: Pill, section: "Dispensing" },
          { label: "Formulary & Stock", href: "/pharmacy", icon: Package, section: "Inventory" },
          { label: "Notifications", href: "/notifications", icon: Bell, section: "System" },
        ];
      case "ACCOUNTANT":
        return [
          { label: "Billing Overview", href: "/", icon: LayoutDashboard, section: "Finance" },
          { label: "Invoices & Receipts", href: "/billing", icon: CreditCard, section: "Finance" },
          { label: "Patients Directory", href: "/patients", icon: Users, section: "Directory" },
          { label: "Appointments", href: "/appointments", icon: Calendar, section: "Schedule" },
          { label: "Notifications", href: "/notifications", icon: Bell, section: "System" },
        ];
      case "PATIENT":
        return [
          { label: "My Health Home", href: "/", icon: LayoutDashboard, section: "Portal" },
          { label: "Health Records", href: "/portal", icon: HeartPulse, section: "My Care" },
          { label: "My Prescriptions", href: "/prescriptions", icon: Pill, section: "My Care" },
          { label: "My Lab Reports", href: "/laboratory", icon: FlaskConical, section: "Diagnostics" },
          { label: "My Invoices", href: "/billing", icon: CreditCard, section: "Payments" },
          { label: "Notifications", href: "/notifications", icon: Bell, section: "System" },
        ];
      default:
        return [
          { label: "Dashboard", href: "/", icon: LayoutDashboard, section: "Core" },
          { label: "Notifications", href: "/notifications", icon: Bell, section: "System" },
        ];
    }
  };

  const navItems = getNavItems();

  const getPageTitle = (currentPath: string) => {
    const match = navItems.find((n) => n.href === currentPath);
    if (match) return match.label;
    if (currentPath === "/portal") return "Patient Health Portal";
    if (currentPath === "/hospitals") return "Hospital Organizations";
    if (currentPath === "/users") return "User Administration & Governance";
    return "Clinical Workspace";
  };

  // ─── Initialization Error Screen with Retry ───────────────────────────
  if (initError && !user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f8fafc",
          padding: 24,
        }}
      >
        <div
          className="panel"
          style={{
            maxWidth: 520,
            width: "100%",
            padding: 32,
            textAlign: "center",
            boxShadow: "0 20px 25px -5px rgba(15, 23, 42, 0.1)",
            borderRadius: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "16px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 20px",
            }}
          >
            <AlertCircle size={28} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
            Workspace Initialization Interrupted
          </h2>
          <p style={{ fontSize: 13.5, color: "#64748b", marginBottom: 20, lineHeight: 1.5 }}>
            {initError}
          </p>
          <div
            style={{
              fontSize: 12,
              color: "#64748b",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 24,
              textAlign: "left",
              fontFamily: "var(--font-mono)",
            }}
          >
            <div>Target API: {API_BASE}</div>
            <div style={{ marginTop: 4 }}>Note: Ensure backend server is listening on port 3001.</div>
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={() => retryAuth()}
              style={{ minWidth: 140 }}
            >
              <RefreshCw size={15} />
              <span>Retry Connection</span>
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => clearAuth()}
              style={{ minWidth: 140 }}
            >
              <Lock size={15} />
              <span>Continue to Sign In</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Loading spinner with escape ───────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "14px",
              background: "linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 16px",
              boxShadow: "0 8px 20px rgba(2, 132, 199, 0.3)",
            }}
          >
            <Activity className="animate-spin" style={{ width: 28, height: 28, color: "#ffffff" }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
            MedCore HMS
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            Initializing secure clinical workspace...
          </div>
          <button
            type="button"
            onClick={() => clearAuth()}
            style={{
              background: "none",
              border: "none",
              color: "#0284c7",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
              textDecoration: "underline",
            }}
          >
            Taking too long? Continue to Sign In
          </button>
        </div>
      </div>
    );
  }

  // ─── Authentication Portal ─────────────────────────────────────────────
  if (!user) {
    return (
      <div className="auth-portal-bg">
        <div className="auth-bg-glow auth-bg-glow-1" />
        <div className="auth-bg-glow auth-bg-glow-2" />

        <div className="auth-portal-layout">
          {/* Left branding panel */}
          <div className="auth-brand-panel">
            <div className="auth-brand-panel-inner">
              <div className="auth-brand-logo-wrap">
                <div className="auth-brand-logo-icon">
                  <Activity size={32} />
                </div>
              </div>
              <h1 className="auth-brand-title">MedCore HMS</h1>
              <p className="auth-brand-tagline">Enterprise Hospital Management System</p>
              <div className="auth-brand-features">
                {[
                  { icon: Shield, text: "HIPAA & NABH Compliant Architecture" },
                  { icon: Building2, text: "Multi-Tenant Hospital Operations" },
                  { icon: Users, text: "9 Clinical & Administrative Roles" },
                  { icon: Activity, text: "Real-Time Clinical Telemetry" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="auth-feature-item">
                    <div className="auth-feature-icon">
                      <Icon size={15} />
                    </div>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              <div className="auth-brand-compliance">
                <Shield size={12} />
                <span>256-bit TLS Encryption • SOC 2 Type II Controls</span>
              </div>
            </div>
          </div>

          {/* Right form card */}
          <div className="auth-form-side">
            <div className="auth-form-card">
              {/* Mobile brand header */}
              <div className="auth-mobile-brand">
                <div className="auth-mobile-brand-icon">
                  <Activity size={22} />
                </div>
                <div>
                  <div className="auth-mobile-brand-name">MedCore HMS</div>
                  <div className="auth-mobile-brand-sub">Enterprise Hospital SaaS</div>
                </div>
              </div>

              {/* Tab switcher */}
              <div className="auth-tab-bar">
                <button
                  type="button"
                  className={`auth-tab-btn${activePanel === "login" ? " auth-tab-btn-active" : ""}`}
                  onClick={() => {
                    setActivePanel("login");
                    setLoginError(null);
                    setRegError(null);
                    setRegSuccess(null);
                  }}
                >
                  <Lock size={14} />
                  Sign In
                </button>
                <button
                  type="button"
                  className={`auth-tab-btn${activePanel === "register" ? " auth-tab-btn-active" : ""}`}
                  onClick={() => {
                    setActivePanel("register");
                    setLoginError(null);
                    setRegError(null);
                    setRegSuccess(null);
                  }}
                >
                  <UserPlus size={14} />
                  Register
                </button>
              </div>

              {/* ── Login Panel ── */}
              {activePanel === "login" && (
                <div className="auth-panel-content">
                  <div className="auth-panel-header">
                    <h2 className="auth-panel-title">Sign In to Clinical Workspace</h2>
                    <p className="auth-panel-subtitle">
                      Enter your authorized healthcare credentials to access the hospital management platform.
                    </p>
                  </div>

                  {loginError && (
                    <div className="auth-alert auth-alert-error">
                      <AlertCircle size={16} />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <form onSubmit={handleManualLogin} noValidate>
                    <div className="auth-field-group">
                      <label className="auth-field-label" htmlFor="login-email">
                        Email Address <span className="auth-required">*</span>
                      </label>
                      <div className="auth-input-wrapper">
                        <span className="auth-input-icon">
                          <Mail size={16} />
                        </span>
                        <input
                          id="login-email"
                          type="email"
                          className={`auth-input auth-input-padded${loginTouched.email && loginEmailErr ? " auth-input-error" : ""
                            }`}
                          placeholder="Enter your email address"
                          value={loginEmail}
                          onChange={(e) => {
                            setLoginEmail(e.target.value);
                            if (loginTouched.email) validateLoginField("email", e.target.value);
                          }}
                          onBlur={() => handleLoginBlur("email")}
                          autoComplete="email"
                          required
                        />
                      </div>
                      {loginTouched.email && loginEmailErr && (
                        <span className="auth-field-error">
                          <AlertCircle size={12} />
                          {loginEmailErr}
                        </span>
                      )}
                    </div>

                    <div className="auth-field-group">
                      <div className="auth-label-row">
                        <label className="auth-field-label" htmlFor="login-password">
                          Password <span className="auth-required">*</span>
                        </label>
                        <button
                          type="button"
                          className="auth-forgot-link"
                          onClick={() =>
                            alert(
                              "Password reset: Please contact your hospital administrator or system helpdesk to reset your credentials."
                            )
                          }
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <PasswordInput
                        id="login-password"
                        value={loginPassword}
                        onChange={(v) => {
                          setLoginPassword(v);
                          if (loginTouched.password)
                            setLoginPasswordErr(!v ? "Password is required." : null);
                        }}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        hasError={!!(loginTouched.password && loginPasswordErr)}
                      />
                      {loginTouched.password && loginPasswordErr && (
                        <span className="auth-field-error">
                          <AlertCircle size={12} />
                          {loginPasswordErr}
                        </span>
                      )}
                    </div>

                    <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 size={17} className="animate-spin" />
                          <span>Authenticating...</span>
                        </>
                      ) : (
                        <>
                          <Lock size={16} />
                          <span>Sign In to Workspace</span>
                          <ArrowRight size={15} />
                        </>
                      )}
                    </button>
                  </form>

                  <div className="auth-panel-footer-link">
                    <span>Don&apos;t have an account?</span>
                    <button
                      type="button"
                      className="auth-link-btn"
                      onClick={() => setActivePanel("register")}
                    >
                      Request Access
                    </button>
                  </div>

                  {/* Developer quick-fill */}
                  {isDevMode && (
                    <div className="auth-devtools">
                      <div className="auth-devtools-header">
                        <span>Dev Quick-Fill</span>
                        <span className="auth-devtools-badge">Demo Only</span>
                      </div>
                      <div className="auth-devtools-grid">
                        {demoAccounts.map((acc) => (
                          <button
                            key={acc.email}
                            type="button"
                            className="auth-devtool-btn"
                            onClick={() => {
                              setLoginEmail(acc.email);
                              setLoginPassword("DemoPassword@123");
                              setLoginError(null);
                              setLoginEmailErr(null);
                              setLoginPasswordErr(null);
                            }}
                            title={acc.email}
                          >
                            <span className="auth-devtool-badge">{acc.badge}</span>
                            <span>{acc.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="auth-compliance-footer">
                    <Shield size={13} style={{ color: "#10b981" }} />
                    <span>256-bit TLS • HIPAA &amp; NABH Architectural Controls</span>
                  </div>
                </div>
              )}

              {/* ── Registration Panel ── */}
              {activePanel === "register" && (
                <div className="auth-panel-content">
                  <div className="auth-panel-header">
                    <h2 className="auth-panel-title">Create Your Account</h2>
                    <p className="auth-panel-subtitle">
                      Register for access to MedCore HMS. Your hospital administrator will review and
                      activate your account.
                    </p>
                  </div>

                  {regError && (
                    <div className="auth-alert auth-alert-error">
                      <AlertCircle size={16} />
                      <span>{regError}</span>
                    </div>
                  )}
                  {regSuccess && (
                    <div className="auth-alert auth-alert-success">
                      <CheckCircle2 size={16} />
                      <span>{regSuccess}</span>
                    </div>
                  )}

                  <form onSubmit={handleRegister} noValidate>
                    {/* Name row */}
                    <div className="auth-field-row-2">
                      <div className="auth-field-group">
                        <label className="auth-field-label" htmlFor="reg-fname">
                          First Name <span className="auth-required">*</span>
                        </label>
                        <div className="auth-input-wrapper">
                          <span className="auth-input-icon">
                            <User size={15} />
                          </span>
                          <input
                            id="reg-fname"
                            type="text"
                            className={`auth-input auth-input-padded${regTouched.firstName && regErrors.firstName ? " auth-input-error" : ""
                              }`}
                            placeholder="First name"
                            value={regFirstName}
                            onChange={(e) => {
                              setRegFirstName(e.target.value);
                              if (regTouched.firstName)
                                validateRegField("firstName", e.target.value);
                            }}
                            onBlur={(e) => handleRegBlur("firstName", e.target.value)}
                            autoComplete="given-name"
                          />
                        </div>
                        {regTouched.firstName && regErrors.firstName && (
                          <span className="auth-field-error">
                            <AlertCircle size={12} />
                            {regErrors.firstName}
                          </span>
                        )}
                      </div>
                      <div className="auth-field-group">
                        <label className="auth-field-label" htmlFor="reg-lname">
                          Last Name <span className="auth-required">*</span>
                        </label>
                        <div className="auth-input-wrapper">
                          <span className="auth-input-icon">
                            <User size={15} />
                          </span>
                          <input
                            id="reg-lname"
                            type="text"
                            className={`auth-input auth-input-padded${regTouched.lastName && regErrors.lastName ? " auth-input-error" : ""
                              }`}
                            placeholder="Last name"
                            value={regLastName}
                            onChange={(e) => {
                              setRegLastName(e.target.value);
                              if (regTouched.lastName) validateRegField("lastName", e.target.value);
                            }}
                            onBlur={(e) => handleRegBlur("lastName", e.target.value)}
                            autoComplete="family-name"
                          />
                        </div>
                        {regTouched.lastName && regErrors.lastName && (
                          <span className="auth-field-error">
                            <AlertCircle size={12} />
                            {regErrors.lastName}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Username */}
                    <div className="auth-field-group">
                      <label className="auth-field-label" htmlFor="reg-username">
                        Username <span className="auth-required">*</span>
                      </label>
                      <div className="auth-input-wrapper">
                        <span className="auth-input-icon">
                          <User size={16} />
                        </span>
                        <input
                          id="reg-username"
                          type="text"
                          className={`auth-input auth-input-padded${regTouched.username && regErrors.username ? " auth-input-error" : ""
                            }`}
                          placeholder="Enter your username"
                          value={regUsername}
                          onChange={(e) => {
                            setRegUsername(e.target.value);
                            if (regTouched.username) validateRegField("username", e.target.value);
                          }}
                          onBlur={(e) => handleRegBlur("username", e.target.value)}
                          autoComplete="username"
                        />
                      </div>
                      {regTouched.username && regErrors.username && (
                        <span className="auth-field-error">
                          <AlertCircle size={12} />
                          {regErrors.username}
                        </span>
                      )}
                    </div>

                    {/* Email */}
                    <div className="auth-field-group">
                      <label className="auth-field-label" htmlFor="reg-email">
                        Email Address <span className="auth-required">*</span>
                      </label>
                      <div className="auth-input-wrapper">
                        <span className="auth-input-icon">
                          <Mail size={16} />
                        </span>
                        <input
                          id="reg-email"
                          type="email"
                          className={`auth-input auth-input-padded${regTouched.email && regErrors.email ? " auth-input-error" : ""
                            }`}
                          placeholder="Enter your email address"
                          value={regEmail}
                          onChange={(e) => {
                            setRegEmail(e.target.value);
                            if (regTouched.email) validateRegField("email", e.target.value);
                          }}
                          onBlur={(e) => handleRegBlur("email", e.target.value)}
                          autoComplete="email"
                        />
                      </div>
                      {regTouched.email && regErrors.email && (
                        <span className="auth-field-error">
                          <AlertCircle size={12} />
                          {regErrors.email}
                        </span>
                      )}
                    </div>

                    {/* Hospital */}
                    <div className="auth-field-group">
                      <label className="auth-field-label" htmlFor="reg-hospital">
                        Hospital Name <span className="auth-required">*</span>
                      </label>
                      <div className="auth-input-wrapper">
                        <span className="auth-input-icon">
                          <Building2 size={16} />
                        </span>
                        <input
                          id="reg-hospital"
                          type="text"
                          className={`auth-input auth-input-padded${regTouched.hospital && regErrors.hospital ? " auth-input-error" : ""
                            }`}
                          placeholder="Your hospital or organization name"
                          value={regHospital}
                          onChange={(e) => {
                            setRegHospital(e.target.value);
                            if (regTouched.hospital) validateRegField("hospital", e.target.value);
                          }}
                          onBlur={(e) => handleRegBlur("hospital", e.target.value)}
                          autoComplete="organization"
                        />
                      </div>
                      {regTouched.hospital && regErrors.hospital && (
                        <span className="auth-field-error">
                          <AlertCircle size={12} />
                          {regErrors.hospital}
                        </span>
                      )}
                    </div>

                    {/* Password */}
                    <div className="auth-field-group">
                      <label className="auth-field-label" htmlFor="reg-password">
                        Password <span className="auth-required">*</span>
                      </label>
                      <PasswordInput
                        id="reg-password"
                        value={regPassword}
                        onChange={(v) => {
                          setRegPassword(v);
                          if (regTouched.password) validateRegField("password", v);
                          if (regTouched.confirm)
                            validateRegField("confirm", regConfirm, { password: v });
                        }}
                        placeholder="Enter your password"
                        autoComplete="new-password"
                        hasError={!!(regTouched.password && regErrors.password)}
                        showStrength
                      />
                      {regTouched.password && regErrors.password && (
                        <span className="auth-field-error">
                          <AlertCircle size={12} />
                          {regErrors.password}
                        </span>
                      )}
                    </div>

                    {/* Confirm password */}
                    <div className="auth-field-group">
                      <label className="auth-field-label" htmlFor="reg-confirm">
                        Confirm Password <span className="auth-required">*</span>
                      </label>
                      <PasswordInput
                        id="reg-confirm"
                        value={regConfirm}
                        onChange={(v) => {
                          setRegConfirm(v);
                          if (regTouched.confirm) validateRegField("confirm", v);
                        }}
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
                        hasError={!!(regTouched.confirm && regErrors.confirm)}
                      />
                      {regTouched.confirm && regErrors.confirm && (
                        <span className="auth-field-error">
                          <AlertCircle size={12} />
                          {regErrors.confirm}
                        </span>
                      )}
                    </div>

                    <div className="auth-reg-notice">
                      <Shield size={13} style={{ color: "#0284c7", flexShrink: 0 }} />
                      <span>
                        Your account requires approval from a hospital administrator before activation.
                      </span>
                    </div>

                    <button
                      type="submit"
                      className="auth-submit-btn auth-submit-btn-register"
                      disabled={isRegSubmitting}
                    >
                      {isRegSubmitting ? (
                        <>
                          <Loader2 size={17} className="animate-spin" />
                          <span>Submitting Registration...</span>
                        </>
                      ) : (
                        <>
                          <UserPlus size={16} />
                          <span>Create Account</span>
                          <ArrowRight size={15} />
                        </>
                      )}
                    </button>
                  </form>

                  <div className="auth-panel-footer-link">
                    <span>Already have an account?</span>
                    <button
                      type="button"
                      className="auth-link-btn"
                      onClick={() => {
                        setActivePanel("login");
                        setRegError(null);
                        setRegSuccess(null);
                      }}
                    >
                      Sign In
                    </button>
                  </div>

                  <div className="auth-compliance-footer">
                    <Shield size={13} style={{ color: "#10b981" }} />
                    <span>256-bit TLS • HIPAA &amp; NABH Architectural Controls</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Authenticated App Shell ───────────────────────────────────────────
  const userInitials =
    ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")) ||
    (user?.email?.[0] || "U").toUpperCase();

  const hospitalDisplayName =
    (user as any)?.hospital?.name ||
    (user?.hospitalId === "hosp-apex-001"
      ? "Apex Multispecialty Hospital"
      : user?.hospitalId
        ? user.hospitalId
        : "Multi-Tenant Platform");

  return (
    <div className="app-container">
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar ${sidebarCollapsed ? "collapsed" : ""} ${mobileMenuOpen ? "mobile-open" : ""
          }`}
      >
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <Activity size={20} />
            </div>
            {!sidebarCollapsed && (
              <div className="sidebar-brand-text">
                <span className="sidebar-brand-title">MedCore HMS</span>
                <span className="sidebar-brand-sub">Clinical SaaS</span>
              </div>
            )}
          </div>
          <button
            className="sidebar-toggle-btn mobile-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close Mobile Navigation"
          >
            <X size={18} />
          </button>
          {!mobileMenuOpen && (
            <button
              className="sidebar-toggle-btn"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{ display: "none" }}
            >
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "active" : ""}`}
                onClick={() => setMobileMenuOpen(false)}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className="nav-link-icon">
                  <Icon size={18} />
                </span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-card">
            <span className="sidebar-status-dot" title="Operational" />
            {!sidebarCollapsed && (
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <div style={{ color: "#cbd5e1", fontWeight: 600 }}>Hospital Workspace</div>
                <div
                  style={{
                    color: "#64748b",
                    fontSize: 10.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {hospitalDisplayName}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="main-content">
        <header className="top-navbar">
          <div className="navbar-left">
            <button
              className="mobile-hamburger-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open Navigation Menu"
            >
              <Menu size={20} />
            </button>
            <div className="navbar-breadcrumbs">
              <span className="navbar-breadcrumbs-item">MedCore</span>
              <span style={{ color: "#cbd5e1" }}>/</span>
              <span className="navbar-breadcrumbs-current">{getPageTitle(pathname)}</span>
            </div>
            <div className="navbar-hospital-pill">
              <Hospital size={13} />
              <span>{hospitalDisplayName}</span>
            </div>
          </div>

          <div className="navbar-right">
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "#059669",
                fontWeight: 600,
                background: "#ecfdf5",
                padding: "4px 10px",
                borderRadius: 9999,
                border: "1px solid #a7f3d0",
              }}
              title="All clinical microservices operational"
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: "#10b981",
                  boxShadow: "0 0 6px #10b981",
                }}
              />
              <span>Live System</span>
            </div>

            <Link
              href="/notifications"
              className="btn btn-ghost btn-sm"
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 38,
                height: 38,
                borderRadius: 10,
                padding: 0,
              }}
              title="Clinical Notifications"
            >
              <Bell size={18} style={{ color: "#475569" }} />
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
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
                    boxShadow: "0 0 0 2px #ffffff",
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>

            <div className="navbar-user-card">
              <div className="user-avatar-circle">{userInitials}</div>
              <div className="user-meta-info" style={{ paddingRight: 4 }}>
                <div className="user-meta-name">
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="user-meta-role">{formatRoleName(user?.role)}</div>
              </div>
            </div>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => logout()}
              title="Sign out of clinical workspace"
              style={{ borderRadius: 8, gap: 6 }}
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
