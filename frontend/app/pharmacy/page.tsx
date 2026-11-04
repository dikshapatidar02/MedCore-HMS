"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Layers,
  Pill,
  X,
  Activity,
  History,
  FileCheck,
  TrendingDown,
  TrendingUp,
  Sliders,
  Inbox,
  Filter,
} from "lucide-react";

interface Medicine {
  id: string;
  code: string;
  name: string;
  genericName: string;
  brand?: string;
  manufacturer?: string;
  category?: string;
  strength?: string;
  form: string;
  unit: string;
  reorderLevel: number;
  unitPrice: number;
  totalStock?: number;
  isLowStock?: boolean;
  batches?: any[];
}

interface MedicineBatch {
  id: string;
  batchNumber: string;
  manufacturingDate?: string;
  expiryDate: string;
  initialQuantity: number;
  currentQuantity: number;
  unitCost: number;
  mrp: number;
  supplier?: string;
  status: "ACTIVE" | "QUARANTINED" | "EXPIRED" | "DEPLETED";
  medicine?: Medicine;
}

interface PrescriptionItem {
  id: string;
  medicineId: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  dispensedQuantity: number;
  medicine: Medicine;
}

interface Prescription {
  id: string;
  prescriptionDate: string;
  status: string;
  doctor: {
    specialization: string;
    user: { firstName: string; lastName: string; name?: string };
  };
  patient: {
    mrn: string;
    firstName: string;
    lastName: string;
    user?: { name?: string };
  };
  items: PrescriptionItem[];
}

interface StockMovement {
  id: string;
  medicineId: string;
  batchId?: string;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  createdAt: string;
  medicine?: Medicine;
  batch?: MedicineBatch;
  performedBy?: { id: string; name: string; email: string; role: string };
}

interface DispensingRecord {
  id: string;
  prescriptionItemId: string;
  batchId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: string;
  batch?: MedicineBatch;
  prescriptionItem?: {
    medicine?: Medicine;
    prescription?: {
      id: string;
      patient?: { firstName: string; lastName: string; user?: { name: string } };
      doctor?: { user?: { name: string } };
    };
  };
  dispensedBy?: { name: string; email: string };
}

