"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import {
  Bell,
  CheckCircle2,
  Mail,
  Smartphone,
  Check,
  Settings,
  X,
  Activity,
  AlertCircle,
  Clock,
  Sparkles,
  Trash2,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  channel: "IN_APP" | "EMAIL" | "SMS";
  metadata?: {
    protectedRoute?: string;
    [key: string]: any;
  };
  isRead: boolean;
  createdAt: string;
}

interface Preferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  inAppEnabled: boolean;
  appointmentAlerts?: boolean;
  billingAlerts?: boolean;
  labAlerts?: boolean;
  prescriptionAlerts?: boolean;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "READ">("ALL");

  // Preferences Modal State
  const [showPrefModal, setShowPrefModal] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>({
    emailEnabled: true,
    smsEnabled: true,
    inAppEnabled: true,
    appointmentAlerts: true,
    billingAlerts: true,
    labAlerts: true,
    prescriptionAlerts: true,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const [list, countRes, prefRes] = await Promise.all([
        apiRequest(`/notifications?readStatus=${filter}`),
        apiRequest("/notifications/unread-count"),
        apiRequest("/notifications/preferences"),
      ]);
      setNotifications(Array.isArray(list) ? list : list?.items || []);
      if (countRes && typeof countRes.count === "number") {
        setUnreadCount(countRes.count);
      }
      if (prefRes) {
        setPrefs({
          emailEnabled: prefRes.emailEnabled ?? true,
          smsEnabled: prefRes.smsEnabled ?? true,
          inAppEnabled: prefRes.inAppEnabled ?? true,
          appointmentAlerts: prefRes.appointmentAlerts ?? true,
          billingAlerts: prefRes.billingAlerts ?? true,
          labAlerts: prefRes.labAlerts ?? true,
          prescriptionAlerts: prefRes.prescriptionAlerts ?? true,
        });
      }
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [filter]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: "PATCH" });
      await fetchNotifications();
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiRequest("/notifications/mark-all-read", { method: "POST" });
      await fetchNotifications();
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      await apiRequest(`/notifications/${id}`, { method: "DELETE" });
      await fetchNotifications();
    } catch (err) {
      console.error("Failed to delete notification", err);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingPrefs(true);
      await apiRequest("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      });
      setShowPrefModal(false);
      alert("Notification delivery preferences updated successfully!");
    } catch (err: any) {
      alert(err.message || "Failed to update notification preferences.");
    } finally {
      setSavingPrefs(false);
    }
  };

  const getChannelBadge = (channel: string) => {
    switch (channel) {
      case "EMAIL":
        return (
          <span className="badge badge-info" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Mail size={12} /> Email
          </span>
        );
      case "SMS":
        return (
          <span className="badge badge-warning" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Smartphone size={12} /> SMS
          </span>
        );
      default:
        return (
          <span className="badge badge-primary" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Bell size={12} /> In-App
          </span>
        );
    }
  };

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              boxShadow: "0 10px 15px -3px rgba(245, 158, 11, 0.3)",
            }}
          >
            <Bell size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Notifications & Communication
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
              Multi-tenant clinical alerts, appointment reminders, and billing dispatches
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setShowPrefModal(true)}
            className="btn btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Settings size={16} /> Preferences
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Check size={16} /> Mark All as Read
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 20,
          background: "var(--bg-card)",
          padding: 6,
          borderRadius: 12,
          border: "1px solid var(--border)",
          width: "fit-content",
        }}
      >
        <button
          onClick={() => setFilter("ALL")}
          className={`btn btn-sm ${filter === "ALL" ? "btn-primary" : "btn-ghost"}`}
          style={{ borderRadius: 8 }}
        >
          All Activity
        </button>
        <button
          onClick={() => setFilter("UNREAD")}
          className={`btn btn-sm ${filter === "UNREAD" ? "btn-primary" : "btn-ghost"}`}
          style={{ borderRadius: 8 }}
        >
          Unread Only ({unreadCount})
        </button>
        <button
          onClick={() => setFilter("READ")}
          className={`btn btn-sm ${filter === "READ" ? "btn-primary" : "btn-ghost"}`}
          style={{ borderRadius: 8 }}
        >
          Read History
        </button>
      </div>

      {/* Notifications List */}
      {loading ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Activity className="animate-spin" size={32} style={{ margin: "0 auto 12px", color: "var(--primary)" }} />
          <div style={{ color: "var(--text-muted)" }}>Loading notifications...</div>
        </div>
      ) : notifications.length === 0 ? (
        <div
          style={{
            background: "var(--bg-card)",
            borderRadius: 16,
            padding: 48,
            textAlign: "center",
            border: "1px dashed var(--border)",
          }}
        >
          <Bell size={48} style={{ margin: "0 auto 16px", color: "var(--text-muted)", opacity: 0.5 }} />
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px" }}>No Notifications</h3>
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
            You're all caught up! New lab approvals, appointment reminders, prescription updates, and billing receipts will notify you here.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              style={{
                background: n.isRead ? "var(--bg-card)" : "var(--bg-subtle, #f0fdf4)",
                borderRadius: 14,
                border: n.isRead ? "1px solid var(--border)" : "1px solid #bbf7d0",
                padding: 18,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flex: 1 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: n.isRead ? "#f1f5f9" : "#dcfce7",
                    display: "grid",
                    placeItems: "center",
                    color: n.isRead ? "var(--text-muted)" : "#16a34a",
                    flexShrink: 0,
                  }}
                >
                  <Sparkles size={18} />
                </div>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: n.isRead ? 600 : 700, color: "var(--text-primary)" }}>
                      {n.title}
                    </span>
                    {getChannelBadge(n.channel)}
                    {!n.isRead && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#16a34a",
                          display: "inline-block",
                        }}
                      />
                    )}
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: 14, color: "var(--text-secondary)" }}>{n.message}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={12} />
                      {new Date(n.createdAt).toLocaleString()}
                    </div>

                    {/* Deep Link to Protected Route */}
                    {n.metadata?.protectedRoute && (
                      <a
                        href={n.metadata.protectedRoute}
                        style={{
                          fontSize: 12,
                          color: "var(--primary)",
                          textDecoration: "none",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <ExternalLink size={12} /> View Details
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {!n.isRead && (
                  <button
                    onClick={() => handleMarkAsRead(n.id)}
                    className="btn btn-sm btn-ghost"
                    style={{ color: "var(--primary)" }}
                    title="Mark as read"
                  >
                    <Check size={14} style={{ display: "inline", marginRight: 4 }} /> Read
                  </button>
                )}
                <button
                  onClick={() => handleDeleteNotification(n.id)}
                  className="btn btn-sm btn-ghost"
                  style={{ color: "#94a3b8" }}
                  title="Dismiss notification"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CHANNEL & CATEGORY PREFERENCES MODAL */}
      {showPrefModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "grid",
            placeItems: "center",
            padding: 24,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 20,
              width: "100%",
              maxWidth: 540,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Settings size={20} style={{ color: "var(--primary)" }} />
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Notification Preferences</h2>
              </div>
              <button onClick={() => setShowPrefModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePreferences}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 10 }}>
                  Delivery Channels
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <label
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Bell size={18} style={{ color: "var(--primary)" }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>In-App Notifications</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Receive live browser & portal alerts</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefs.inAppEnabled}
                      onChange={(e) => setPrefs({ ...prefs, inAppEnabled: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                  </label>

                  <label
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Mail size={18} style={{ color: "#0284c7" }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>Email Dispatches</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Receive email notices and digital invoices</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefs.emailEnabled}
                      onChange={(e) => setPrefs({ ...prefs, emailEnabled: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                  </label>

                  <label
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Smartphone size={18} style={{ color: "#10b981" }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>SMS Text Messages</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Urgent reminders and appointment confirmations</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefs.smsEnabled}
                      onChange={(e) => setPrefs({ ...prefs, smsEnabled: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 10 }}>
                  Event Categories
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <label
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Appointment Alerts</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Booking confirmations, reschedules, and 24h/1h reminders</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefs.appointmentAlerts ?? true}
                      onChange={(e) => setPrefs({ ...prefs, appointmentAlerts: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                  </label>

                  <label
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Laboratory Alerts</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Approved diagnostic results availability notices</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefs.labAlerts ?? true}
                      onChange={(e) => setPrefs({ ...prefs, labAlerts: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                  </label>

                  <label
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Prescription Alerts</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>New doctor medication prescriptions and pharmacy notices</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefs.prescriptionAlerts ?? true}
                      onChange={(e) => setPrefs({ ...prefs, prescriptionAlerts: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                  </label>

                  <label
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Billing & Payment Alerts</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Invoice issuance and verified receipt confirmations</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefs.billingAlerts ?? true}
                      onChange={(e) => setPrefs({ ...prefs, billingAlerts: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                  </label>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setShowPrefModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={savingPrefs} className="btn btn-primary">
                  {savingPrefs ? "Saving..." : "Save Preferences"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
