"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  Receipt,
  User,
  Clock,
  Layers,
  Lock,
  X,
  Activity,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Ban,
  Trash2,
} from "lucide-react";

interface InvoiceItem {
  id: string;
  description: string;
  itemType: "CONSULTATION" | "LAB_TEST" | "PHARMACY" | "PROCEDURE" | "ROOM_CHARGE" | "OTHER";
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Payment {
  id: string;
  receiptNumber: string;
  amount: number;
  paymentMethod: string;
  status: "INITIATED" | "PENDING" | "COMPLETED" | "SUCCESS" | "FAILED" | "REFUNDED";
  paymentDate: string;
  notes?: string;
  receivedBy?: { firstName: string; lastName: string };
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: "DRAFT" | "ISSUED" | "PAID" | "PARTIALLY_PAID" | "VOID" | "OVERDUE";
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  outstandingBalance: number;
  dueDate?: string;
  notes?: string;
  createdAt: string;
  finalizedAt?: string;
  patient: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  appointment?: {
    id: string;
    appointmentDate: string;
    startTime: string;
  };
  items: InvoiceItem[];
  payments: Payment[];
}

export default function BillingPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Selected Invoice for detail view
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Create Draft Invoice Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [taxAmount, setTaxAmount] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [lineItems, setLineItems] = useState<
    Array<{
      description: string;
      itemType: "CONSULTATION" | "LAB_TEST" | "PHARMACY" | "PROCEDURE" | "ROOM_CHARGE" | "OTHER";
      quantity: number;
      unitPrice: number;
    }>
  >([
    {
      description: "General Consultation Fee",
      itemType: "CONSULTATION",
      quantity: 1,
      unitPrice: 500,
    },
  ]);