export default function PharmacyPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<
    "CATALOGUE" | "BATCHES" | "DISPENSING" | "DISPENSING_HISTORY" | "MOVEMENTS" | "ALERTS"
  >("CATALOGUE");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<MedicineBatch[]>([]);
  const [pendingPrescriptions, setPendingPrescriptions] = useState<Prescription[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [dispensingRecords, setDispensingRecords] = useState<DispensingRecord[]>([]);
  const [alerts, setAlerts] = useState<{
    expiringSoon: MedicineBatch[];
    expired: MedicineBatch[];
    lowStock: Medicine[];
  }>({
    expiringSoon: [],
    expired: [],
    lowStock: [],
  });

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Add Medicine Modal
  const [showAddMedModal, setShowAddMedModal] = useState(false);
  const [newMed, setNewMed] = useState({
    code: "",
    name: "",
    genericName: "",
    brand: "",
    category: "General",
    manufacturer: "",
    strength: "",
    form: "TABLET",
    unit: "strip",
    reorderLevel: 20,
    unitPrice: 50,
  });

  // Add Batch / Stock Receipt Modal
  const [showAddBatchModal, setShowAddBatchModal] = useState(false);
  const [newBatch, setNewBatch] = useState({
    medicineId: "",
    batchNumber: "",
    manufacturingDate: new Date().toISOString().split("T")[0],
    expiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split("T")[0],
    initialQuantity: 100,
    purchasePrice: 20,
    mrp: 35,
    supplierName: "",
  });

  // Stock Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustData, setAdjustData] = useState({
    medicineId: "",
    batchId: "",
    quantityDelta: 0,
    type: "ADJUSTMENT",
    reason: "",
  });

  const isPharmacist = user?.role === "PHARMACIST";
  const isAdmin = user?.role === "HOSPITAL_ADMIN" || user?.role === "SUPER_ADMIN";
  const canManage = isPharmacist || isAdmin;

  const fetchData = async () => {
    try {
      setLoading(true);
      const [medsData, batchesData, rxsData, alertsData, movementsData, dispData] =
        await Promise.all([
          apiRequest("/pharmacy/medicines").catch(() => []),
          apiRequest("/pharmacy/batches").catch(() => []),
          apiRequest("/prescriptions").catch(() => []),
          apiRequest("/pharmacy/alerts").catch(() => null),
          apiRequest("/pharmacy/movements").catch(() => []),
          apiRequest("/pharmacy/dispensing-records").catch(() => []),
        ]);

      setMedicines(Array.isArray(medsData) ? medsData : []);
      setBatches(Array.isArray(batchesData) ? batchesData : []);
      setPendingPrescriptions(
        Array.isArray(rxsData)
          ? rxsData.filter(
              (rx: any) => rx.status === "PENDING" || rx.status === "PARTIALLY_DISPENSED"
            )
          : []
      );
      if (alertsData) {
        setAlerts({
          expiringSoon: alertsData.expiringSoon || alertsData.expiringBatches30Days || [],
          expired: alertsData.expired || alertsData.expiredBatches || [],
          lowStock: alertsData.lowStock || alertsData.lowStockMedicines || [],
        });
      }
      setMovements(Array.isArray(movementsData) ? movementsData : []);
      setDispensingRecords(Array.isArray(dispData) ? dispData : []);
    } catch (err) {
      console.error("Failed to load pharmacy data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const generatedCode =
        newMed.code.trim() ||
        `${newMed.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase()}-${Date.now().toString().slice(-4)}`;

      await apiRequest("/pharmacy/medicines", {
        method: "POST",
        body: JSON.stringify({
          code: generatedCode,
          name: newMed.name.trim(),
          genericName: newMed.genericName.trim(),
          category: newMed.category || "General",
          form: newMed.form,
          strength: newMed.strength || "N/A",
          manufacturer: newMed.manufacturer || undefined,
          reorderLevel: Number(newMed.reorderLevel),
          unitPrice: Number(newMed.unitPrice),
        }),
      });
      setShowAddMedModal(false);
      setNewMed({
        code: "",
        name: "",
        genericName: "",
        brand: "",
        category: "General",
        manufacturer: "",
        strength: "",
        form: "TABLET",
        unit: "strip",
        reorderLevel: 20,
        unitPrice: 50,
      });
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to add medicine.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatch.medicineId) {
      alert("Please select a medicine.");
      return;
    }
    try {
      setSubmitting(true);
      await apiRequest("/pharmacy/batches", {
        method: "POST",
        body: JSON.stringify({
          medicineId: newBatch.medicineId,
          batchNumber: newBatch.batchNumber.trim().toUpperCase(),
          manufacturingDate: newBatch.manufacturingDate || undefined,
          expiryDate: new Date(newBatch.expiryDate).toISOString(),
          quantity: Number(newBatch.initialQuantity),
          unitCost: Number(newBatch.purchasePrice),
          mrp: Number(newBatch.mrp),
          supplier: newBatch.supplierName || undefined,
        }),
      });
      setShowAddBatchModal(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to create batch.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustData.medicineId) {
      alert("Please select a medicine.");
      return;
    }
    if (!adjustData.reason || adjustData.reason.trim().length < 3) {
      alert("A mandatory reason (at least 3 characters) is required for inventory adjustments.");
      return;
    }
    try {
      setSubmitting(true);
      await apiRequest("/pharmacy/adjust-stock", {
        method: "POST",
        body: JSON.stringify({
          medicineId: adjustData.medicineId,
          batchId: adjustData.batchId || undefined,
          quantityDelta: Number(adjustData.quantityDelta),
          type: adjustData.type,
          reason: adjustData.reason.trim(),
        }),
      });
      setShowAdjustModal(false);
      setAdjustData({
        medicineId: "",
        batchId: "",
        quantityDelta: 0,
        type: "ADJUSTMENT",
        reason: "",
      });
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to adjust stock.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuarantine = async (batchId: string) => {
    if (
      !confirm(
        "Are you sure you want to quarantine this batch? It will immediately be excluded from FIFO dispensing."
      )
    ) {
      return;
    }
    try {
      await apiRequest(`/pharmacy/batches/${batchId}/quarantine`, {
        method: "POST",
      });
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to quarantine batch.");
    }
  };

  const handleDispenseFIFO = async (prescriptionId: string) => {
    try {
      setSubmitting(true);
      const res = await apiRequest(`/pharmacy/dispense/${prescriptionId}`, {
        method: "POST",
        body: JSON.stringify({
          notes: "Fulfilled via automated FIFO batch allocation",
        }),
      });
      alert(`Prescription successfully fulfilled! Status: ${res.status || "DISPENSED"}`);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Dispensing failed. Check batch availability and expiry.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredMedicines = medicines.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.genericName.toLowerCase().includes(search.toLowerCase()) ||
      (m.code && m.code.toLowerCase().includes(search.toLowerCase())) ||
      (m.brand && m.brand.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 28,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                boxShadow: "0 10px 15px -3px rgba(16, 185, 129, 0.3)",
              }}
            >
              <Package size={24} />
            </div>
            <div>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--text-primary)",
                }}
              >
                Hospital Pharmacy & FIFO Inventory
              </h1>
              <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--text-muted)" }}>
                First-In First-Out batch allocation, expiry tracking, quarantined stocks, and automated dispensing
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
              onClick={() => setTab("CATALOGUE")}
              className={`btn btn-sm ${tab === "CATALOGUE" ? "btn-primary" : "btn-ghost"}`}
              style={{ borderRadius: 8 }}
            >
              Medicines ({medicines.length})
            </button>
            <button
              onClick={() => setTab("BATCHES")}
              className={`btn btn-sm ${tab === "BATCHES" ? "btn-primary" : "btn-ghost"}`}
              style={{ borderRadius: 8 }}
            >
              Batches ({batches.length})
            </button>
            <button
              onClick={() => setTab("DISPENSING")}
              className={`btn btn-sm ${tab === "DISPENSING" ? "btn-primary" : "btn-ghost"}`}
              style={{ borderRadius: 8 }}
            >
              Dispense Queue ({pendingPrescriptions.length})
            </button>
            <button
              onClick={() => setTab("DISPENSING_HISTORY")}
              className={`btn btn-sm ${tab === "DISPENSING_HISTORY" ? "btn-primary" : "btn-ghost"}`}
              style={{ borderRadius: 8 }}
            >
              Dispense History ({dispensingRecords.length})
            </button>
            <button
              onClick={() => setTab("MOVEMENTS")}
              className={`btn btn-sm ${tab === "MOVEMENTS" ? "btn-primary" : "btn-ghost"}`}
              style={{ borderRadius: 8 }}
            >
              Stock Ledger ({movements.length})
            </button>
            <button
              onClick={() => setTab("ALERTS")}
              className={`btn btn-sm ${tab === "ALERTS" ? "btn-primary" : "btn-ghost"}`}
              style={{ borderRadius: 8, display: "flex", alignItems: "center", gap: 6 }}
            >
              <AlertTriangle size={14} style={{ color: "#f59e0b" }} />
              Alerts ({alerts.expiringSoon.length + alerts.lowStock.length + alerts.expired.length})
            </button>
          </div>

          {canManage && (
            <div style={{ display: "flex", gap: 8 }}>
              {tab === "CATALOGUE" && (
                <button
                  onClick={() => setShowAddMedModal(true)}
                  className="btn btn-primary btn-sm"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Plus size={16} /> Add Medicine
                </button>
              )}
              {tab === "BATCHES" && (
                <button
                  onClick={() => setShowAddBatchModal(true)}
                  className="btn btn-primary btn-sm"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Plus size={16} /> Receive Stock Batch
                </button>
              )}
              <button
                onClick={() => setShowAdjustModal(true)}
                className="btn btn-ghost btn-sm"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid var(--border)",
                }}
              >
                <Sliders size={15} /> Adjust Stock
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Tabs Content */}
      {loading ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Activity
            className="animate-spin"
            size={32}
            style={{ margin: "0 auto 12px", color: "var(--primary)" }}
          />
          <div style={{ color: "var(--text-muted)" }}>Synchronizing pharmacy inventory...</div>
        </div>
      ) : tab === "CATALOGUE" ? (
        <>
          {/* Search bar */}
          <div
            style={{
              display: "flex",
              gap: 16,
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
                placeholder="Search medicines by name, generic salt, SKU code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input"
                style={{ paddingLeft: 42, width: "100%" }}
              />
            </div>
          </div>

          {/* Table */}
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: 16,
              border: "1px solid var(--border)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    background: "var(--bg-subtle, #f8fafc)",
                    borderBottom: "1px solid var(--border)",
                    textAlign: "left",
                    color: "var(--text-muted)",
                  }}
                >
                  <th style={{ padding: "14px 20px" }}>Code / SKU</th>
                  <th style={{ padding: "14px 20px" }}>Medicine Name</th>
                  <th style={{ padding: "14px 20px" }}>Generic Name</th>
                  <th style={{ padding: "14px 20px" }}>Form & Strength</th>
                  <th style={{ padding: "14px 20px" }}>Available Stock</th>
                  <th style={{ padding: "14px 20px" }}>Reorder Level</th>
                  <th style={{ padding: "14px 20px", textAlign: "right" }}>Unit Price</th>
                </tr>
              </thead>
              <tbody>
                {filteredMedicines.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                      No medicines found matching the search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredMedicines.map((m) => {
                    const isLow = (m.totalStock || 0) <= m.reorderLevel;
                    return (
                      <tr key={m.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "14px 20px" }}>
                          <code>{m.code}</code>
                        </td>
                        <td style={{ padding: "14px 20px" }}>
                          <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{m.name}</div>
                          {m.manufacturer && (
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {m.manufacturer}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "14px 20px", color: "var(--text-secondary)" }}>
                          {m.genericName}
                        </td>
                        <td style={{ padding: "14px 20px" }}>
                          <span className="badge badge-info">{m.form}</span> {m.strength}
                        </td>
                        <td style={{ padding: "14px 20px" }}>
                          <span
                            style={{
                              fontWeight: 700,
                              color: isLow ? "#ef4444" : "#10b981",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {m.totalStock || 0} {m.unit || "units"}
                            {isLow && <AlertTriangle size={14} style={{ color: "#ef4444" }} />}
                          </span>
                        </td>
                        <td style={{ padding: "14px 20px", color: "var(--text-muted)" }}>
                          {m.reorderLevel}
                        </td>
                        <td style={{ padding: "14px 20px", textAlign: "right", fontWeight: 600 }}>
                          ₹{Number(m.unitPrice).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "BATCHES" ? (
        /* Batches View */
        <div
          style={{
            background: "var(--bg-card)",
            borderRadius: 16,
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "var(--bg-subtle, #f8fafc)",
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  color: "var(--text-muted)",
                }}
              >
                <th style={{ padding: "14px 20px" }}>Batch No.</th>
                <th style={{ padding: "14px 20px" }}>Medicine</th>
                <th style={{ padding: "14px 20px" }}>Mfg Date</th>
                <th style={{ padding: "14px 20px" }}>Expiry Date (FIFO Order)</th>
                <th style={{ padding: "14px 20px" }}>Available / Received</th>
                <th style={{ padding: "14px 20px" }}>MRP</th>
                <th style={{ padding: "14px 20px" }}>Status</th>
                <th style={{ padding: "14px 20px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                    No stock batches recorded yet.
                  </td>
                </tr>
              ) : (
                batches.map((b) => {
                  const expDate = new Date(b.expiryDate);
                  const isExpired = expDate < new Date();
                  const daysLeft = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 3600 * 24));
                  return (
                    <tr key={b.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "14px 20px", fontWeight: 700 }}>
                        <code>{b.batchNumber}</code>
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <div style={{ fontWeight: 600 }}>{b.medicine?.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {b.medicine?.genericName}
                        </div>
                      </td>
                      <td style={{ padding: "14px 20px", color: "var(--text-muted)" }}>
                        {b.manufacturingDate
                          ? new Date(b.manufacturingDate).toLocaleDateString()
                          : "N/A"}
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <span
                          style={{
                            fontWeight: 600,
                            color: isExpired ? "#ef4444" : daysLeft <= 30 ? "#f59e0b" : "inherit",
                          }}
                        >
                          {expDate.toLocaleDateString()}
                        </span>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {isExpired ? "EXPIRED" : `${daysLeft} days remaining`}
                        </div>
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <strong>{b.currentQuantity}</strong> / {b.initialQuantity}
                      </td>
                      <td style={{ padding: "14px 20px" }}>₹{Number(b.mrp).toFixed(2)}</td>
                      <td style={{ padding: "14px 20px" }}>
                        <span
                          className={`badge ${
                            b.status === "ACTIVE"
                              ? "badge-success"
                              : b.status === "QUARANTINED"
                              ? "badge-danger"
                              : "badge-warning"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td style={{ padding: "14px 20px", textAlign: "right" }}>
                        {canManage && b.status === "ACTIVE" && (
                          <button
                            onClick={() => handleQuarantine(b.id)}
                            className="btn btn-sm btn-ghost"
                            style={{ color: "#ef4444", fontSize: 12 }}
                          >
                            <ShieldAlert size={14} style={{ display: "inline", marginRight: 4 }} />
                            Quarantine
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : tab === "DISPENSING" ? (
        /* Dispensing Queue */
        <div style={{ display: "grid", gap: 16 }}>
          {pendingPrescriptions.length === 0 ? (
            <div
              style={{
                background: "var(--bg-card)",
                borderRadius: 16,
                padding: 48,
                textAlign: "center",
                border: "1px dashed var(--border)",
              }}
            >
              <CheckCircle2
                size={48}
                style={{ margin: "0 auto 16px", color: "#10b981", opacity: 0.8 }}
              />
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px" }}>
                Dispensing Queue Clear
              </h3>
              <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
                All clinical prescriptions have been verified and fulfilled.
              </p>
            </div>
          ) : (
            pendingPrescriptions.map((rx) => (
              <div
                key={rx.id}
                style={{
                  background: "var(--bg-card)",
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  padding: 24,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>
                      Patient: {rx.patient?.firstName} {rx.patient?.lastName} ({rx.patient?.mrn})
                    </span>
                    <span className="badge badge-warning">{rx.status}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                    Prescribed by Dr. {rx.doctor?.user?.firstName || rx.doctor?.user?.name}{" "}
                    {rx.doctor?.user?.lastName || ""} ({rx.doctor?.specialization}) on{" "}
                    {new Date(rx.prescriptionDate).toLocaleDateString()}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {rx.items?.map((it) => (
                      <span
                        key={it.id}
                        style={{
                          background: "#f1f5f9",
                          padding: "6px 12px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        <Pill
                          size={14}
                          style={{ display: "inline", marginRight: 4, color: "#10b981" }}
                        />
                        {it.medicine?.name} — Qty: {it.quantity} (Dispensed: {it.dispensedQuantity})
                      </span>
                    ))}
                  </div>
                </div>

                {canManage && (
                  <button
                    onClick={() => handleDispenseFIFO(rx.id)}
                    disabled={submitting}
                    className="btn btn-primary"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 20px",
                    }}
                  >
                    <Layers size={16} />
                    Dispense (FIFO Allocation)
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      ) : tab === "DISPENSING_HISTORY" ? (
        /* Dispensing History View */
        <div
          style={{
            background: "var(--bg-card)",
            borderRadius: 16,
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "var(--bg-subtle, #f8fafc)",
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  color: "var(--text-muted)",
                }}
              >
                <th style={{ padding: "14px 20px" }}>Date & Time</th>
                <th style={{ padding: "14px 20px" }}>Medicine</th>
                <th style={{ padding: "14px 20px" }}>Batch Dispensed</th>
                <th style={{ padding: "14px 20px" }}>Quantity</th>
                <th style={{ padding: "14px 20px" }}>Patient</th>
                <th style={{ padding: "14px 20px" }}>Total Price</th>
                <th style={{ padding: "14px 20px" }}>Dispensed By</th>
              </tr>
            </thead>
            <tbody>
              {dispensingRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                    No dispensing history records found.
                  </td>
                </tr>
              ) : (
                dispensingRecords.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "14px 20px", color: "var(--text-muted)" }}>
                      {new Date(d.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "14px 20px", fontWeight: 600 }}>
                      {d.prescriptionItem?.medicine?.name || "N/A"}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <code>{d.batch?.batchNumber || "N/A"}</code>
                    </td>
                    <td style={{ padding: "14px 20px", fontWeight: 700, color: "#059669" }}>
                      {d.quantity}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      {d.prescriptionItem?.prescription?.patient?.firstName ||
                        d.prescriptionItem?.prescription?.patient?.user?.name ||
                        "Patient"}
                    </td>
                    <td style={{ padding: "14px 20px", fontWeight: 600 }}>
                      ₹{Number(d.totalPrice).toFixed(2)}
                    </td>
                    <td style={{ padding: "14px 20px", color: "var(--text-secondary)" }}>
                      {d.dispensedBy?.name || d.dispensedBy?.email || "Pharmacist"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : tab === "MOVEMENTS" ? (
        /* Stock Ledger / Movement History */
        <div
          style={{
            background: "var(--bg-card)",
            borderRadius: 16,
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "var(--bg-subtle, #f8fafc)",
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  color: "var(--text-muted)",
                }}
              >
                <th style={{ padding: "14px 20px" }}>Timestamp</th>
                <th style={{ padding: "14px 20px" }}>Movement Type</th>
                <th style={{ padding: "14px 20px" }}>Medicine</th>
                <th style={{ padding: "14px 20px" }}>Batch</th>
                <th style={{ padding: "14px 20px" }}>Delta</th>
                <th style={{ padding: "14px 20px" }}>Balance (Prev → New)</th>
                <th style={{ padding: "14px 20px" }}>Justification / Reason</th>
                <th style={{ padding: "14px 20px" }}>Staff</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                    No stock movements recorded yet.
                  </td>
                </tr>
              ) : (
                movements.map((mv) => (
                  <tr key={mv.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "14px 20px", color: "var(--text-muted)" }}>
                      {new Date(mv.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span
                        className={`badge ${
                          mv.type === "PURCHASE_RECEIPT" || mv.type === "RETURNED"
                            ? "badge-success"
                            : mv.type === "DISPENSED"
                            ? "badge-info"
                            : "badge-warning"
                        }`}
                      >
                        {mv.type}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontWeight: 600 }}>
                      {mv.medicine?.name || mv.medicineId}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <code>{mv.batch?.batchNumber || "—"}</code>
                    </td>
                    <td
                      style={{
                        padding: "14px 20px",
                        fontWeight: 700,
                        color: mv.quantity >= 0 ? "#10b981" : "#ef4444",
                      }}
                    >
                      {mv.quantity >= 0 ? `+${mv.quantity}` : mv.quantity}
                    </td>
                    <td style={{ padding: "14px 20px", color: "var(--text-secondary)" }}>
                      {mv.previousStock} → <strong>{mv.newStock}</strong>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 13 }}>{mv.reason}</td>
                    <td style={{ padding: "14px 20px", color: "var(--text-muted)" }}>
                      {mv.performedBy?.name || mv.performedBy?.email || "System"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Alerts Tab */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Low Stock Alerts */}
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: 16,
              border: "1px solid var(--border)",
              padding: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <AlertTriangle size={20} style={{ color: "#ef4444" }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                Low Stock Medicines ({alerts.lowStock.length})
              </h3>
            </div>
            {alerts.lowStock.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                All medicines are above their configured reorder level.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {alerts.lowStock.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: "#fef2f2",
                      border: "1px solid #fee2e2",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#991b1b" }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: "#b91c1c" }}>
                        Stock: {m.totalStock || 0} / Reorder: {m.reorderLevel}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setNewBatch({ ...newBatch, medicineId: m.id });
                        setShowAddBatchModal(true);
                      }}
                      className="btn btn-sm btn-primary"
                    >
                      Restock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expiry Alerts */}
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: 16,
              border: "1px solid var(--border)",
              padding: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Clock size={20} style={{ color: "#f59e0b" }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                Batches Expiring Soon (30 Days) ({alerts.expiringSoon.length})
              </h3>
            </div>
            {alerts.expiringSoon.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                No batches expiring within the next 30 days.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {alerts.expiringSoon.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: "#fffbeb",
                      border: "1px solid #fef3c7",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#92400e" }}>
                        {b.medicine?.name} (Batch: {b.batchNumber})
                      </div>
                      <div style={{ fontSize: 12, color: "#b45309" }}>
                        Expires: {new Date(b.expiryDate).toLocaleDateString()} | Qty: {b.currentQuantity}
                      </div>
                    </div>
                    {b.status === "ACTIVE" && (
                      <button
                        onClick={() => handleQuarantine(b.id)}
                        className="btn btn-sm btn-danger"
                      >
                        Quarantine
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADD MEDICINE MODAL */}
      {showAddMedModal && (
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
              maxWidth: 640,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Add Medicine to Formulary</h2>
              <button onClick={() => setShowAddMedModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateMedicine}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label className="label">Brand / Commercial Name *</label>
                  <input
                    type="text"
                    required
                    value={newMed.name}
                    onChange={(e) => setNewMed({ ...newMed, name: e.target.value })}
                    placeholder="Augmentin 625"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Generic Salt Name *</label>
                  <input
                    type="text"
                    required
                    value={newMed.genericName}
                    onChange={(e) => setNewMed({ ...newMed, genericName: e.target.value })}
                    placeholder="Amoxicillin + Clavulanic Acid"
                    className="input"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label className="label">Medicine Code / SKU *</label>
                  <input
                    type="text"
                    required
                    value={newMed.code}
                    onChange={(e) => setNewMed({ ...newMed, code: e.target.value.toUpperCase() })}
                    placeholder="MED-AUG-625"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Manufacturer</label>
                  <input
                    type="text"
                    value={newMed.manufacturer}
                    onChange={(e) => setNewMed({ ...newMed, manufacturer: e.target.value })}
                    placeholder="GlaxoSmithKline"
                    className="input"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label className="label">Dosage Form</label>
                  <select
                    value={newMed.form}
                    onChange={(e) => setNewMed({ ...newMed, form: e.target.value })}
                    className="input"
                  >
                    <option value="TABLET">Tablet</option>
                    <option value="CAPSULE">Capsule</option>
                    <option value="SYRUP">Syrup</option>
                    <option value="INJECTION">Injection</option>
                    <option value="TOPICAL">Topical</option>
                    <option value="DROPS">Drops</option>
                  </select>
                </div>
                <div>
                  <label className="label">Strength</label>
                  <input
                    type="text"
                    value={newMed.strength}
                    onChange={(e) => setNewMed({ ...newMed, strength: e.target.value })}
                    placeholder="625mg"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Category</label>
                  <input
                    type="text"
                    value={newMed.category}
                    onChange={(e) => setNewMed({ ...newMed, category: e.target.value })}
                    placeholder="Antibiotics"
                    className="input"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 20,
                }}
              >
                <div>
                  <label className="label">Reorder Level Threshold</label>
                  <input
                    type="number"
                    value={newMed.reorderLevel}
                    onChange={(e) => setNewMed({ ...newMed, reorderLevel: Number(e.target.value) })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Default Unit Price (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newMed.unitPrice}
                    onChange={(e) => setNewMed({ ...newMed, unitPrice: Number(e.target.value) })}
                    className="input"
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowAddMedModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? "Saving..." : "Add to Formulary"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD BATCH / RECEIVE STOCK MODAL */}
      {showAddBatchModal && (
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
              maxWidth: 640,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Receive Stock Batch (FIFO)</h2>
              <button onClick={() => setShowAddBatchModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateBatch}>
              <div style={{ marginBottom: 14 }}>
                <label className="label">Select Medicine *</label>
                <select
                  value={newBatch.medicineId}
                  onChange={(e) => setNewBatch({ ...newBatch, medicineId: e.target.value })}
                  required
                  className="input"
                >
                  <option value="">-- Choose Medicine --</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.genericName} - {m.strength})
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label className="label">Batch Number *</label>
                  <input
                    type="text"
                    required
                    value={newBatch.batchNumber}
                    onChange={(e) =>
                      setNewBatch({ ...newBatch, batchNumber: e.target.value.toUpperCase() })
                    }
                    placeholder="BATCH-2026-X"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Quantity Received *</label>
                  <input
                    type="number"
                    required
                    value={newBatch.initialQuantity}
                    onChange={(e) =>
                      setNewBatch({ ...newBatch, initialQuantity: Number(e.target.value) })
                    }
                    className="input"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label className="label">Manufacturing Date</label>
                  <input
                    type="date"
                    value={newBatch.manufacturingDate}
                    onChange={(e) =>
                      setNewBatch({ ...newBatch, manufacturingDate: e.target.value })
                    }
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={newBatch.expiryDate}
                    onChange={(e) => setNewBatch({ ...newBatch, expiryDate: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 20,
                }}
              >
                <div>
                  <label className="label">Purchase Cost (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newBatch.purchasePrice}
                    onChange={(e) =>
                      setNewBatch({ ...newBatch, purchasePrice: Number(e.target.value) })
                    }
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">MRP (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newBatch.mrp}
                    onChange={(e) => setNewBatch({ ...newBatch, mrp: Number(e.target.value) })}
                    className="input"
                  />
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="label">Supplier / Vendor Name</label>
                <input
                  type="text"
                  value={newBatch.supplierName}
                  onChange={(e) => setNewBatch({ ...newBatch, supplierName: e.target.value })}
                  placeholder="Apex Pharmaceuticals Supply"
                  className="input"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowAddBatchModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? "Recording..." : "Record Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {showAdjustModal && (
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
              maxWidth: 580,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: 32,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Stock Adjustment & Returns</h2>
              <button onClick={() => setShowAdjustModal(false)} className="btn btn-ghost btn-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAdjustStock}>
              <div style={{ marginBottom: 14 }}>
                <label className="label">Select Medicine *</label>
                <select
                  value={adjustData.medicineId}
                  onChange={(e) =>
                    setAdjustData({ ...adjustData, medicineId: e.target.value, batchId: "" })
                  }
                  required
                  className="input"
                >
                  <option value="">-- Choose Medicine --</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </select>
              </div>

              {adjustData.medicineId && (
                <div style={{ marginBottom: 14 }}>
                  <label className="label">Target Batch (Optional)</label>
                  <select
                    value={adjustData.batchId}
                    onChange={(e) => setAdjustData({ ...adjustData, batchId: e.target.value })}
                    className="input"
                  >
                    <option value="">-- General Stock / Any Batch --</option>
                    {batches
                      .filter((b) => b.medicine?.id === adjustData.medicineId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batchNumber} (Current Qty: {b.currentQuantity})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label className="label">Quantity Delta (+ or -) *</label>
                  <input
                    type="number"
                    required
                    value={adjustData.quantityDelta}
                    onChange={(e) =>
                      setAdjustData({ ...adjustData, quantityDelta: Number(e.target.value) })
                    }
                    placeholder="-5 or +10"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Movement Type *</label>
                  <select
                    value={adjustData.type}
                    onChange={(e) => setAdjustData({ ...adjustData, type: e.target.value })}
                    className="input"
                  >
                    <option value="ADJUSTMENT">ADJUSTMENT</option>
                    <option value="RETURNED">RETURNED</option>
                    <option value="EXPIRED_DISCARD">EXPIRED_DISCARD</option>
                    <option value="QUARANTINED">QUARANTINED</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="label">Mandatory Justification / Reason *</label>
                <textarea
                  required
                  rows={3}
                  value={adjustData.reason}
                  onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                  placeholder="State the audit justification (e.g., Physical count discrepancy, damaged packaging return)..."
                  className="input"
                  style={{ height: "auto" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? "Applying..." : "Confirm Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
