"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { apiRequest, API_BASE } from "../lib/api";
import {
  Pill,
  Plus,
  Search,
  FileDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Stethoscope,
  X,
  Filter,
} from "lucide-react";

interface Medicine {
  id: string;
  name: string;
  genericName: string;
  form: string;
  strength: string;
}

interface PrescriptionItem {
  id: string;
  medicineId: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions?: string;
  dispensedQuantity: number;
  medicine: Medicine;
}

interface Prescription {
  id: string;
  prescriptionDate: string;
  status: "PENDING" | "PARTIALLY_DISPENSED" | "DISPENSED" | "CANCELLED";
  notes?: string;
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
  items: PrescriptionItem[];
}

export default function PrescriptionsPage() {
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [rxNotes, setRxNotes] = useState("");
  const [items, setItems] = useState<
    Array<{
      medicineId: string;
      dosage: string;
      frequency: string;
      duration: string;
      quantity: number;
      instructions: string;
      form: string;
    }>
  >([
    {
      medicineId: "",
      dosage: "1 tablet",
      frequency: "BD",
      duration: "5 days",
      quantity: 10,
      instructions: "After food",
      form: "TABLET",
    },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedCancelRx, setSelectedCancelRx] = useState<Prescription | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const openCancelModal = (rx: Prescription) => {
    setSelectedCancelRx(rx);
    setCancelReason("");
    setShowCancelModal(true);
  };

  const handleCancelPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCancelRx) return;
    try {
      setCancelling(true);
      await apiRequest(`/prescriptions/${selectedCancelRx.id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason: cancelReason }),
      });
      setShowCancelModal(false);
      await fetchPrescriptions();
    } catch (err: any) {
      alert(err.message || "Failed to cancel prescription.");
    } finally {
      setCancelling(false);
    }
  };

  const fetchPrescriptions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<Prescription[]>("/prescriptions");
      setPrescriptions(data);
    } catch (err: any) {
      setError(err.message || "Failed to load prescriptions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrescriptions();
  }, []);

  const openCreateModal = async () => {
    try {
      setShowCreateModal(true);
      const [pts, meds, recs] = await Promise.all([
        apiRequest<{ data?: any[] } | any[]>("/patients?limit=100"),
        apiRequest<any[]>("/pharmacy/medicines"),
        apiRequest<{ data?: any[] } | any[]>("/medical-records?limit=100"),
      ]);
      const ptsList = Array.isArray(pts) ? pts : (pts as any).items || (pts as any).data || [];
      const recsList = Array.isArray(recs) ? recs : (recs as any).items || (recs as any).data || [];
      setPatients(ptsList);
      setMedicines(meds || []);
      setRecords(recsList);
      if (ptsList.length > 0) setSelectedPatientId(ptsList[0].id);
      if (recsList.length > 0) setSelectedRecordId(recsList[0].id);
      if (meds && meds.length > 0) {
        setItems([
          {
            medicineId: meds[0].id,
            dosage: "1 tablet",
            frequency: "BD",
            duration: "5 days",
            quantity: 10,
            instructions: "Take with food",
            form: meds[0].form || "TABLET",
          },
        ]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to initialize prescription form data.");
    }
  };

  const addItemRow = () => {
    const defaultMedId = medicines.length > 0 ? medicines[0].id : "";
    setItems([
      ...items,
      {
        medicineId: defaultMedId,
        dosage: "1 tablet",
        frequency: "OD",
        duration: "5 days",
        quantity: 5,
        instructions: "",
        form: "TABLET",
      },
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleCreatePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !selectedRecordId) {
      alert("Please select both a patient and medical record.");
      return;
    }
    try {
      setSubmitting(true);
      await apiRequest("/prescriptions", {
        method: "POST",
        body: JSON.stringify({
          patientId: selectedPatientId,
          medicalRecordId: selectedRecordId,
          notes: rxNotes,
          items: items.map((i) => ({
            ...i,
            quantity: Number(i.quantity),
          })),
        }),
      });
      setShowCreateModal(false);
      await fetchPrescriptions();
    } catch (err: any) {
      alert(err.message || "Failed to create prescription.");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPdf = async (rxId: string) => {
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
      alert(err.message || "PDF generation error.");
    }
  };

  const filtered = prescriptions.filter((rx) => {
    const matchesStatus = statusFilter === "ALL" || rx.status === statusFilter;
    const patName = `${rx.patient?.firstName} ${rx.patient?.lastName}`.toLowerCase();
    const docName = `${rx.doctor?.user?.firstName} ${rx.doctor?.user?.lastName}`.toLowerCase();
    const matchesSearch =
      patName.includes(search.toLowerCase()) ||
      docName.includes(search.toLowerCase()) ||
      rx.patient?.mrn.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DISPENSED":
        return <span className="badge badge-success">DISPENSED</span>;
      case "PARTIALLY_DISPENSED":
        return <span className="badge badge-warning">PARTIALLY DISPENSED</span>;
      case "CANCELLED":
        return <span className="badge badge-danger">CANCELLED</span>;
      default:
        return <span className="badge badge-info">PENDING</span>;
    }
  };

  return (
    <div style={{ padding: "8px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
            Prescriptions Management
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>
            Hospital electronic prescription authoring, inventory integration & certified PDF letterheads
          </p>
        </div>

        {user?.role === "DOCTOR" && (
          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} />
            <span>Issue Prescription</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 24,
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 240 }}>
          <Search size={16} style={{ color: "#94a3b8" }} />
          <input
            type="text"
            className="input"
            placeholder="Search by patient, MRN, or doctor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Filter size={16} style={{ color: "#94a3b8" }} />
          <select
            className="input"
            style={{ width: "auto" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending Dispensation</option>
            <option value="PARTIALLY_DISPENSED">Partially Dispensed</option>
            <option value="DISPENSED">Fully Dispensed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Prescription List */}
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
          Loading electronic prescriptions...
        </div>
      ) : error ? (
        <div className="card" style={{ padding: 24, color: "#ef4444", background: "#fef2f2" }}>
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <Pill size={40} style={{ color: "#cbd5e1", margin: "0 auto 12px" }} />
          <h3 style={{ margin: "0 0 6px", color: "#334155" }}>No prescriptions found</h3>
          <p style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>
            {search || statusFilter !== "ALL"
              ? "Try adjusting your search filters."
              : "No clinical prescriptions recorded yet."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filtered.map((rx) => (
            <div key={rx.id} className="card" style={{ padding: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  borderBottom: "1px solid #f1f5f9",
                  paddingBottom: 14,
                  marginBottom: 14,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                      Rx #{rx.id.substring(0, 8).toUpperCase()}
                    </span>
                    {getStatusBadge(rx.status)}
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                    Prescribed on {new Date(rx.prescriptionDate).toLocaleDateString()} at{" "}
                    {new Date(rx.prescriptionDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => downloadPdf(rx.id)}
                    title="Download Official PDF"
                  >
                    <FileDown size={14} />
                    <span>Download PDF</span>
                  </button>

                  {rx.status === "PENDING" &&
                    (user?.role === "DOCTOR" || user?.role === "HOSPITAL_ADMIN" || user?.role === "SUPER_ADMIN") && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => openCancelModal(rx)}
                        title="Cancel Prescription"
                      >
                        <X size={14} />
                        <span>Cancel Rx</span>
                      </button>
                    )}
                </div>
              </div>

              {/* Patient & Doctor Sub-Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
                    <User size={14} />
                    <span>PATIENT</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginTop: 4 }}>
                    {rx.patient.firstName} {rx.patient.lastName}
                  </div>
                  <div style={{ fontSize: 12, color: "#0284c7" }}>MRN: {rx.patient.mrn}</div>
                </div>

                <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
                    <Stethoscope size={14} />
                    <span>PRESCRIBING DOCTOR</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginTop: 4 }}>
                    Dr. {rx.doctor.user.firstName} {rx.doctor.user.lastName}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {rx.doctor.specialization} • Reg #{rx.doctor.licenseNumber}
                  </div>
                </div>
              </div>

              {/* Prescribed Items Table */}
              <div style={{ overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Dosage</th>
                      <th>Frequency</th>
                      <th>Duration</th>
                      <th>Prescribed</th>
                      <th>Dispensed</th>
                      <th>Instructions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rx.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.medicine.name}</strong> ({item.medicine.strength})
                          <div style={{ fontSize: 11, color: "#64748b" }}>{item.medicine.genericName}</div>
                        </td>
                        <td>{item.dosage}</td>
                        <td><span className="badge badge-info">{item.frequency}</span></td>
                        <td>{item.duration}</td>
                        <td>{item.quantity}</td>
                        <td>
                          <span
                            style={{
                              color: item.dispensedQuantity >= item.quantity ? "#10b981" : "#f59e0b",
                              fontWeight: 600,
                            }}
                          >
                            {item.dispensedQuantity} / {item.quantity}
                          </span>
                        </td>
                        <td style={{ color: "#64748b" }}>{item.instructions || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rx.notes && (
                <div style={{ marginTop: 12, fontSize: 12, color: "#475569", background: "#f1f5f9", padding: "8px 12px", borderRadius: 6 }}>
                  <strong>Notes:</strong> {rx.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Prescription Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 760 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Author Clinical Prescription</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePrescription}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="label">Select Patient</label>
                  <select
                    className="input"
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    required
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} ({p.mrn})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Linked Medical Record</label>
                  <select
                    className="input"
                    value={selectedRecordId}
                    onChange={(e) => setSelectedRecordId(e.target.value)}
                    required
                  >
                    {records.map((r) => (
                      <option key={r.id} value={r.id}>
                        Record #{r.id.substring(0, 8)} ({new Date(r.visitDate || r.createdAt).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label className="label" style={{ margin: 0 }}>Medications (Hospital Inventory Formulary)</label>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addItemRow}>
                    <Plus size={14} />
                    <span>Add Item</span>
                  </button>
                </div>

                {items.map((row, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 2fr auto",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 8,
                      padding: 10,
                      background: "#f8fafc",
                      borderRadius: 8,
                    }}
                  >
                    <select
                      className="input"
                      value={row.medicineId}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].medicineId = e.target.value;
                        setItems(newItems);
                      }}
                      required
                    >
                      {medicines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.strength})
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      className="input"
                      placeholder="Dosage"
                      value={row.dosage}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].dosage = e.target.value;
                        setItems(newItems);
                      }}
                      required
                    />

                    <select
                      className="input"
                      value={row.frequency}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].frequency = e.target.value;
                        setItems(newItems);
                      }}
                    >
                      <option value="OD">OD (Once daily)</option>
                      <option value="BD">BD (Twice daily)</option>
                      <option value="TDS">TDS (Thrice daily)</option>
                      <option value="QID">QID (4 times daily)</option>
                      <option value="SOS">SOS (As needed)</option>
                    </select>

                    <input
                      type="text"
                      className="input"
                      placeholder="Duration"
                      value={row.duration}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].duration = e.target.value;
                        setItems(newItems);
                      }}
                      required
                    />

                    <input
                      type="number"
                      className="input"
                      min="1"
                      placeholder="Qty"
                      value={row.quantity}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].quantity = parseInt(e.target.value, 10) || 1;
                        setItems(newItems);
                      }}
                      required
                    />

                    <input
                      type="text"
                      className="input"
                      placeholder="Special instructions..."
                      value={row.instructions}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].instructions = e.target.value;
                        setItems(newItems);
                      }}
                    />

                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        style={{
                          background: "#fee2e2",
                          border: "none",
                          color: "#ef4444",
                          borderRadius: 6,
                          padding: 6,
                          cursor: "pointer",
                        }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="label">Prescription Clinical Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Additional patient guidance or dietary restrictions..."
                  value={rxNotes}
                  onChange={(e) => setRxNotes(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Signing & Issuing..." : "Issue Digital Prescription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Cancel Prescription Modal */}
      {showCancelModal && selectedCancelRx && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#dc2626" }}>
                Cancel Clinical Prescription
              </h2>
              <button
                onClick={() => setShowCancelModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCancelPrescription}>
              <p style={{ fontSize: 14, color: "#475569", marginBottom: 16 }}>
                Are you sure you want to cancel Prescription{" "}
                <strong>#{selectedCancelRx.id.substring(0, 8).toUpperCase()}</strong> for patient{" "}
                <strong>{selectedCancelRx.patient.firstName} {selectedCancelRx.patient.lastName}</strong>?
                This action is legally recorded in the audit trail and prevents pharmacy dispensation.
              </p>

              <div style={{ marginBottom: 20 }}>
                <label className="label">Cancellation Clinical Reason</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="E.g., Patient reported allergic reaction to amoxicillin; switching to macrolide..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                >
                  Keep Active
                </button>
                <button type="submit" className="btn btn-danger" disabled={cancelling}>
                  {cancelling ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