  // Add Item to existing draft
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemType, setNewItemType] = useState<"CONSULTATION" | "LAB_TEST" | "PHARMACY" | "PROCEDURE" | "ROOM_CHARGE" | "OTHER">("CONSULTATION");
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(100);

  // Consolidate Modal
  const [showConsolidateModal, setShowConsolidateModal] = useState(false);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");

  // Cash Payment Modal
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cashNotes, setCashNotes] = useState("");
  const [counterPaymentMethod, setCounterPaymentMethod] = useState("CASH");

  // Refund Modal
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedPaymentForRefund, setSelectedPaymentForRefund] = useState<Payment | null>(null);
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundReason, setRefundReason] = useState("");

  // Void Modal
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const isAccountant = user?.role === "ACCOUNTANT";
  const isReceptionist = user?.role === "RECEPTIONIST";
  const isAdmin = user?.role === "HOSPITAL_ADMIN" || user?.role === "SUPER_ADMIN";
  const canManageBilling = isAccountant || isReceptionist || isAdmin;
  const canRefund = isAccountant || isAdmin;

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest("/billing/invoices");
      const list = Array.isArray(data) ? data : [];
      setInvoices(list);
      if (selectedInvoice) {
        const updated = list.find((i: Invoice) => i.id === selectedInvoice.id);
        if (updated) setSelectedInvoice(updated);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const openCreateModal = async () => {
    try {
      const pats = await apiRequest("/patients");
      const list = pats?.items ? pats.items : Array.isArray(pats) ? pats : [];
      setPatients(list);
      setShowCreateModal(true);
    } catch (err: any) {
      alert("Failed to load patients list.");
    }
  };

  const openConsolidateModal = async () => {
    try {
      const appts = await apiRequest("/appointments");
      setAppointments(Array.isArray(appts) ? appts : []);
      setShowConsolidateModal(true);
    } catch (err: any) {
      alert("Failed to load appointments for encounter consolidation.");
    }
  };

  const handleAddLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        description: "",
        itemType: "OTHER",
        quantity: 1,
        unitPrice: 100,
      },
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, idx) => idx !== index));
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      alert("Please select a patient.");
      return;
    }
    try {
      setSubmitting(true);
      await apiRequest("/billing/invoices", {
        method: "POST",
        body: JSON.stringify({
          patientId: selectedPatientId,
          notes: invoiceNotes,
          taxAmount: Number(taxAmount) || 0,
          discountAmount: Number(discountAmount) || 0,
          items: lineItems.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            itemType: item.itemType,
          })),
        }),
      });
      setShowCreateModal(false);
      await fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to create invoice.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConsolidateEncounter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointmentId) {
      alert("Please select an appointment.");
      return;
    }
    try {
      setSubmitting(true);
      const res = await apiRequest("/billing/invoices/consolidate-encounter", {
        method: "POST",
        body: JSON.stringify({ appointmentId: selectedAppointmentId }),
      });
      alert(`Encounter consolidated successfully into draft invoice ${res.invoiceNumber}!`);
      setShowConsolidateModal(false);
      await fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to consolidate encounter.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalizeInvoice = async (invoiceId: string) => {
    if (!confirm("Are you sure you want to finalize this invoice? Once finalized, line items become immutable.")) {
      return;
    }
    try {
      setSubmitting(true);
      const res = await apiRequest(`/billing/invoices/${invoiceId}/finalize`, {
        method: "POST",
      });
      setSelectedInvoice(res);
      await fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to finalize invoice.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    try {
      setSubmitting(true);
      const res = await apiRequest(`/billing/invoices/${selectedInvoice.id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: voidReason }),
      });
      alert(`Invoice ${res.invoiceNumber} has been marked VOID.`);
      setShowVoidModal(false);
      setSelectedInvoice(res);
      await fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to void invoice.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddItemToDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    try {
      setSubmitting(true);
      const res = await apiRequest(`/billing/invoices/${selectedInvoice.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          description: newItemDesc,
          itemType: newItemType,
          quantity: Number(newItemQty),
          unitPrice: Number(newItemPrice),
        }),
      });
      setSelectedInvoice(res);
      setShowAddItemModal(false);
      setNewItemDesc("");
      await fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to add item to invoice.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveItemFromDraft = async (itemId: string) => {
    if (!selectedInvoice) return;
    if (!confirm("Remove this line item from the draft invoice?")) return;
    try {
      setSubmitting(true);
      const res = await apiRequest(`/billing/invoices/${selectedInvoice.id}/items/${itemId}`, {
        method: "DELETE",
      });
      setSelectedInvoice(res);
      await fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to remove item.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordCashPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    try {
      setSubmitting(true);
      const res = await apiRequest("/payments/cash", {
        method: "POST",
        body: JSON.stringify({
          invoiceId: selectedInvoice.id,
          amount: Number(cashAmount),
          paymentMethod: counterPaymentMethod,
          notes: cashNotes || "Counter payment received",
        }),
      });
      alert(`Payment recorded successfully! Receipt ID: ${res.payment?.receiptNumber || res.receiptNumber}`);
      setShowCashModal(false);
      await fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenRefundModal = (p: Payment) => {
    setSelectedPaymentForRefund(p);
    setRefundAmount(Number(p.amount));
    setRefundReason("");
    setShowRefundModal(true);
  };

  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaymentForRefund) return;
    try {
      setSubmitting(true);
      const res = await apiRequest(`/payments/${selectedPaymentForRefund.id}/refund`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(refundAmount),
          reason: refundReason,
        }),
      });
      alert(`Refund processed! ₹${res.refundAmount} refunded. Invoice balance updated.`);
      setShowRefundModal(false);
      await fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to process refund.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitiateOnlinePayment = async (gateway: "STRIPE" | "RAZORPAY") => {
    if (!selectedInvoice) return;
    try {
      setSubmitting(true);
      const res = await apiRequest("/payments/initiate", {
        method: "POST",
        body: JSON.stringify({
          invoiceId: selectedInvoice.id,
          gateway,
          amount: selectedInvoice.outstandingBalance,
        }),
      });
      alert(
        `Digital payment session initiated with ${gateway}!\nSession Reference: ${res.clientSecret || res.orderId || "OK"}\nStatus: ${res.status}`
      );
    } catch (err: any) {
      alert(err.message || `Payment gateway ${gateway} error.`);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <span className="badge badge-warning">Draft</span>;
      case "ISSUED":
        return <span className="badge badge-info">Issued</span>;
      case "PARTIALLY_PAID":
        return <span className="badge badge-primary">Partially Paid</span>;
      case "PAID":
        return <span className="badge badge-success">Fully Paid</span>;
      case "VOID":
        return <span className="badge badge-danger">Void</span>;
      case "OVERDUE":
        return <span className="badge badge-danger">Overdue</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesStatus = statusFilter === "ALL" || inv.status === statusFilter;
    const patName = `${inv.patient?.firstName} ${inv.patient?.lastName}`.toLowerCase();
    const invNum = inv.invoiceNumber.toLowerCase();
    const matchesSearch =
      patName.includes(search.toLowerCase()) ||
      invNum.includes(search.toLowerCase()) ||
      inv.patient?.mrn?.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                boxShadow: "0 10px 15px -3px rgba(99, 102, 241, 0.3)",
              }}
            >
              <CreditCard size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Consolidated Billing & Payments
              </h1>
              <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--text-muted)" }}>
                Encounter aggregation, server-calculated itemized invoices, cash counter receipts, refunds, and digital checkout
              </p>
            </div>
          </div>
        </div>

        {canManageBilling && (
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={openConsolidateModal}
              className="btn btn-outline-primary"
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <Layers size={18} /> Consolidate Encounter
            </button>
            <button
              onClick={openCreateModal}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <Plus size={18} /> New Draft Invoice
            </button>
          </div>
        )}
      </div>

      {/* Main Grid: Left Invoices List, Right Selected Detail */}
      <div style={{ display: "grid", gridTemplateColumns: selectedInvoice ? "1fr 1fr" : "1fr", gap: 24 }}>
        {/* Left Column: List */}
        <div>
          {/* Controls */}
          <div
            style={{
              display: "flex",
              gap: 14,
              marginBottom: 20,
              background: "var(--bg-card)",
              padding: "14px 18px",
              borderRadius: 14,
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ position: "relative", flex: 1 }}>
              <Search
                size={18}
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                type="text"
                placeholder="Search invoices by patient, MRN, invoice #..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input"
                style={{ paddingLeft: 42, width: "100%" }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
              style={{ width: 160 }}
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ISSUED">Issued</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Void</option>
            </select>
          </div>

          {loading ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <Activity className="animate-spin" size={32} style={{ margin: "0 auto 12px", color: "var(--primary)" }} />
              <div style={{ color: "var(--text-muted)" }}>Loading invoices...</div>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div
              style={{
                background: "var(--bg-card)",
                borderRadius: 16,
                padding: 48,
                textAlign: "center",
                border: "1px dashed var(--border)",
              }}
            >
              <Receipt size={48} style={{ margin: "0 auto 16px", color: "var(--text-muted)", opacity: 0.5 }} />
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px" }}>No Invoices Found</h3>
              <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
                Create a draft invoice or consolidate an encounter visit to generate bills.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {filteredInvoices.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => setSelectedInvoice(inv)}
                  style={{
                    background: "var(--bg-card)",
                    borderRadius: 14,
                    border: `1px solid ${selectedInvoice?.id === inv.id ? "var(--primary)" : "var(--border)"}`,
                    padding: 18,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    boxShadow: selectedInvoice?.id === inv.id ? "0 4px 12px rgba(99, 102, 241, 0.15)" : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{inv.invoiceNumber}</span>
                        {getStatusBadge(inv.status)}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                        {inv.patient?.firstName} {inv.patient?.lastName} • MRN: {inv.patient?.mrn}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                        ₹{Number(inv.totalAmount).toFixed(2)}
                      </div>
                      <div style={{ fontSize: 12, color: Number(inv.outstandingBalance) > 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                        Due: ₹{Number(inv.outstandingBalance).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
                    <span>{inv.items?.length || 0} line items</span>
                    <span>Issued: {new Date(inv.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Selected Detail */}
        {selectedInvoice && (
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: 16,
              border: "1px solid var(--border)",
              padding: 24,
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{selectedInvoice.invoiceNumber}</h2>
                  {getStatusBadge(selectedInvoice.status)}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                  Patient: <strong>{selectedInvoice.patient?.firstName} {selectedInvoice.patient?.lastName}</strong> ({selectedInvoice.patient?.mrn})
                </div>
              </div>

              <button onClick={() => setSelectedInvoice(null)} className="btn btn-ghost btn-sm" style={{ padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Line Items Table */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Itemized Charges
                </div>
                {selectedInvoice.status === "DRAFT" && canManageBilling && (
                  <button
                    onClick={() => setShowAddItemModal(true)}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <Plus size={14} /> Add Item
                  </button>
                )}
              </div>

              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-muted)" }}>
                    <th style={{ padding: "8px 6px" }}>Description</th>
                    <th style={{ padding: "8px 6px" }}>Type</th>
                    <th style={{ padding: "8px 6px", textAlign: "center" }}>Qty</th>
                    <th style={{ padding: "8px 6px", textAlign: "right" }}>Unit Price</th>
                    <th style={{ padding: "8px 6px", textAlign: "right" }}>Total</th>
                    {selectedInvoice.status === "DRAFT" && <th style={{ padding: "8px 6px", width: 30 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items?.map((it) => (
                    <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 6px", fontWeight: 600 }}>{it.description}</td>
                      <td style={{ padding: "10px 6px" }}>
                        <span className="badge badge-info" style={{ fontSize: 11 }}>{it.itemType}</span>
                      </td>
                      <td style={{ padding: "10px 6px", textAlign: "center" }}>{it.quantity}</td>
                      <td style={{ padding: "10px 6px", textAlign: "right" }}>₹{Number(it.unitPrice).toFixed(2)}</td>
                      <td style={{ padding: "10px 6px", textAlign: "right", fontWeight: 600 }}>
                        ₹{Number(it.totalPrice).toFixed(2)}
                      </td>
                      {selectedInvoice.status === "DRAFT" && (
                        <td style={{ padding: "10px 6px", textAlign: "center" }}>
                          <button
                            onClick={() => handleRemoveItemFromDraft(it.id)}
                            className="btn btn-ghost btn-sm"
                            style={{ color: "#ef4444", padding: 2 }}
                            title="Remove line item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div
              style={{
                background: "var(--bg-subtle, #f8fafc)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                <span style={{ color: "var(--text-muted)" }}>Subtotal</span>
                <span>₹{Number(selectedInvoice.subtotal).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                <span style={{ color: "var(--text-muted)" }}>Taxes</span>
                <span>₹{Number(selectedInvoice.taxAmount).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                <span style={{ color: "var(--text-muted)" }}>Discounts</span>
                <span style={{ color: "#10b981" }}>- ₹{Number(selectedInvoice.discountAmount).toFixed(2)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 16,
                  fontWeight: 700,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 10,
                  marginTop: 6,
                }}
              >
                <span>Grand Total</span>
                <span>₹{Number(selectedInvoice.totalAmount).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                <span style={{ color: "var(--text-muted)" }}>Amount Paid</span>
                <span style={{ color: "#10b981", fontWeight: 600 }}>₹{Number(selectedInvoice.paidAmount).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, padding: "4px 0" }}>
                <span style={{ color: "#ef4444" }}>Outstanding Balance</span>
                <span style={{ color: "#ef4444" }}>₹{Number(selectedInvoice.outstandingBalance).toFixed(2)}</span>
              </div>
            </div>

            {/* Payments History */}
            {selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                  Recorded Receipts & Payments
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {selectedInvoice.payments.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        background: "#fff",
                        border: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <strong>{p.receiptNumber || "RECEIPT"}</strong> ({p.paymentMethod})
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {new Date(p.paymentDate).toLocaleDateString()} — {p.status}
                          {p.notes && ` • ${p.notes}`}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 700, color: p.status === "REFUNDED" ? "#ef4444" : "#10b981" }}>
                          {p.status === "REFUNDED" ? "- " : ""}₹{Number(p.amount).toFixed(2)}
                        </span>
                        {canRefund && (p.status === "COMPLETED" || p.status === "SUCCESS") && (
                          <button
                            onClick={() => handleOpenRefundModal(p)}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 11, color: "#6366f1", display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <RotateCcw size={12} /> Refund
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions Bar */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              {selectedInvoice.status === "DRAFT" && canManageBilling && (
                <>
                  <button
                    onClick={() => handleFinalizeInvoice(selectedInvoice.id)}
                    disabled={submitting}
                    className="btn btn-primary"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Lock size={16} /> Finalize Invoice
                  </button>
                  <button
                    onClick={() => setShowVoidModal(true)}
                    disabled={submitting}
                    className="btn btn-outline-danger"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Ban size={16} /> Void Draft
                  </button>
                </>
              )}

              {selectedInvoice.status !== "DRAFT" && selectedInvoice.status !== "VOID" && Number(selectedInvoice.outstandingBalance) > 0 && canManageBilling && (
                <button
                  onClick={() => {
                    setCashAmount(Number(selectedInvoice.outstandingBalance));
                    setShowCashModal(true);
                  }}
                  className="btn btn-success"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Receipt size={16} /> Record Payment
                </button>
              )}

              {selectedInvoice.status !== "DRAFT" && selectedInvoice.status !== "VOID" && Number(selectedInvoice.outstandingBalance) > 0 && (
                <>
                  <button
                    onClick={() => handleInitiateOnlinePayment("STRIPE")}
                    className="btn btn-outline-primary"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <CreditCard size={16} /> Pay via Stripe
                  </button>
                  <button
                    onClick={() => handleInitiateOnlinePayment("RAZORPAY")}
                    className="btn btn-outline-primary"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <CreditCard size={16} /> Pay via Razorpay
                  </button>
                </>
              )}

              {selectedInvoice.status !== "DRAFT" && selectedInvoice.status !== "VOID" && isAdmin && (
                <button
                  onClick={() => setShowVoidModal(true)}
                  disabled={submitting}
                  className="btn btn-ghost btn-sm"
                  style={{ color: "#ef4444", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <Ban size={14} /> Void Invoice
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CREATE DRAFT INVOICE MODAL */}
      {showCreateModal && (
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
              maxWidth: 780,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Create Itemized Draft Invoice</h2>
              <button onClick={() => setShowCreateModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice}>
              <div style={{ marginBottom: 16 }}>
                <label className="label">Select Patient *</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  required
                  className="input"
                >
                  <option value="">-- Choose Patient --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName} ({p.mrn})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div>
                  <label className="label">Tax Amount (INR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(Number(e.target.value))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Discount Amount (INR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Number(e.target.value))}
                    className="input"
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label className="label" style={{ margin: 0 }}>Invoice Line Items</label>
                  <button type="button" onClick={handleAddLineItem} className="btn btn-sm btn-ghost" style={{ fontSize: 12 }}>
                    <Plus size={14} style={{ display: "inline", marginRight: 4 }} /> Add Line Item
                  </button>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {lineItems.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "#f8fafc",
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 80px 100px 32px",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Description (e.g. Consultation)"
                        value={item.description}
                        onChange={(e) => {
                          const updated = [...lineItems];
                          updated[idx].description = e.target.value;
                          setLineItems(updated);
                        }}
                        required
                        className="input"
                      />
                      <select
                        value={item.itemType}
                        onChange={(e) => {
                          const updated = [...lineItems];
                          updated[idx].itemType = e.target.value as any;
                          setLineItems(updated);
                        }}
                        className="input"
                      >
                        <option value="CONSULTATION">Consultation</option>
                        <option value="LAB_TEST">Lab Test</option>
                        <option value="PHARMACY">Pharmacy</option>
                        <option value="PROCEDURE">Procedure</option>
                        <option value="ROOM_CHARGE">Room Charge</option>
                        <option value="OTHER">Other</option>
                      </select>
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => {
                          const updated = [...lineItems];
                          updated[idx].quantity = Number(e.target.value);
                          setLineItems(updated);
                        }}
                        required
                        className="input"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Price"
                        value={item.unitPrice}
                        onChange={(e) => {
                          const updated = [...lineItems];
                          updated[idx].unitPrice = Number(e.target.value);
                          setLineItems(updated);
                        }}
                        required
                        className="input"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveLineItem(idx)}
                        disabled={lineItems.length <= 1}
                        className="btn btn-ghost btn-sm"
                        style={{ color: "#ef4444", padding: 4 }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="label">Invoice Notes / Payment Terms</label>
                <textarea
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="Payment due upon receipt..."
                  rows={2}
                  className="input"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? "Creating..." : "Save Draft Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ITEM TO DRAFT MODAL */}
      {showAddItemModal && selectedInvoice && (
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
              maxWidth: 520,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Add Line Item to Draft</h2>
              <button onClick={() => setShowAddItemModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddItemToDraft}>
              <div style={{ marginBottom: 14 }}>
                <label className="label">Description *</label>
                <input
                  type="text"
                  placeholder="e.g. Additional Nursing Charge"
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  required
                  className="input"
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="label">Item Type *</label>
                <select
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value as any)}
                  className="input"
                >
                  <option value="CONSULTATION">Consultation</option>
                  <option value="LAB_TEST">Lab Test</option>
                  <option value="PHARMACY">Pharmacy</option>
                  <option value="PROCEDURE">Procedure</option>
                  <option value="ROOM_CHARGE">Room Charge</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div>
                  <label className="label">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(Number(e.target.value))}
                    required
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Unit Price (INR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(Number(e.target.value))}
                    required
                    className="input"
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setShowAddItemModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? "Adding..." : "Add to Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONSOLIDATE ENCOUNTER MODAL */}
      {showConsolidateModal && (
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
              maxWidth: 600,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Consolidate Visit Encounter Charges</h2>
              <button onClick={() => setShowConsolidateModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
              This automatically scans the patient encounter and aggregates doctor consultation fees, completed laboratory orders, and dispensed pharmacy medicines into a unified invoice.
            </p>

            <form onSubmit={handleConsolidateEncounter}>
              <div style={{ marginBottom: 24 }}>
                <label className="label">Select Patient Encounter Appointment *</label>
                <select
                  value={selectedAppointmentId}
                  onChange={(e) => setSelectedAppointmentId(e.target.value)}
                  required
                  className="input"
                >
                  <option value="">-- Choose Encounter --</option>
                  {appointments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {new Date(a.appointmentDate).toLocaleDateString()} — {a.patient?.firstName} {a.patient?.lastName} with Dr. {a.doctor?.user?.firstName} {a.doctor?.user?.lastName} ({a.status})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setShowConsolidateModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? "Consolidating..." : "Consolidate into Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {showCashModal && selectedInvoice && (
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
              maxWidth: 520,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Record Counter Payment</h2>
              <button onClick={() => setShowCashModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRecordCashPayment}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
                  Invoice: <strong>{selectedInvoice.invoiceNumber}</strong> | Balance: ₹{Number(selectedInvoice.outstandingBalance).toFixed(2)}
                </div>
                <label className="label">Payment Amount (INR) *</label>
                <input
                  type="number"
                  step="0.01"
                  max={Number(selectedInvoice.outstandingBalance)}
                  value={cashAmount}
                  onChange={(e) => setCashAmount(Number(e.target.value))}
                  required
                  className="input"
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="label">Payment Method *</label>
                <select
                  value={counterPaymentMethod}
                  onChange={(e) => setCounterPaymentMethod(e.target.value)}
                  className="input"
                >
                  <option value="CASH">Cash</option>
                  <option value="CREDIT_CARD">Credit Card POS</option>
                  <option value="DEBIT_CARD">Debit Card POS</option>
                  <option value="UPI">Counter UPI / QR</option>
                  <option value="INSURANCE">Insurance TPA</option>
                </select>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label className="label">Cashier Notes / Reference</label>
                <input
                  type="text"
                  value={cashNotes}
                  onChange={(e) => setCashNotes(e.target.value)}
                  placeholder="e.g. Counter Register #1 / UPI Auth code"
                  className="input"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setShowCashModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-success">
                  {submitting ? "Processing..." : "Generate Official Receipt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REFUND MODAL */}
      {showRefundModal && selectedPaymentForRefund && (
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
              maxWidth: 500,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Issue Payment Refund</h2>
              <button onClick={() => setShowRefundModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleProcessRefund}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
                  Receipt: <strong>{selectedPaymentForRefund.receiptNumber}</strong> | Max Refund: ₹{Number(selectedPaymentForRefund.amount).toFixed(2)}
                </div>
                <label className="label">Refund Amount (INR) *</label>
                <input
                  type="number"
                  step="0.01"
                  max={Number(selectedPaymentForRefund.amount)}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(Number(e.target.value))}
                  required
                  className="input"
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label className="label">Refund Reason *</label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Duplicate charge / Overpayment / Service cancelled"
                  required
                  className="input"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setShowRefundModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-danger">
                  {submitting ? "Refunding..." : "Confirm Refund"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID INVOICE MODAL */}
      {showVoidModal && selectedInvoice && (
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
              maxWidth: 500,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Void Invoice</h2>
              <button onClick={() => setShowVoidModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
              Voiding cancels invoice <strong>{selectedInvoice.invoiceNumber}</strong>. Note that invoices with active settled payments cannot be voided until payments are refunded.
            </p>

            <form onSubmit={handleVoidInvoice}>
              <div style={{ marginBottom: 24 }}>
                <label className="label">Void Reason</label>
                <input
                  type="text"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Created in error / Patient transferred"
                  className="input"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setShowVoidModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-danger">
                  {submitting ? "Voiding..." : "Void Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
