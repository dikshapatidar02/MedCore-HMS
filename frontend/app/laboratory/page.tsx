"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import {
  FlaskConical,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Stethoscope,
  X,
  Filter,
  Clock,
  Eye,
  Check,
  Ban,
  Activity,
  Layers,
  FileCheck,
} from "lucide-react";

interface LabTest {
  id: string;
  testCode: string;
  testName: string;
  description?: string;
  category: string;
  sampleType: string;
  unit?: string;
  referenceRange?: string;
  price: number;
}

interface LabResult {
  id: string;
  labTestId: string;
  numericValue?: number;
  textValue?: string;
  unit?: string;
  referenceRange?: string;
  flag?: "NORMAL" | "ABNORMAL" | "CRITICAL_HIGH" | "CRITICAL_LOW";
  notes?: string;
  labTest: LabTest;
}

interface LabOrder {
  id: string;
  orderNumber: string;
  status:
    | "ORDERED"
    | "SAMPLE_COLLECTED"
    | "PROCESSING"
    | "RESULT_UPLOADED"
    | "UNDER_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "CANCELLED";
  priority: "ROUTINE" | "URGENT" | "STAT";
  clinicalNotes?: string;
  sampleBarcode?: string;
  sampleCollectedAt?: string;
  resultsEnteredAt?: string;
  approvedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  doctor: {
    licenseNumber: string;
    specialization: string;
    user: { firstName: string; lastName: string };
  };
  patient: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
  };
  technician?: { firstName: string; lastName: string };
  reviewer?: { firstName: string; lastName: string };
  items: Array<{
    id: string;
    labTestId: string;
    instructions?: string;
    labTest: LabTest;
  }>;
  results?: LabResult[];
}

