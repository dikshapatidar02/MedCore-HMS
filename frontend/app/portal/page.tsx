"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { apiRequest, API_BASE } from "../lib/api";
import {
  HeartPulse,
  Pill,
  FlaskConical,
  CreditCard,
  FileDown,
  Bell,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Activity,
  AlertCircle,
  FileText,
  User,
  Calendar,
  Sparkles,
} from "lucide-react";

export default function PatientPortalPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"PRESCRIPTIONS" | "LAB_REPORTS" | "INVOICES" | "NOTIFICATIONS">("PRESCRIPTIONS");

  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPortalData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Call patient self-service APIs
      const [rxRes, labRes, invRes, notifRes] = await Promise.all([
        apiRequest("/patients/me/prescriptions").catch(() => []),
        apiRequest("/patients/me/lab-orders").catch(() => []),
        apiRequest("/patients/me/invoices").catch(() => []),
        apiRequest("/patients/me/notifications").catch(() => []),
      ]);

      setPrescriptions(Array.isArray(rxRes) ? rxRes : []);
      setLabOrders(Array.isArray(labRes) ? labRes : []);
      setInvoices(Array.isArray(invRes) ? invRes : []);
      setNotifications(Array.isArray(notifRes) ? notifRes : []);
    } catch (err: any) {
      setError(err.message || "Failed to load patient records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortalData();
  }, []);

  const downloadPrescriptionPdf = async (rxId: string) => {
    try {
      const token = localStorage.getItem("medcore_token");
      const res = await fetch(`${API_BASE}/prescriptions/${rxId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to download PDF.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prescription-${rxId.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      alert(err.message || "PDF download failed.");
    }
  };

  const handlePayInvoice = async (invoiceId: string, balance: number) => {
    try {
      const res = await apiRequest("/payments/initiate", {
        method: "POST",
        body: JSON.stringify({
          invoiceId,
          gateway: "STRIPE",
          amount: balance,
        }),
      });
      alert(`Payment session initiated!\nStatus: ${res.status}\nReference: ${res.clientSecret || "OK"}`);
    } catch (err: any) {
      alert(err.message || "Payment initiation error.");
    }
  };

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Top Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#fff",
          borderRadius: 20,
          padding: "32px 36px",
          marginBottom: 32,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              boxShadow: "0 10px 15px -3px rgba(2, 132, 199, 0.4)",
            }}
          >
            <HeartPulse size={30} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Patient Self-Service Portal</h1>
              <span
                style={{
                  background: "rgba(16, 185, 129, 0.2)",
                  color: "#34d399",
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <ShieldCheck size={14} /> IDOR-Protected
              </span>
            </div>
            <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 14 }}>
              Secure direct access to your verified prescriptions, approved lab diagnostics, and hospital billing
            </p>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>Authenticated Patient</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {user?.firstName} {user?.lastName}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          background: "var(--bg-card)",
          padding: 6,
          borderRadius: 14,
          border: "1px solid var(--border)",
          width: "fit-content",
        }}
      >
        <button
          onClick={() => setTab("PRESCRIPTIONS")}
          className={`btn btn-sm ${tab === "PRESCRIPTIONS" ? "btn-primary" : "btn-ghost"}`}
          style={{ borderRadius: 10, display: "flex", alignItems: "center", gap: 6 }}
        >
          <Pill size={16} /> My Prescriptions ({prescriptions.length})
        </button>
        <button
          onClick={() => setTab("LAB_REPORTS")}
          className={`btn btn-sm ${tab === "LAB_REPORTS" ? "btn-primary" : "btn-ghost"}`}
          style={{ borderRadius: 10, display: "flex", alignItems: "center", gap: 6 }}
        >
          <FlaskConical size={16} /> Approved Lab Reports ({labOrders.length})
        </button>
        <button
          onClick={() => setTab("INVOICES")}
          className={`btn btn-sm ${tab === "INVOICES" ? "btn-primary" : "btn-ghost"}`}
          style={{ borderRadius: 10, display: "flex", alignItems: "center", gap: 6 }}
        >
          <CreditCard size={16} /> Billing & Invoices ({invoices.length})
        </button>
        <button
          onClick={() => setTab("NOTIFICATIONS")}
          className={`btn btn-sm ${tab === "NOTIFICATIONS" ? "btn-primary" : "btn-ghost"}`}
          style={{ borderRadius: 10, display: "flex", alignItems: "center", gap: 6 }}
        >
          <Bell size={16} /> Notifications ({notifications.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <Activity className="animate-spin" size={36} style={{ margin: "0 auto 12px", color: "var(--primary)" }} />
          <div style={{ color: "var(--text-muted)" }}>Accessing verified patient medical records...</div>
        </div>
      ) : tab === "PRESCRIPTIONS" ? (
        /* Prescriptions Tab */
        <div style={{ display: "grid", gap: 16 }}>
          {prescriptions.length === 0 ? (
            <div
              style={{
                background: "var(--bg-card)",
                borderRadius: 16,
                padding: 48,
                textAlign: "center",
                border: "1px dashed var(--border)",
              }}
            >
              <Pill size={48} style={{ margin: "0 auto 16px", color: "var(--text-muted)", opacity: 0.5 }} />
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px" }}>No Prescriptions Found</h3>
              <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
                Active medication prescriptions issued by your doctors will appear here.
              </p>
            </div>
          ) : (
            prescriptions.map((rx) => (
              <div
                key={rx.id}
                style={{
                  background: "var(--bg-card)",
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  padding: 24,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>
                        Dr. {rx.doctor?.user?.firstName} {rx.doctor?.user?.lastName}
                      </span>
                      <span className="badge badge-info">{rx.doctor?.specialization}</span>
                      <span className="badge badge-success">{rx.status}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 12 }}>
                      <span>Prescribed: {new Date(rx.prescriptionDate).toLocaleDateString()}</span>
                      {rx.notes && <span>Notes: {rx.notes}</span>}
                    </div>
                  </div>

                  <button
                    onClick={() => downloadPrescriptionPdf(rx.id)}
                    className="btn btn-primary btn-sm"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <FileDown size={14} /> Download Signed PDF
                  </button>
                </div>

                {/* Items */}
                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  {rx.items?.map((it: any) => (
                    <div
                      key={it.id}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <strong>{it.medicine?.name}</strong> ({it.medicine?.genericName}) —{" "}
                        <span style={{ color: "var(--text-muted)" }}>{it.dosage}</span>
                      </div>
                      <div style={{ display: "flex", gap: 16, color: "var(--text-secondary)" }}>
                        <span>
                          Frequency: <strong>{it.frequency}</strong>
                        </span>
                        <span>
                          Duration: <strong>{it.duration}</strong>
                        </span>
                        <span>
                          Qty: <strong>{it.quantity}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === "LAB_REPORTS" ? (
        /* Lab Reports Tab */
        <div style={{ display: "grid", gap: 16 }}>
          {labOrders.length === 0 ? (
            <div
              style={{
                background: "var(--bg-card)",
                borderRadius: 16,
                padding: 48,
                textAlign: "center",
                border: "1px dashed var(--border)",
              }}
            >
              <FlaskConical size={48} style={{ margin: "0 auto 16px", color: "var(--text-muted)", opacity: 0.5 }} />
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px" }}>No Approved Lab Reports</h3>
              <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
                Diagnostic pathology results are published here immediately once reviewed and approved by a clinical pathologist.
              </p>
            </div>
          ) : (
            labOrders.map((ord) => (
              <div
                key={ord.id}
                style={{
                  background: "var(--bg-card)",
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  padding: 24,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{ord.orderNumber}</span>
                      <span className="badge badge-success">Approved Diagnostic Report</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 14 }}>
                      <span>Doctor: Dr. {ord.doctor?.user?.firstName} {ord.doctor?.user?.lastName}</span>
                      {ord.approvedAt && <span>Approved On: {new Date(ord.approvedAt).toLocaleDateString()}</span>}
                      {ord.reviewer && <span>Verified By: Dr. {ord.reviewer.firstName} {ord.reviewer.lastName}</span>}
                    </div>
                  </div>
                </div>

                {/* Structured Results */}
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-muted)" }}>
                      <th style={{ padding: "8px 6px" }}>Test Name</th>
                      <th style={{ padding: "8px 6px" }}>Result Value</th>
                      <th style={{ padding: "8px 6px" }}>Reference Range</th>
                      <th style={{ padding: "8px 6px" }}>Unit</th>
                      <th style={{ padding: "8px 6px" }}>Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ord.results?.map((res: any) => (
                      <tr key={res.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 6px", fontWeight: 600 }}>{res.labTest?.testName}</td>
                        <td style={{ padding: "10px 6px", fontWeight: 700 }}>
                          {res.numericValue !== null && res.numericValue !== undefined ? res.numericValue : res.textValue || "—"}
                        </td>
                        <td style={{ padding: "10px 6px", color: "var(--text-muted)" }}>{res.referenceRange || "—"}</td>
                        <td style={{ padding: "10px 6px", color: "var(--text-muted)" }}>{res.unit || "—"}</td>
                        <td style={{ padding: "10px 6px" }}>
                          <span
                            className={`badge ${
                              res.flag === "NORMAL"
                                ? "badge-success"
                                : res.flag === "ABNORMAL"
                                ? "badge-warning"
                                : "badge-danger"
                            }`}
                          >
                            {res.flag}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      ) : tab === "INVOICES" ? (
        /* Invoices Tab */
        <div style={{ display: "grid", gap: 16 }}>
          {invoices.length === 0 ? (
            <div
              style={{
                background: "var(--bg-card)",
                borderRadius: 16,
                padding: 48,
                textAlign: "center",
                border: "1px dashed var(--border)",
              }}
            >
              <CreditCard size={48} style={{ margin: "0 auto 16px", color: "var(--text-muted)", opacity: 0.5 }} />
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px" }}>No Invoices Found</h3>
              <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
                Hospital charges and payment receipts will appear here.
              </p>
            </div>
          ) : (
            invoices.map((inv) => (
              <div
                key={inv.id}
                style={{
                  background: "var(--bg-card)",
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  padding: 24,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{inv.invoiceNumber}</span>
                      <span className="badge badge-info">{inv.status}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      Issued: {new Date(inv.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
                      ₹{Number(inv.totalAmount).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 13, color: Number(inv.outstandingBalance) > 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                      Balance Due: ₹{Number(inv.outstandingBalance).toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div style={{ background: "#f8fafc", padding: 12, borderRadius: 10, marginBottom: 14 }}>
                  {inv.items?.map((it: any) => (
                    <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                      <span>
                        {it.description} (x{it.quantity})
                      </span>
                      <strong>₹{Number(it.totalPrice).toFixed(2)}</strong>
                    </div>
                  ))}
                </div>

                {/* Payments */}
                {inv.payments && inv.payments.length > 0 && (
                  <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, marginTop: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
                      Payment Receipts:
                    </div>
                    {inv.payments.map((p: any) => (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", padding: "2px 0" }}>
                        <span>{p.receiptNumber || "Receipt"} ({p.paymentMethod}) • {new Date(p.paymentDate || p.createdAt).toLocaleDateString()}</span>
                        <span style={{ fontWeight: 600, color: p.status === "REFUNDED" ? "#ef4444" : "#10b981" }}>
                          {p.status === "REFUNDED" ? "Refunded " : ""}₹{Number(p.amount).toFixed(2)} ({p.status})
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {Number(inv.outstandingBalance) > 0 && inv.status !== "DRAFT" && inv.status !== "VOID" && (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button
                      onClick={() => handlePayInvoice(inv.id, Number(inv.outstandingBalance))}
                      className="btn btn-primary btn-sm"
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <CreditCard size={14} /> Pay Now (Stripe / Razorpay)
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        /* Notifications Tab */
        <div style={{ display: "grid", gap: 12 }}>
          {notifications.length === 0 ? (
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
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{n.title}</div>
                <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text-secondary)" }}>{n.message}</p>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(n.createdAt).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