export default function LaboratoryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"ORDERS" | "CATALOGUE">("ORDERS");
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Create Order State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [orderPriority, setOrderPriority] = useState<"ROUTINE" | "URGENT" | "STAT">("ROUTINE");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Result Entry State
  const [showResultModal, setShowResultModal] = useState(false);
  const [activeOrder, setActiveOrder] = useState<LabOrder | null>(null);
  const [resultInputs, setResultInputs] = useState<
    Record<
      string,
      {
        numericValue?: number;
        textValue?: string;
        unit?: string;
        referenceRange?: string;
        flag?: "NORMAL" | "ABNORMAL" | "CRITICAL_HIGH" | "CRITICAL_LOW";
        notes?: string;
      }
    >
  >({});

  // Review Modal State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<LabOrder | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  // Cancel Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelOrderTarget, setCancelOrderTarget] = useState<LabOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Create Test State
  const [showCreateTestModal, setShowCreateTestModal] = useState(false);
  const [newTest, setNewTest] = useState({
    testCode: "",
    testName: "",
    description: "",
    category: "BIOCHEMISTRY",
    sampleType: "BLOOD",
    unit: "",
    referenceRange: "",
    price: 0,
  });

  const isDoctor = user?.role === "DOCTOR";
  const isLabTech = user?.role === "LAB_TECHNICIAN";
  const isAdmin = user?.role === "HOSPITAL_ADMIN" || user?.role === "SUPER_ADMIN";
  const canPrescribeOrder = isDoctor || isAdmin;
  const canProcessSample = isLabTech || isAdmin;
  const canReview = isDoctor || isAdmin;

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest("/laboratory/orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Failed to load laboratory orders.");
    } finally {
      setLoading(false);
    }
  };

  const fetchTests = async () => {
    try {
      const data = await apiRequest("/laboratory/tests");
      setTests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load tests", err);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchTests();
  }, []);

  const openCreateModal = async () => {
    try {
      const pats = await apiRequest<any>("/patients");
      const list = Array.isArray(pats) ? pats : pats?.items || [];
      setPatients(list);
      setShowCreateModal(true);
    } catch (err: any) {
      alert("Failed to load patients for order creation.");
    }
  };

  const handlePatientChange = async (patientId: string) => {
    setSelectedPatientId(patientId);
    setSelectedRecordId("");
    if (!patientId) {
      setRecords([]);
      return;
    }
    try {
      const recs = await apiRequest<any>(`/emr/records?patientId=${patientId}`);
      const list = Array.isArray(recs) ? recs : recs?.items || [];
      setRecords(list);
      if (list && list.length > 0) {
        setSelectedRecordId(list[0].id);
      }
    } catch (err) {
      console.error("Failed to load records for patient", err);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !selectedRecordId) {
      alert("Please select both a patient and an active medical record.");
      return;
    }
    if (selectedTestIds.length === 0) {
      alert("Please select at least one laboratory test.");
      return;
    }

    try {
      setSubmitting(true);
      await apiRequest("/laboratory/orders", {
        method: "POST",
        body: JSON.stringify({
          patientId: selectedPatientId,
          medicalRecordId: selectedRecordId,
          priority: orderPriority,
          clinicalNotes,
          tests: selectedTestIds.map((tid) => ({ testId: tid })),
        }),
      });
      setShowCreateModal(false);
      setSelectedTestIds([]);
      setClinicalNotes("");
      await fetchOrders();
    } catch (err: any) {
      alert(err.message || "Failed to create lab order.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCollectSample = async (orderId: string) => {
    const barcode = prompt("Enter sample barcode identifier (e.g. BC-BLOOD-001):", `SMP-${Date.now().toString().slice(-6)}`);
    if (barcode === null) return;
    try {
      await apiRequest(`/laboratory/orders/${orderId}/collect-sample`, {
        method: "POST",
        body: JSON.stringify({ sampleBarcode: barcode }),
      });
      await fetchOrders();
    } catch (err: any) {
      alert(err.message || "Failed to record sample collection.");
    }
  };

  const handleProcessSample = async (orderId: string) => {
    if (!confirm("Confirm start of sample processing in laboratory equipment?")) return;
    try {
      await apiRequest(`/laboratory/orders/${orderId}/process-sample`, {
        method: "POST",
      });
      await fetchOrders();
    } catch (err: any) {
      alert(err.message || "Failed to mark sample as processing.");
    }
  };

  const openResultModal = (order: LabOrder) => {
    setActiveOrder(order);
    const initialInputs: Record<string, any> = {};
    const testList = order.items || (order.results as any) || [];
    testList.forEach((item: any) => {
      const testId = item.labTestId || item.id;
      const existing = order.results?.find((r) => r.labTestId === testId);
      const testObj = item.labTest || item;
      initialInputs[testId] = {
        numericValue: existing?.numericValue || undefined,
        textValue: existing?.textValue || (existing as any)?.resultValue || "",
        unit: existing?.unit || testObj?.units || testObj?.unit || "",
        referenceRange: existing?.referenceRange || testObj?.referenceRange || "",
        flag: existing?.flag || (existing as any)?.status || "NORMAL",
        notes: existing?.notes || (existing as any)?.findings || "",
      };
    });
    setResultInputs(initialInputs);
    setShowResultModal(true);
  };

  const handleSubmitResults = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    try {
      setSubmitting(true);
      const testList = activeOrder.items || (activeOrder.results as any) || [];
      const resultsPayload = testList.map((item: any) => {
        const testId = item.labTestId || item.id;
        const input = resultInputs[testId] || {};
        const testObj = item.labTest || item;
        return {
          testId,
          labTestId: testId,
          resultValue: String(input.numericValue ?? input.textValue ?? "Normal"),
          numericValue: input.numericValue ? Number(input.numericValue) : undefined,
          textValue: input.textValue || undefined,
          unit: input.unit || testObj?.units || testObj?.unit,
          referenceRange: input.referenceRange || testObj?.referenceRange,
          flag: input.flag || "NORMAL",
          notes: input.notes,
          findings: input.notes,
        };
      });

      await apiRequest(`/laboratory/orders/${activeOrder.id}/results`, {
        method: "POST",
        body: JSON.stringify({ results: resultsPayload }),
      });
      setShowResultModal(false);
      setActiveOrder(null);
      await fetchOrders();
    } catch (err: any) {
      alert(err.message || "Failed to submit lab results.");
    } finally {
      setSubmitting(false);
    }
  };

  const openReviewModal = (order: LabOrder) => {
    setReviewOrder(order);
    setReviewNotes("");
    setShowReviewModal(true);
  };

  const handleReviewAction = async (action: "APPROVE" | "REJECT") => {
    if (!reviewOrder) return;
    try {
      setSubmitting(true);
      await apiRequest(`/laboratory/orders/${reviewOrder.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          action,
          reviewNotes,
        }),
      });
      setShowReviewModal(false);
      setReviewOrder(null);
      await fetchOrders();
    } catch (err: any) {
      alert(err.message || `Failed to ${action.toLowerCase()} lab order.`);
    } finally {
      setSubmitting(false);
    }
  };

  const openCancelModal = (order: LabOrder) => {
    setCancelOrderTarget(order);
    setCancelReason("");
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelOrderTarget) return;
    try {
      setSubmitting(true);
      await apiRequest(`/laboratory/orders/${cancelOrderTarget.id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason: cancelReason }),
      });
      setShowCancelModal(false);
      setCancelOrderTarget(null);
      await fetchOrders();
    } catch (err: any) {
      alert(err.message || "Failed to cancel lab order.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await apiRequest("/laboratory/tests", {
        method: "POST",
        body: JSON.stringify({
          ...newTest,
          price: Number(newTest.price),
        }),
      });
      setShowCreateTestModal(false);
      setNewTest({
        testCode: "",
        testName: "",
        description: "",
        category: "BIOCHEMISTRY",
        sampleType: "BLOOD",
        unit: "",
        referenceRange: "",
        price: 0,
      });
      await fetchTests();
    } catch (err: any) {
      alert(err.message || "Failed to create lab test.");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ORDERED":
        return <span className="badge badge-warning">Ordered</span>;
      case "SAMPLE_COLLECTED":
        return <span className="badge badge-info">Sample Collected</span>;
      case "PROCESSING":
        return <span className="badge badge-primary">Processing</span>;
      case "RESULT_UPLOADED":
        return <span className="badge badge-secondary">Results Ready</span>;
      case "APPROVED":
        return <span className="badge badge-success">Approved</span>;
      case "REJECTED":
        return <span className="badge badge-danger">Rejected</span>;
      case "CANCELLED":
        return <span className="badge badge-secondary" style={{ opacity: 0.7 }}>Cancelled</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const filteredOrders = orders.filter((ord) => {
    const matchesStatus = statusFilter === "ALL" || ord.status === statusFilter;
    const patName = `${ord.patient?.firstName} ${ord.patient?.lastName}`.toLowerCase();
    const docName = `${ord.doctor?.user?.firstName} ${ord.doctor?.user?.lastName}`.toLowerCase();
    const orderNum = ord.orderNumber?.toLowerCase() || "";
    const matchesSearch =
      patName.includes(search.toLowerCase()) ||
      docName.includes(search.toLowerCase()) ||
      orderNum.includes(search.toLowerCase()) ||
      ord.patient?.mrn.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                boxShadow: "0 10px 15px -3px rgba(2, 132, 199, 0.3)",
              }}
            >
              <FlaskConical size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Laboratory Diagnostics & Pathology
              </h1>
              <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--text-muted)" }}>
                Diagnostic orders, sample collection, structured results, and clinical validation
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div
            style={{
              display: "flex",
              background: "var(--bg-card)",
              padding: 4,
              borderRadius: 10,
              border: "1px solid var(--border)",
            }}
          >
            <button
              onClick={() => setTab("ORDERS")}
              className={`btn btn-sm ${tab === "ORDERS" ? "btn-primary" : "btn-ghost"}`}
              style={{ borderRadius: 8 }}
            >
              Lab Orders ({orders.length})
            </button>
            <button
              onClick={() => setTab("CATALOGUE")}
              className={`btn btn-sm ${tab === "CATALOGUE" ? "btn-primary" : "btn-ghost"}`}
              style={{ borderRadius: 8 }}
            >
              Test Catalogue ({tests.length})
            </button>
          </div>

          {tab === "ORDERS" && canPrescribeOrder && (
            <button onClick={openCreateModal} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Plus size={18} />
              New Lab Order
            </button>
          )}

          {tab === "CATALOGUE" && (isAdmin || isLabTech) && (
            <button
              onClick={() => setShowCreateTestModal(true)}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <Plus size={18} />
              Add Test
            </button>
          )}
        </div>
      </div>

      {tab === "ORDERS" ? (
        <>
          {/* Controls Bar */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginBottom: 24,
              flexWrap: "wrap",
              background: "var(--bg-card)",
              padding: "16px 20px",
              borderRadius: 14,
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
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
                placeholder="Search by patient, MRN, doctor, or order number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input"
                style={{ paddingLeft: 42, width: "100%" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Filter size={18} style={{ color: "var(--text-muted)" }} />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input"
                style={{ width: 190 }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ORDERED">Ordered</option>
                <option value="SAMPLE_COLLECTED">Sample Collected</option>
                <option value="PROCESSING">Processing</option>
                <option value="RESULT_UPLOADED">Results Ready</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Orders List */}
          {loading ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <Activity className="animate-spin" size={32} style={{ margin: "0 auto 12px", color: "var(--primary)" }} />
              <div style={{ color: "var(--text-muted)" }}>Loading laboratory orders...</div>
            </div>
          ) : error ? (
            <div className="alert alert-danger" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          ) : filteredOrders.length === 0 ? (
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
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px" }}>No Laboratory Orders Found</h3>
              <p style={{ color: "var(--text-muted)", margin: "0 0 20px", fontSize: 14 }}>
                {search || statusFilter !== "ALL"
                  ? "Try adjusting your search criteria or status filter."
                  : "Clinical lab orders issued by treating doctors will appear here."}
              </p>
              {canPrescribeOrder && (
                <button onClick={openCreateModal} className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Plus size={16} /> Create Lab Order
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              {filteredOrders.map((ord) => (
                <div
                  key={ord.id}
                  style={{
                    background: "var(--bg-card)",
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    padding: 24,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                          {ord.orderNumber}
                        </span>
                        {getStatusBadge(ord.status)}
                        <span
                          className={`badge ${
                            ord.priority === "STAT"
                              ? "badge-danger"
                              : ord.priority === "URGENT"
                              ? "badge-warning"
                              : "badge-info"
                          }`}
                        >
                          {ord.priority}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 20, fontSize: 13, color: "var(--text-muted)", flexWrap: "wrap" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <User size={14} />
                          <strong>
                            {ord.patient?.firstName} {ord.patient?.lastName}
                          </strong>{" "}
                          ({ord.patient?.mrn})
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Stethoscope size={14} />
                          Dr. {ord.doctor?.user?.firstName} {ord.doctor?.user?.lastName} ({ord.doctor?.specialization})
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Clock size={14} />
                          Ordered: {new Date(ord.createdAt).toLocaleDateString()}
                        </span>
                        {ord.sampleBarcode && (
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Layers size={14} />
                            Barcode: <code>{ord.sampleBarcode}</code>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons based on Status & Role */}
                    <div style={{ display: "flex", gap: 10 }}>
                      {ord.status === "ORDERED" && canProcessSample && (
                        <button
                          onClick={() => handleCollectSample(ord.id)}
                          className="btn btn-sm btn-outline-primary"
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <Check size={14} /> Collect Sample
                        </button>
                      )}

                      {ord.status === "SAMPLE_COLLECTED" && canProcessSample && (
                        <button
                          onClick={() => handleProcessSample(ord.id)}
                          className="btn btn-sm btn-outline-primary"
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <Activity size={14} /> Process Sample
                        </button>
                      )}

                      {(ord.status === "PROCESSING" || ord.status === "RESULT_UPLOADED") && canProcessSample && (
                        <button
                          onClick={() => openResultModal(ord)}
                          className="btn btn-sm btn-primary"
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <FileText size={14} /> Enter Results
                        </button>
                      )}

                      {ord.status === "RESULT_UPLOADED" && canReview && (
                        <button
                          onClick={() => openReviewModal(ord)}
                          className="btn btn-sm btn-success"
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <FileCheck size={14} /> Review & Approve
                        </button>
                      )}

                      {["ORDERED", "SAMPLE_COLLECTED", "PROCESSING", "RESULT_UPLOADED"].includes(ord.status) && (isDoctor || isAdmin) && (
                        <button
                          onClick={() => openCancelModal(ord)}
                          className="btn btn-sm btn-outline-danger"
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <Ban size={14} /> Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Test items list */}
                  <div
                    style={{
                      background: "var(--bg-subtle, #f8fafc)",
                      borderRadius: 12,
                      padding: "12px 16px",
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                      Ordered Diagnostic Tests
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {(ord.items || (ord.results as any) || []).map((it: any) => {
                        const testObj = it.labTest || it;
                        const testName = testObj?.name || testObj?.testName || "Diagnostic Test";
                        const testCode = testObj?.code || testObj?.testCode || "";
                        return (
                          <span
                            key={it.id}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              background: "#fff",
                              border: "1px solid var(--border)",
                              fontSize: 13,
                              fontWeight: 500,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <FlaskConical size={14} style={{ color: "var(--primary)" }} />
                            {testName} {testCode ? `(${testCode})` : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Results preview if entered */}
                  {ord.results && ord.results.length > 0 && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "14px 16px",
                        background: "#ffffff",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>
                        Diagnostic Results:
                      </div>
                      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-muted)" }}>
                            <th style={{ padding: "6px 8px" }}>Test</th>
                            <th style={{ padding: "6px 8px" }}>Result</th>
                            <th style={{ padding: "6px 8px" }}>Reference Range</th>
                            <th style={{ padding: "6px 8px" }}>Unit</th>
                            <th style={{ padding: "6px 8px" }}>Flag</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ord.results.map((res) => (
                            <tr key={res.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "8px 8px", fontWeight: 600 }}>{res.labTest?.testName}</td>
                              <td style={{ padding: "8px 8px" }}>{res.numericValue !== null && res.numericValue !== undefined ? res.numericValue : res.textValue || "—"}</td>
                              <td style={{ padding: "8px 8px", color: "var(--text-muted)" }}>{res.referenceRange || "—"}</td>
                              <td style={{ padding: "8px 8px", color: "var(--text-muted)" }}>{res.unit || "—"}</td>
                              <td style={{ padding: "8px 8px" }}>
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
                      {ord.reviewer && (
                        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 16 }}>
                          <span>Reviewed by: Dr. {ord.reviewer.firstName} {ord.reviewer.lastName}</span>
                          {ord.approvedAt && <span>Approved: {new Date(ord.approvedAt).toLocaleDateString()}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Test Catalogue View */
        <div style={{ background: "var(--bg-card)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
          <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-subtle, #f8fafc)", borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-muted)" }}>
                <th style={{ padding: "14px 20px" }}>Test Code</th>
                <th style={{ padding: "14px 20px" }}>Test Name</th>
                <th style={{ padding: "14px 20px" }}>Category</th>
                <th style={{ padding: "14px 20px" }}>Sample Type</th>
                <th style={{ padding: "14px 20px" }}>Unit</th>
                <th style={{ padding: "14px 20px" }}>Reference Range</th>
                <th style={{ padding: "14px 20px", textAlign: "right" }}>Fee (INR)</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "14px 20px", fontWeight: 700 }}><code>{t.testCode}</code></td>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>{t.testName}</td>
                  <td style={{ padding: "14px 20px" }}>
                    <span className="badge badge-info">{t.category}</span>
                  </td>
                  <td style={{ padding: "14px 20px" }}>{t.sampleType}</td>
                  <td style={{ padding: "14px 20px", color: "var(--text-muted)" }}>{t.unit || "—"}</td>
                  <td style={{ padding: "14px 20px", color: "var(--text-muted)" }}>{t.referenceRange || "—"}</td>
                  <td style={{ padding: "14px 20px", textAlign: "right", fontWeight: 600 }}>₹{Number(t.price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE ORDER MODAL */}
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
              maxWidth: 720,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FlaskConical size={22} style={{ color: "var(--primary)" }} />
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Create Laboratory Diagnostic Order</h2>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateOrder}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="label">Select Patient *</label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => handlePatientChange(e.target.value)}
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

                <div>
                  <label className="label">Medical Record *</label>
                  <select
                    value={selectedRecordId}
                    onChange={(e) => setSelectedRecordId(e.target.value)}
                    required
                    disabled={!selectedPatientId || records.length === 0}
                    className="input"
                  >
                    <option value="">-- Choose Record --</option>
                    {records.map((r) => (
                      <option key={r.id} value={r.id}>
                        {new Date(r.recordDate).toLocaleDateString()} — {r.primaryDiagnosis || "General Consultation"} ({r.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">Order Priority</label>
                <div style={{ display: "flex", gap: 12 }}>
                  {(["ROUTINE", "URGENT", "STAT"] as const).map((pr) => (
                    <label
                      key={pr}
                      style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 8,
                        border: orderPriority === pr ? "2px solid var(--primary)" : "1px solid var(--border)",
                        background: orderPriority === pr ? "var(--bg-subtle)" : "#fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <input
                        type="radio"
                        name="priority"
                        value={pr}
                        checked={orderPriority === pr}
                        onChange={() => setOrderPriority(pr)}
                      />
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{pr}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">Select Diagnostic Tests *</label>
                <div
                  style={{
                    maxHeight: 200,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 12,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  {tests.map((t) => {
                    const isChecked = selectedTestIds.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: 8,
                          borderRadius: 6,
                          background: isChecked ? "var(--bg-subtle, #f0fdf4)" : "transparent",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTestIds([...selectedTestIds, t.id]);
                            } else {
                              setSelectedTestIds(selectedTestIds.filter((id) => id !== t.id));
                            }
                          }}
                        />
                        <span>
                          <strong>{t.testName}</strong> ({t.testCode})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="label">Clinical Indications / Notes</label>
                <textarea
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="Special instructions for the pathology lab technician..."
                  rows={2}
                  className="input"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? "Submitting Order..." : "Issue Lab Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ENTER RESULTS MODAL */}
      {showResultModal && activeOrder && (
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
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                  Enter Laboratory Results — {activeOrder.orderNumber}
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                  Patient: {activeOrder.patient.firstName} {activeOrder.patient.lastName} ({activeOrder.patient.mrn})
                </p>
              </div>
              <button onClick={() => setShowResultModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitResults}>
              <div style={{ display: "grid", gap: 16, marginBottom: 24 }}>
                {(activeOrder.items || (activeOrder.results as any) || []).map((item: any) => {
                  const testId = item.labTestId || item.id;
                  const input = resultInputs[testId] || {};
                  const testObj = item.labTest || item;
                  const testName = testObj?.name || testObj?.testName || "Diagnostic Test";
                  const testCode = testObj?.code || testObj?.testCode || "";
                  const refRange = testObj?.referenceRange || "N/A";
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--bg-subtle, #f8fafc)",
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                        <span>
                          {testName} {testCode ? <code>({testCode})</code> : null}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          Ref Range: {refRange}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
                        <div>
                          <label className="label" style={{ fontSize: 12 }}>Numeric Value</label>
                          <input
                            type="number"
                            step="any"
                            value={input.numericValue !== undefined ? input.numericValue : ""}
                            onChange={(e) =>
                              setResultInputs({
                                ...resultInputs,
                                [item.labTestId]: {
                                  ...input,
                                  numericValue: e.target.value === "" ? undefined : Number(e.target.value),
                                },
                              })
                            }
                            placeholder="e.g. 13.5"
                            className="input"
                          />
                        </div>

                        <div>
                          <label className="label" style={{ fontSize: 12 }}>Text / Qualitative Value</label>
                          <input
                            type="text"
                            value={input.textValue || ""}
                            onChange={(e) =>
                              setResultInputs({
                                ...resultInputs,
                                [item.labTestId]: {
                                  ...input,
                                  textValue: e.target.value,
                                },
                              })
                            }
                            placeholder="e.g. Positive / Clear"
                            className="input"
                          />
                        </div>

                        <div>
                          <label className="label" style={{ fontSize: 12 }}>Clinical Flag</label>
                          <select
                            value={input.flag || "NORMAL"}
                            onChange={(e) =>
                              setResultInputs({
                                ...resultInputs,
                                [item.labTestId]: {
                                  ...input,
                                  flag: e.target.value as any,
                                },
                              })
                            }
                            className="input"
                          >
                            <option value="NORMAL">Normal</option>
                            <option value="ABNORMAL">Abnormal</option>
                            <option value="CRITICAL_HIGH">Critical High</option>
                            <option value="CRITICAL_LOW">Critical Low</option>
                          </select>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={input.notes || ""}
                        onChange={(e) =>
                          setResultInputs({
                            ...resultInputs,
                            [item.labTestId]: {
                              ...input,
                              notes: e.target.value,
                            },
                          })
                        }
                        placeholder="Pathologist diagnostic notes / observations..."
                        className="input"
                        style={{ fontSize: 13 }}
                      />
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setShowResultModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? "Saving Results..." : "Submit Diagnostic Results"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVIEW & APPROVAL MODAL */}
      {showReviewModal && reviewOrder && (
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
              maxWidth: 700,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Review Lab Report Approval</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                  Order: {reviewOrder.orderNumber} | Patient: {reviewOrder.patient.firstName} {reviewOrder.patient.lastName}
                </p>
              </div>
              <button onClick={() => setShowReviewModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>
                ENTERED RESULTS SUMMARY
              </div>
              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 10, border: "1px solid var(--border)" }}>
                {reviewOrder.results?.map((res) => (
                  <div key={res.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{res.labTest?.testName}:</span>
                    <span>
                      {res.numericValue ?? res.textValue} {res.unit} (Ref: {res.referenceRange}) —{" "}
                      <strong>{res.flag}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label className="label">Review / Quality Notes</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Clinical validation notes or reason for approval/rejection..."
                rows={3}
                className="input"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button
                type="button"
                onClick={() => handleReviewAction("REJECT")}
                disabled={submitting}
                className="btn btn-danger"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Ban size={16} /> Reject Report
              </button>

              <div style={{ display: "flex", gap: 12 }}>
                <button type="button" onClick={() => setShowReviewModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewAction("APPROVE")}
                  disabled={submitting}
                  className="btn btn-success"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <CheckCircle2 size={16} /> Approve & Publish Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE TEST CATALOGUE MODAL */}
      {showCreateTestModal && (
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
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Add Laboratory Diagnostic Test</h2>
              <button onClick={() => setShowCreateTestModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTest}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="label">Test Code *</label>
                  <input
                    type="text"
                    required
                    value={newTest.testCode}
                    onChange={(e) => setNewTest({ ...newTest, testCode: e.target.value.toUpperCase() })}
                    placeholder="CBC"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Test Name *</label>
                  <input
                    type="text"
                    required
                    value={newTest.testName}
                    onChange={(e) => setNewTest({ ...newTest, testName: e.target.value })}
                    placeholder="Complete Blood Count"
                    className="input"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="label">Category</label>
                  <select
                    value={newTest.category}
                    onChange={(e) => setNewTest({ ...newTest, category: e.target.value })}
                    className="input"
                  >
                    <option value="HEMATOLOGY">Hematology</option>
                    <option value="BIOCHEMISTRY">Biochemistry</option>
                    <option value="MICROBIOLOGY">Microbiology</option>
                    <option value="SEROLOGY">Serology</option>
                    <option value="RADIOLOGY">Radiology</option>
                  </select>
                </div>
                <div>
                  <label className="label">Sample Type</label>
                  <input
                    type="text"
                    value={newTest.sampleType}
                    onChange={(e) => setNewTest({ ...newTest, sampleType: e.target.value })}
                    placeholder="BLOOD / URINE / SERUM"
                    className="input"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div>
                  <label className="label">Unit</label>
                  <input
                    type="text"
                    value={newTest.unit}
                    onChange={(e) => setNewTest({ ...newTest, unit: e.target.value })}
                    placeholder="g/dL or mg/dL"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Reference Range</label>
                  <input
                    type="text"
                    value={newTest.referenceRange}
                    onChange={(e) => setNewTest({ ...newTest, referenceRange: e.target.value })}
                    placeholder="13.5 - 17.5"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Price (INR)</label>
                  <input
                    type="number"
                    value={newTest.price}
                    onChange={(e) => setNewTest({ ...newTest, price: Number(e.target.value) })}
                    className="input"
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setShowCreateTestModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? "Saving..." : "Add Diagnostic Test"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {showCancelModal && cancelOrderTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: 20,
              width: "100%",
              maxWidth: 500,
              padding: 28,
              border: "1px solid var(--border)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "#fee2e2",
                    color: "#dc2626",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Ban size={20} />
                </div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Cancel Laboratory Order</h3>
              </div>
              <button
                onClick={() => setShowCancelModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
              Are you sure you want to cancel laboratory order <strong>{cancelOrderTarget.orderNumber}</strong> for patient{" "}
              <strong>{cancelOrderTarget.patient?.firstName} {cancelOrderTarget.patient?.lastName}</strong>? This action cannot be undone.
            </p>

            <form onSubmit={handleConfirmCancel}>
              <div style={{ marginBottom: 20 }}>
                <label className="label">Cancellation Reason (Clinical Rationale)</label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="E.g., Patient discharged, duplicate order, wrong test requested..."
                  className="input"
                  style={{ width: "100%" }}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="btn btn-ghost"
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-danger"
                >
                  {submitting ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
