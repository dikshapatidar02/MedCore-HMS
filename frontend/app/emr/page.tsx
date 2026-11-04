"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import {
  FileText,
  Activity,
  AlertTriangle,
  Pill,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  Check,
  Edit3,
  Calendar,
  User,
  ShieldCheck,
  FileCheck,
  Heart,
  Thermometer,
  Scale,
  Clock,
  Sparkles,
} from "lucide-react";

export default function ClinicalEMRPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isPatient = user?.role === "PATIENT";
  const isDoctor = user?.role === "DOCTOR" || user?.role === "SUPER_ADMIN";
  const isNurse = user?.role === "NURSE";
  const canRecordVitals = isDoctor || isNurse;

  // Active Tab: 'records' | 'overview' | 'vitals' | 'allergies-meds'
  const [activeTab, setActiveTab] = useState<"records" | "overview" | "vitals" | "allergies-meds">("records");

  // Filter States
  const [recordSearch, setRecordSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");

  // Modals
  const [activeModal, setActiveModal] = useState<
    | "create-record"
    | "view-record"
    | "amend-record"
    | "record-vitals"
    | "add-diagnosis"
    | "add-treatment"
    | "add-allergy"
    | "add-medication"
    | null
  >(null);

  // Active Selected Objects for modals
  const [viewingRecordId, setViewingRecordId] = useState<string | null>(null);
  const [amendingRecordId, setAmendingRecordId] = useState<string | null>(null);

  // Notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };
  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  // Queries
  // 1. Patients dropdown for staff
  const { data: patientsData } = useQuery({
    queryKey: ["emr-patients-dropdown"],
    queryFn: () =>
      !isPatient
        ? apiRequest<{ items: any[] }>("/patients?limit=100")
        : Promise.resolve({ items: [] }),
    enabled: !isPatient,
  });

  // 2. Patient's own profile if patient
  const { data: myPatientProfile } = useQuery({
    queryKey: ["my-patient-profile"],
    queryFn: () => apiRequest<any>("/patients/me"),
    enabled: isPatient,
  });

  // Effective selected patient ID (if patient, always own profile ID)
  const currentPatientId = isPatient ? myPatientProfile?.id : selectedPatientId;

  // 3. Medical Records Query
  const { data: medicalRecordsData, isLoading: loadingRecords } = useQuery({
    queryKey: ["medical-records", recordSearch, statusFilter, currentPatientId],
    queryFn: () => {
      let url = `/medical-records?limit=50`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (currentPatientId) url += `&patientId=${currentPatientId}`;
      return apiRequest<{ items: any[]; total: number }>(url);
    },
    enabled: !isPatient || !!myPatientProfile?.id,
  });

  // 4. Clinical Overview for Selected Patient
  const { data: clinicalOverview, isLoading: loadingOverview } = useQuery({
    queryKey: ["patient-clinical-overview", currentPatientId],
    queryFn: () => apiRequest<any>(`/patients/${currentPatientId}/clinical-overview`),
    enabled: !!currentPatientId,
  });

  // 5. Active viewing record detailed query
  const { data: detailedRecord, isLoading: loadingRecordDetails } = useQuery({
    queryKey: ["medical-record-detail", viewingRecordId],
    queryFn: () => apiRequest<any>(`/medical-records/${viewingRecordId}`),
    enabled: !!viewingRecordId && activeModal === "view-record",
  });

  // 6. Vitals query
  const { data: vitalsData, isLoading: loadingVitals } = useQuery({
    queryKey: ["vital-signs", currentPatientId],
    queryFn: () =>
      apiRequest<{ items: any[] }>(
        currentPatientId ? `/vital-signs?patientId=${currentPatientId}` : `/vital-signs?limit=50`
      ),
    enabled: activeTab === "vitals" && (!isPatient || !!myPatientProfile?.id),
  });

  // 7. Allergies query
  const { data: allergiesData, isLoading: loadingAllergies } = useQuery({
    queryKey: ["patient-allergies", currentPatientId],
    queryFn: () =>
      currentPatientId
        ? apiRequest<{ items: any[] }>(`/patient-allergies?patientId=${currentPatientId}`)
        : Promise.resolve({ items: [] }),
    enabled: !!currentPatientId && activeTab === "allergies-meds",
  });

  // 8. Medication history query
  const { data: medicationsData, isLoading: loadingMeds } = useQuery({
    queryKey: ["patient-medications", currentPatientId],
    queryFn: () =>
      currentPatientId
        ? apiRequest<{ items: any[] }>(`/patient-medication-history?patientId=${currentPatientId}`)
        : Promise.resolve({ items: [] }),
    enabled: !!currentPatientId && activeTab === "allergies-meds",
  });

  // --- FORM STATES ---
  // Create Record Form
  const [recordForm, setRecordForm] = useState({
    patientId: "",
    appointmentId: "",
    chiefComplaint: "",
    presentIllness: "",
    pastMedicalHistory: "",
    physicalExamination: "",
    assessment: "",
    clinicalNotes: "",
    followUpInstructions: "",
  });

  // Amendment Form
  const [amendForm, setAmendForm] = useState({
    reason: "",
    notes: "",
  });

  // Vital Signs Form
  const [vitalsForm, setVitalsForm] = useState({
    patientId: "",
    medicalRecordId: "",
    systolicBp: "",
    diastolicBp: "",
    heartRate: "",
    respiratoryRate: "",
    temperature: "",
    oxygenSaturation: "",
    weightKg: "",
    heightCm: "",
    notes: "",
  });

  // Compute live BMI preview
  const liveWeight = parseFloat(vitalsForm.weightKg);
  const liveHeight = parseFloat(vitalsForm.heightCm);
  const liveBmi =
    liveWeight > 0 && liveHeight > 0
      ? (liveWeight / Math.pow(liveHeight / 100, 2)).toFixed(1)
      : null;

  // Diagnosis Form
  const [diagnosisForm, setDiagnosisForm] = useState({
    patientId: "",
    medicalRecordId: "",
    code: "",
    description: "",
    type: "PRIMARY",
    status: "ACTIVE",
    notes: "",
  });

  // Treatment Plan Form
  const [treatmentForm, setTreatmentForm] = useState({
    patientId: "",
    medicalRecordId: "",
    title: "",
    description: "",
    goals: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
  });

  // Allergy Form
  const [allergyForm, setAllergyForm] = useState({
    patientId: "",
    allergen: "",
    reaction: "",
    severity: "MODERATE",
    isActive: true,
    notes: "",
  });

  // Medication Form
  const [medicationForm, setMedicationForm] = useState({
    patientId: "",
    medicationName: "",
    dosage: "",
    frequency: "",
    route: "ORAL",
    prescribedDate: new Date().toISOString().split("T")[0],
    isActive: true,
    notes: "",
  });

  // --- MUTATIONS ---
  // Create Medical Record
  const createRecordMutation = useMutation({
    mutationFn: (data: typeof recordForm) =>
      apiRequest("/medical-records", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          appointmentId: data.appointmentId ? data.appointmentId : undefined,
        }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["medical-records"] });
      queryClient.invalidateQueries({ queryKey: ["patient-clinical-overview"] });
      showSuccess("Clinical encounter draft created successfully.");
      setActiveModal(null);
      setRecordForm({
        patientId: "",
        appointmentId: "",
        chiefComplaint: "",
        presentIllness: "",
        pastMedicalHistory: "",
        physicalExamination: "",
        assessment: "",
        clinicalNotes: "",
        followUpInstructions: "",
      });
    },
    onError: (err: any) => showError(err.message || "Failed to create medical record"),
  });

  // Sign & Finalize Record
  const signRecordMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/medical-records/${id}/sign`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medical-records"] });
      queryClient.invalidateQueries({ queryKey: ["medical-record-detail"] });
      queryClient.invalidateQueries({ queryKey: ["patient-clinical-overview"] });
      showSuccess("Medical record signed and finalized. Status is now immutable.");
    },
    onError: (err: any) => showError(err.message || "Failed to finalize record"),
  });

  // Amend Record
  const amendRecordMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof amendForm }) =>
      apiRequest(`/medical-records/${id}/amend`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medical-records"] });
      queryClient.invalidateQueries({ queryKey: ["medical-record-detail"] });
      queryClient.invalidateQueries({ queryKey: ["patient-clinical-overview"] });
      showSuccess("Clinical amendment attached successfully. Record marked AMENDED.");
      setActiveModal(null);
      setAmendForm({ reason: "", notes: "" });
    },
    onError: (err: any) => showError(err.message || "Failed to attach amendment"),
  });

  // Record Vital Signs
  const recordVitalsMutation = useMutation({
    mutationFn: (data: typeof vitalsForm) =>
      apiRequest("/vital-signs", {
        method: "POST",
        body: JSON.stringify({
          patientId: data.patientId || currentPatientId,
          medicalRecordId: data.medicalRecordId ? data.medicalRecordId : undefined,
          systolicBp: data.systolicBp ? parseInt(data.systolicBp, 10) : undefined,
          diastolicBp: data.diastolicBp ? parseInt(data.diastolicBp, 10) : undefined,
          heartRate: data.heartRate ? parseInt(data.heartRate, 10) : undefined,
          respiratoryRate: data.respiratoryRate ? parseInt(data.respiratoryRate, 10) : undefined,
          temperature: data.temperature ? parseFloat(data.temperature) : undefined,
          oxygenSaturation: data.oxygenSaturation ? parseFloat(data.oxygenSaturation) : undefined,
          weightKg: data.weightKg ? parseFloat(data.weightKg) : undefined,
          heightCm: data.heightCm ? parseFloat(data.heightCm) : undefined,
          notes: data.notes || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vital-signs"] });
      queryClient.invalidateQueries({ queryKey: ["patient-clinical-overview"] });
      queryClient.invalidateQueries({ queryKey: ["medical-record-detail"] });
      showSuccess("Vital signs recorded successfully.");
      setActiveModal(null);
      setVitalsForm({
        patientId: "",
        medicalRecordId: "",
        systolicBp: "",
        diastolicBp: "",
        heartRate: "",
        respiratoryRate: "",
        temperature: "",
        oxygenSaturation: "",
        weightKg: "",
        heightCm: "",
        notes: "",
      });
    },
    onError: (err: any) => showError(err.message || "Failed to record vital signs"),
  });

  // Record Diagnosis
  const recordDiagnosisMutation = useMutation({
    mutationFn: (data: typeof diagnosisForm) =>
      apiRequest("/diagnoses", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          medicalRecordId: data.medicalRecordId ? data.medicalRecordId : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnoses"] });
      queryClient.invalidateQueries({ queryKey: ["patient-clinical-overview"] });
      queryClient.invalidateQueries({ queryKey: ["medical-record-detail"] });
      showSuccess("Diagnosis recorded successfully.");
      setActiveModal(null);
    },
    onError: (err: any) => showError(err.message || "Failed to record diagnosis"),
  });

  // Record Treatment Plan
  const recordTreatmentMutation = useMutation({
    mutationFn: (data: typeof treatmentForm) =>
      apiRequest("/treatment-plans", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          medicalRecordId: data.medicalRecordId ? data.medicalRecordId : undefined,
          endDate: data.endDate ? data.endDate : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] });
      queryClient.invalidateQueries({ queryKey: ["patient-clinical-overview"] });
      queryClient.invalidateQueries({ queryKey: ["medical-record-detail"] });
      showSuccess("Treatment plan recorded successfully.");
      setActiveModal(null);
    },
    onError: (err: any) => showError(err.message || "Failed to record treatment plan"),
  });

  // Add Allergy
  const addAllergyMutation = useMutation({
    mutationFn: (data: typeof allergyForm) =>
      apiRequest("/patient-allergies", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          patientId: data.patientId || currentPatientId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-allergies"] });
      queryClient.invalidateQueries({ queryKey: ["patient-clinical-overview"] });
      showSuccess("Allergy documented successfully.");
      setActiveModal(null);
    },
    onError: (err: any) => showError(err.message || "Failed to record allergy"),
  });

  // Add Medication
  const addMedicationMutation = useMutation({
    mutationFn: (data: typeof medicationForm) =>
      apiRequest("/patient-medication-history", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          patientId: data.patientId || currentPatientId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-medications"] });
      queryClient.invalidateQueries({ queryKey: ["patient-clinical-overview"] });
      showSuccess("Medication history recorded successfully.");
      setActiveModal(null);
    },
    onError: (err: any) => showError(err.message || "Failed to record medication"),
  });

  // Helper Badge Color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <span className="status-badge badge-draft">Draft</span>;
      case "FINALIZED":
        return <span className="status-badge badge-finalized">Finalized</span>;
      case "AMENDED":
        return <span className="status-badge badge-amended">Amended</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "MILD":
        return <span className="status-badge badge-mild">Mild</span>;
      case "MODERATE":
        return <span className="status-badge badge-moderate">Moderate</span>;
      case "SEVERE":
        return <span className="status-badge badge-severe">Severe</span>;
      case "LIFE_THREATENING":
        return <span className="status-badge badge-life_threatening">Life Threatening</span>;
      default:
        return <span className="status-badge">{sev}</span>;
    }
  };

  return (
    <div>
      {/* Top Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Clinical EMR</h1>
          <p className="page-subtitle">
            Electronic Medical Records, Clinical Encounters, Immutability & 360° Patient Chart
          </p>
        </div>

        <div className="toolbar">
          {/* Patient Filter Selector for Staff */}
          {!isPatient && (
            <select
              aria-label="Filter records by patient"
              className="select-input"
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              style={{ minWidth: "220px" }}
            >
              <option value="">All Patients</option>
              {patientsData?.items?.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} ({p.mrn})
                </option>
              ))}
            </select>
          )}

          {/* New Record Button for Doctors */}
          {isDoctor && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setRecordForm((prev) => ({
                  ...prev,
                  patientId: currentPatientId || "",
                }));
                setActiveModal("create-record");
              }}
            >
              <Plus size={16} /> New Clinical Record
            </button>
          )}

          {/* Record Vitals Quick Action for Staff */}
          {canRecordVitals && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setVitalsForm((prev) => ({
                  ...prev,
                  patientId: currentPatientId || "",
                }));
                setActiveModal("record-vitals");
              }}
            >
              <Activity size={16} /> Record Vitals
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="alert alert-success">
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="tab-list">
        <button
          className={`tab-btn ${activeTab === "records" ? "active" : ""}`}
          onClick={() => setActiveTab("records")}
        >
          <FileText size={16} /> Encounters & Medical Records
        </button>
        <button
          className={`tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <Sparkles size={16} /> Patient 360° Overview
        </button>
        <button
          className={`tab-btn ${activeTab === "vitals" ? "active" : ""}`}
          onClick={() => setActiveTab("vitals")}
        >
          <Activity size={16} /> Vital Signs Station
        </button>
        <button
          className={`tab-btn ${activeTab === "allergies-meds" ? "active" : ""}`}
          onClick={() => setActiveTab("allergies-meds")}
        >
          <AlertTriangle size={16} /> Allergies & Medications
        </button>
      </div>

      {/* TAB 1: MEDICAL RECORDS LIST */}
      {activeTab === "records" && (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Clinical Encounter Records</h2>
            <div className="toolbar">
              <select
                aria-label="Filter records by status"
                className="select-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="FINALIZED">Finalized</option>
                <option value="AMENDED">Amended</option>
              </select>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Encounter Date</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Chief Complaint</th>
                  <th>Status</th>
                  <th>Signed / Finalized</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingRecords ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "32px" }}>
                      Loading medical records...
                    </td>
                  </tr>
                ) : !medicalRecordsData?.items || medicalRecordsData.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                      No clinical records found.
                    </td>
                  </tr>
                ) : (
                  medicalRecordsData.items.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Calendar size={14} color="#64748b" />
                          <span style={{ fontWeight: 600 }}>
                            {new Date(r.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>
                          {new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {r.patient?.firstName} {r.patient?.lastName}
                        </div>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>
                          MRN: {r.patient?.mrn}
                        </span>
                      </td>
                      <td>
                        <div>
                          Dr. {r.doctor?.user?.firstName} {r.doctor?.user?.lastName}
                        </div>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>
                          {r.doctor?.specialty}
                        </span>
                      </td>
                      <td style={{ maxWidth: "260px" }}>
                        <div
                          style={{
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.chiefComplaint}
                        </div>
                        {r.assessment && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#64748b",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Assess: {r.assessment}
                          </div>
                        )}
                      </td>
                      <td>{getStatusBadge(r.status)}</td>
                      <td>
                        {r.signedAt ? (
                          <div style={{ fontSize: "12px", color: "#065f46", display: "flex", alignItems: "center", gap: "4px" }}>
                            <ShieldCheck size={14} />
                            <span>{new Date(r.signedAt).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: "12px", color: "#94a3b8" }}>Pending Signature</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            title="View Full Clinical Chart"
                            onClick={() => {
                              setViewingRecordId(r.id);
                              setActiveModal("view-record");
                            }}
                          >
                            <Eye size={13} /> View Chart
                          </button>

                          {/* Sign Button if draft and Doctor */}
                          {isDoctor && r.status === "DRAFT" && (
                            <button
                              className="btn btn-primary btn-sm"
                              title="Sign & Finalize Record (locks record from further direct edits)"
                              disabled={signRecordMutation.isPending}
                              onClick={() => {
                                if (
                                  confirm(
                                    "Sign and finalize this medical record? Once finalized, the entry becomes legally immutable and can only be amended with auditable addendums."
                                  )
                                ) {
                                  signRecordMutation.mutate(r.id);
                                }
                              }}
                            >
                              <Check size={13} /> Sign & Lock
                            </button>
                          )}

                          {/* Amend Button if Finalized or Amended and Doctor */}
                          {isDoctor && (r.status === "FINALIZED" || r.status === "AMENDED") && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ borderColor: "#c4b5fd", color: "#6d28d9" }}
                              title="Add Legal Clinical Amendment"
                              onClick={() => {
                                setAmendingRecordId(r.id);
                                setAmendForm({ reason: "", notes: "" });
                                setActiveModal("amend-record");
                              }}
                            >
                              <Edit3 size={13} /> Amend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PATIENT 360° CLINICAL OVERVIEW */}
      {activeTab === "overview" && (
        <div>
          {!currentPatientId ? (
            <div className="panel" style={{ padding: "48px", textAlign: "center", color: "#64748b" }}>
              <User size={48} style={{ margin: "0 auto 12px auto", opacity: 0.3 }} />
              <h3>Select a Patient</h3>
              <p>Please select a patient from the dropdown in the top right to view their complete clinical overview.</p>
            </div>
          ) : loadingOverview ? (
            <div className="panel" style={{ padding: "48px", textAlign: "center" }}>
              Loading clinical overview...
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Patient Banner */}
              <div
                className="panel"
                style={{
                  padding: "20px 24px",
                  background: "linear-gradient(135deg, #0f172a, #1e293b)",
                  color: "white",
                  borderRadius: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>
                      {clinicalOverview?.patient?.firstName} {clinicalOverview?.patient?.lastName}
                    </h2>
                    <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "13px", color: "#94a3b8" }}>
                      <span>MRN: <strong style={{ color: "white" }}>{clinicalOverview?.patient?.mrn}</strong></span>
                      <span>DOB: {clinicalOverview?.patient?.dateOfBirth ? new Date(clinicalOverview.patient.dateOfBirth).toLocaleDateString() : "N/A"}</span>
                      <span>Gender: {clinicalOverview?.patient?.gender}</span>
                      <span>Blood Group: <strong style={{ color: "#38bdf8" }}>{clinicalOverview?.patient?.bloodGroup || "Unknown"}</strong></span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    {isDoctor && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setRecordForm((prev) => ({ ...prev, patientId: currentPatientId }));
                          setActiveModal("create-record");
                        }}
                      >
                        <Plus size={14} /> New Encounter
                      </button>
                    )}
                    {canRecordVitals && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ backgroundColor: "#334155", color: "white", borderColor: "#475569" }}
                        onClick={() => {
                          setVitalsForm((prev) => ({ ...prev, patientId: currentPatientId }));
                          setActiveModal("record-vitals");
                        }}
                      >
                        <Activity size={14} /> Record Vitals
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Latest Vitals Snapshot Banner */}
              <div className="panel" style={{ padding: "20px" }}>
                <h3 style={{ margin: "0 0 16px 0", fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                  <Activity size={18} color="#0284c7" /> Latest Recorded Vital Signs
                </h3>
                {clinicalOverview?.latestVitals ? (
                  <div className="vitals-banner">
                    <div className="vitals-stat">
                      <span className="vitals-stat-label">Blood Pressure</span>
                      <span className="vitals-stat-value">
                        {clinicalOverview.latestVitals.systolicBp || "--"}/
                        {clinicalOverview.latestVitals.diastolicBp || "--"}
                        <span className="vitals-stat-unit">mmHg</span>
                      </span>
                    </div>
                    <div className="vitals-stat">
                      <span className="vitals-stat-label">Heart Rate</span>
                      <span className="vitals-stat-value">
                        {clinicalOverview.latestVitals.heartRate || "--"}
                        <span className="vitals-stat-unit">bpm</span>
                      </span>
                    </div>
                    <div className="vitals-stat">
                      <span className="vitals-stat-label">Temp</span>
                      <span className="vitals-stat-value">
                        {clinicalOverview.latestVitals.temperature || "--"}
                        <span className="vitals-stat-unit">°C</span>
                      </span>
                    </div>
                    <div className="vitals-stat">
                      <span className="vitals-stat-label">O2 Sat</span>
                      <span className="vitals-stat-value">
                        {clinicalOverview.latestVitals.oxygenSaturation || "--"}
                        <span className="vitals-stat-unit">%</span>
                      </span>
                    </div>
                    <div className="vitals-stat">
                      <span className="vitals-stat-label">Respiratory</span>
                      <span className="vitals-stat-value">
                        {clinicalOverview.latestVitals.respiratoryRate || "--"}
                        <span className="vitals-stat-unit">/min</span>
                      </span>
                    </div>
                    <div className="vitals-stat">
                      <span className="vitals-stat-label">BMI</span>
                      <span className="vitals-stat-value" style={{ color: "#0284c7" }}>
                        {clinicalOverview.latestVitals.bmi || "--"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p style={{ color: "#64748b", margin: 0, fontSize: "13px" }}>No vital signs recorded for this patient.</p>
                )}
              </div>

              {/* Grid: Allergies, Active Medications, Diagnoses */}
              <div className="clinical-grid">
                {/* Active Allergies */}
                <div className="panel">
                  <div className="panel-header">
                    <h3 className="panel-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <AlertTriangle size={16} color="#ef4444" /> Documented Allergies
                    </h3>
                    {canRecordVitals && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setAllergyForm((prev) => ({ ...prev, patientId: currentPatientId }));
                          setActiveModal("add-allergy");
                        }}
                      >
                        <Plus size={12} /> Add Allergy
                      </button>
                    )}
                  </div>
                  <div style={{ padding: "16px" }}>
                    {!clinicalOverview?.allergies || clinicalOverview.allergies.length === 0 ? (
                      <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>No known drug/food allergies recorded.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {clinicalOverview.allergies.map((a: any) => (
                          <div
                            key={a.id}
                            style={{
                              padding: "10px 14px",
                              backgroundColor: "#fef2f2",
                              border: "1px solid #fee2e2",
                              borderRadius: "8px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <strong style={{ color: "#991b1b" }}>{a.allergen}</strong>
                              {a.reaction && (
                                <div style={{ fontSize: "12px", color: "#7f1d1d" }}>Reaction: {a.reaction}</div>
                              )}
                            </div>
                            {getSeverityBadge(a.severity)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Active Medications */}
                <div className="panel">
                  <div className="panel-header">
                    <h3 className="panel-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Pill size={16} color="#8b5cf6" /> Active Medications
                    </h3>
                    {canRecordVitals && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setMedicationForm((prev) => ({ ...prev, patientId: currentPatientId }));
                          setActiveModal("add-medication");
                        }}
                      >
                        <Plus size={12} /> Add Medication
                      </button>
                    )}
                  </div>
                  <div style={{ padding: "16px" }}>
                    {!clinicalOverview?.medications || clinicalOverview.medications.length === 0 ? (
                      <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>No active medications listed.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {clinicalOverview.medications.map((m: any) => (
                          <div
                            key={m.id}
                            style={{
                              padding: "10px 14px",
                              backgroundColor: "#faf5ff",
                              border: "1px solid #f3e8ff",
                              borderRadius: "8px",
                            }}
                          >
                            <div style={{ fontWeight: 600, color: "#6b21a8" }}>{m.medicationName}</div>
                            <div style={{ fontSize: "12px", color: "#581c87" }}>
                              {m.dosage} • {m.frequency} • {m.route}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Active Diagnoses */}
                <div className="panel">
                  <div className="panel-header">
                    <h3 className="panel-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <FileCheck size={16} color="#059669" /> Active Diagnoses
                    </h3>
                    {isDoctor && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setDiagnosisForm((prev) => ({ ...prev, patientId: currentPatientId }));
                          setActiveModal("add-diagnosis");
                        }}
                      >
                        <Plus size={12} /> Add Diagnosis
                      </button>
                    )}
                  </div>
                  <div style={{ padding: "16px" }}>
                    {!clinicalOverview?.diagnoses || clinicalOverview.diagnoses.length === 0 ? (
                      <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>No active clinical diagnoses documented.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {clinicalOverview.diagnoses.map((d: any) => (
                          <div
                            key={d.id}
                            style={{
                              padding: "10px 14px",
                              backgroundColor: "#ecfdf5",
                              border: "1px solid #d1fae5",
                              borderRadius: "8px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <strong style={{ color: "#065f46" }}>{d.code}</strong> - {d.description}
                              <div style={{ fontSize: "11px", color: "#047857" }}>Type: {d.type}</div>
                            </div>
                            <span className="status-badge badge-active">{d.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Encounter Timeline */}
              <div className="panel">
                <div className="panel-header">
                  <h3 className="panel-title">Recent Clinical Encounters</h3>
                </div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Doctor</th>
                        <th>Chief Complaint</th>
                        <th>Assessment</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!clinicalOverview?.recentRecords || clinicalOverview.recentRecords.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                            No encounters recorded.
                          </td>
                        </tr>
                      ) : (
                        clinicalOverview.recentRecords.map((r: any) => (
                          <tr key={r.id}>
                            <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                            <td>Dr. {r.doctor?.user?.firstName} {r.doctor?.user?.lastName}</td>
                            <td><strong>{r.chiefComplaint}</strong></td>
                            <td style={{ maxWidth: "300px", color: "#475569" }}>{r.assessment || "N/A"}</td>
                            <td>{getStatusBadge(r.status)}</td>
                            <td>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setViewingRecordId(r.id);
                                  setActiveModal("view-record");
                                }}
                              >
                                View Record
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: VITAL SIGNS STATION */}
      {activeTab === "vitals" && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Vital Signs Station</h2>
              <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
                Physiological telemetry, automated BMI calculations & historical trends
              </p>
            </div>
            {canRecordVitals && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setVitalsForm((prev) => ({ ...prev, patientId: currentPatientId || "" }));
                  setActiveModal("record-vitals");
                }}
              >
                <Plus size={16} /> Record New Vitals
              </button>
            )}
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Recorded At</th>
                  <th>Patient</th>
                  <th>Blood Pressure</th>
                  <th>Heart Rate</th>
                  <th>Temperature</th>
                  <th>O2 Sat</th>
                  <th>Respiratory</th>
                  <th>Weight / Height</th>
                  <th>BMI</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {loadingVitals ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: "32px" }}>
                      Loading vital signs records...
                    </td>
                  </tr>
                ) : !vitalsData?.items || vitalsData.items.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                      No vital signs records found.
                    </td>
                  </tr>
                ) : (
                  vitalsData.items.map((v: any) => (
                    <tr key={v.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{new Date(v.createdAt).toLocaleDateString()}</div>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>
                          {new Date(v.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {v.patient?.firstName} {v.patient?.lastName}
                        </div>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>MRN: {v.patient?.mrn}</span>
                      </td>
                      <td>
                        {v.systolicBp && v.diastolicBp ? (
                          <span style={{ fontWeight: 700, color: v.systolicBp > 140 ? "#b91c1c" : "#0f172a" }}>
                            {v.systolicBp}/{v.diastolicBp} <span style={{ fontSize: "11px", color: "#64748b" }}>mmHg</span>
                          </span>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td>
                        {v.heartRate ? (
                          <span>
                            {v.heartRate} <span style={{ fontSize: "11px", color: "#64748b" }}>bpm</span>
                          </span>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td>
                        {v.temperature ? (
                          <span style={{ color: v.temperature > 38 ? "#b91c1c" : "#0f172a" }}>
                            {v.temperature} <span style={{ fontSize: "11px", color: "#64748b" }}>°C</span>
                          </span>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td>
                        {v.oxygenSaturation ? (
                          <span style={{ fontWeight: 600, color: v.oxygenSaturation < 95 ? "#b91c1c" : "#059669" }}>
                            {v.oxygenSaturation}%
                          </span>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td>{v.respiratoryRate ? `${v.respiratoryRate}/min` : "--"}</td>
                      <td>
                        <div style={{ fontSize: "12px" }}>
                          {v.weightKg ? `${v.weightKg} kg` : "--"} / {v.heightCm ? `${v.heightCm} cm` : "--"}
                        </div>
                      </td>
                      <td>
                        {v.bmi ? (
                          <span className="status-badge" style={{ backgroundColor: "#e0f2fe", color: "#0369a1" }}>
                            {v.bmi}
                          </span>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: "12px" }}>
                          {v.recordedBy?.firstName} {v.recordedBy?.lastName}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: ALLERGIES & MEDICATIONS */}
      {activeTab === "allergies-meds" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {!currentPatientId ? (
            <div className="panel" style={{ padding: "48px", textAlign: "center", color: "#64748b" }}>
              <AlertTriangle size={48} style={{ margin: "0 auto 12px auto", opacity: 0.3 }} />
              <h3>Select a Patient</h3>
              <p>Please select a patient from the dropdown in the top right to view and manage their allergies and medication history.</p>
            </div>
          ) : (
            <>
              {/* Allergies Section */}
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <AlertTriangle size={18} color="#ef4444" /> Patient Allergies & Hypersensitivities
                    </h2>
                    <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
                      Documented contraindications and adverse clinical drug reactions
                    </p>
                  </div>
                  {canRecordVitals && (
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setAllergyForm((prev) => ({ ...prev, patientId: currentPatientId }));
                        setActiveModal("add-allergy");
                      }}
                    >
                      <Plus size={16} /> Document Allergy
                    </button>
                  )}
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Allergen</th>
                        <th>Severity</th>
                        <th>Observed Reaction</th>
                        <th>Status</th>
                        <th>Notes</th>
                        <th>Recorded Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingAllergies ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "24px" }}>
                            Loading allergies...
                          </td>
                        </tr>
                      ) : !allergiesData?.items || allergiesData.items.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                            No allergies documented for this patient.
                          </td>
                        </tr>
                      ) : (
                        allergiesData.items.map((a: any) => (
                          <tr key={a.id}>
                            <td>
                              <strong style={{ color: "#991b1b" }}>{a.allergen}</strong>
                            </td>
                            <td>{getSeverityBadge(a.severity)}</td>
                            <td>{a.reaction || "Unspecified"}</td>
                            <td>
                              {a.isActive ? (
                                <span className="status-badge badge-active">Active</span>
                              ) : (
                                <span className="status-badge" style={{ backgroundColor: "#f1f5f9", color: "#64748b" }}>
                                  Inactive
                                </span>
                              )}
                            </td>
                            <td style={{ color: "#64748b", fontSize: "12px" }}>{a.notes || "--"}</td>
                            <td style={{ fontSize: "12px" }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Medication History Section */}
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Pill size={18} color="#8b5cf6" /> Patient Medication History
                    </h2>
                    <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
                      Current and historical pharmacotherapy records
                    </p>
                  </div>
                  {canRecordVitals && (
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setMedicationForm((prev) => ({ ...prev, patientId: currentPatientId }));
                        setActiveModal("add-medication");
                      }}
                    >
                      <Plus size={16} /> Document Medication
                    </button>
                  )}
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Medication Name</th>
                        <th>Dosage</th>
                        <th>Frequency</th>
                        <th>Route</th>
                        <th>Prescribed Date</th>
                        <th>Status</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingMeds ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: "24px" }}>
                            Loading medication history...
                          </td>
                        </tr>
                      ) : !medicationsData?.items || medicationsData.items.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                            No medication history documented for this patient.
                          </td>
                        </tr>
                      ) : (
                        medicationsData.items.map((m: any) => (
                          <tr key={m.id}>
                            <td>
                              <strong style={{ color: "#6b21a8" }}>{m.medicationName}</strong>
                            </td>
                            <td>{m.dosage}</td>
                            <td>{m.frequency}</td>
                            <td>{m.route}</td>
                            <td>{m.prescribedDate ? new Date(m.prescribedDate).toLocaleDateString() : "--"}</td>
                            <td>
                              {m.isActive ? (
                                <span className="status-badge badge-active">Active</span>
                              ) : (
                                <span className="status-badge" style={{ backgroundColor: "#f1f5f9", color: "#64748b" }}>
                                  Discontinued
                                </span>
                              )}
                            </td>
                            <td style={{ color: "#64748b", fontSize: "12px" }}>{m.notes || "--"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: VIEW DETAILED RECORD & CLINICAL NARRATIVE */}
      {/* ============================================================ */}
      {activeModal === "view-record" && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: "800px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <FileText size={20} color="#0284c7" />
                <h3 className="modal-title">Clinical Encounter Chart</h3>
                {detailedRecord && getStatusBadge(detailedRecord.status)}
              </div>
              <button
                aria-label="Close modal"
                className="btn-sm"
                style={{ background: "none", border: "none", cursor: "pointer" }}
                onClick={() => {
                  setActiveModal(null);
                  setViewingRecordId(null);
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
              {loadingRecordDetails ? (
                <div style={{ textAlign: "center", padding: "40px" }}>Loading chart details...</div>
              ) : !detailedRecord ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#ef4444" }}>Record not found.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {/* Encounter Summary Header */}
                  <div
                    style={{
                      padding: "16px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                        Patient
                      </div>
                      <div style={{ fontWeight: 700, fontSize: "16px" }}>
                        {detailedRecord.patient?.firstName} {detailedRecord.patient?.lastName}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        MRN: {detailedRecord.patient?.mrn} • Gender: {detailedRecord.patient?.gender}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                        Attending Physician
                      </div>
                      <div style={{ fontWeight: 700, fontSize: "16px" }}>
                        Dr. {detailedRecord.doctor?.user?.firstName} {detailedRecord.doctor?.user?.lastName}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {detailedRecord.doctor?.specialty}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                        Encounter Timestamp
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        {new Date(detailedRecord.createdAt).toLocaleString()}
                      </div>
                      {detailedRecord.signedAt && (
                        <div style={{ fontSize: "12px", color: "#065f46", fontWeight: 600 }}>
                          Signed: {new Date(detailedRecord.signedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Structured Clinical Sections */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* Chief Complaint */}
                    <div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700, color: "#0284c7" }}>
                        1. Chief Complaint
                      </h4>
                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f1f5f9",
                          borderRadius: "6px",
                          fontSize: "14px",
                          fontWeight: 600,
                        }}
                      >
                        {detailedRecord.chiefComplaint}
                      </div>
                    </div>

                    {/* History of Present Illness (HPI) */}
                    <div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        2. History of Present Illness (HPI)
                      </h4>
                      <div style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "6px", fontSize: "14px" }}>
                        {detailedRecord.presentIllness || <em style={{ color: "#94a3b8" }}>No HPI documented.</em>}
                      </div>
                    </div>

                    {/* Past Medical History */}
                    <div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        3. Past Medical & Surgical History
                      </h4>
                      <div style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "6px", fontSize: "14px" }}>
                        {detailedRecord.pastMedicalHistory || <em style={{ color: "#94a3b8" }}>No past history documented.</em>}
                      </div>
                    </div>

                    {/* Physical Examination */}
                    <div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        4. Physical Examination
                      </h4>
                      <div style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "6px", fontSize: "14px" }}>
                        {detailedRecord.physicalExamination || <em style={{ color: "#94a3b8" }}>No physical examination documented.</em>}
                      </div>
                    </div>

                    {/* Assessment */}
                    <div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        5. Clinical Assessment & Synthesis
                      </h4>
                      <div style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "6px", fontSize: "14px" }}>
                        {detailedRecord.assessment || <em style={{ color: "#94a3b8" }}>No clinical assessment documented.</em>}
                      </div>
                    </div>

                    {/* Clinical Notes */}
                    <div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        6. Progress Notes & Discussion
                      </h4>
                      <div style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "6px", fontSize: "14px" }}>
                        {detailedRecord.clinicalNotes || <em style={{ color: "#94a3b8" }}>No progress notes documented.</em>}
                      </div>
                    </div>

                    {/* Follow Up */}
                    <div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        7. Follow-Up & Discharge Instructions
                      </h4>
                      <div style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "6px", fontSize: "14px" }}>
                        {detailedRecord.followUpInstructions || <em style={{ color: "#94a3b8" }}>No follow-up instructions documented.</em>}
                      </div>
                    </div>
                  </div>

                  {/* Attached Vital Signs */}
                  {detailedRecord.vitalSigns && detailedRecord.vitalSigns.length > 0 && (
                    <div>
                      <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                        Encounter Vital Signs
                      </h4>
                      <div className="vitals-banner">
                        {detailedRecord.vitalSigns.map((v: any) => (
                          <React.Fragment key={v.id}>
                            <div className="vitals-stat">
                              <span className="vitals-stat-label">BP</span>
                              <span className="vitals-stat-value">{v.systolicBp}/{v.diastolicBp}</span>
                            </div>
                            <div className="vitals-stat">
                              <span className="vitals-stat-label">Heart Rate</span>
                              <span className="vitals-stat-value">{v.heartRate} bpm</span>
                            </div>
                            <div className="vitals-stat">
                              <span className="vitals-stat-label">Temp</span>
                              <span className="vitals-stat-value">{v.temperature} °C</span>
                            </div>
                            <div className="vitals-stat">
                              <span className="vitals-stat-label">BMI</span>
                              <span className="vitals-stat-value">{v.bmi || "--"}</span>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Attached Diagnoses */}
                  {detailedRecord.diagnoses && detailedRecord.diagnoses.length > 0 && (
                    <div>
                      <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                        Encounter Diagnoses
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {detailedRecord.diagnoses.map((d: any) => (
                          <div
                            key={d.id}
                            style={{
                              padding: "8px 12px",
                              backgroundColor: "#ecfdf5",
                              border: "1px solid #d1fae5",
                              borderRadius: "6px",
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
                            <span>
                              <strong>{d.code}</strong> - {d.description} ({d.type})
                            </span>
                            <span className="status-badge badge-active">{d.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Attached Treatment Plans */}
                  {detailedRecord.treatmentPlans && detailedRecord.treatmentPlans.length > 0 && (
                    <div>
                      <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                        Encounter Treatment Plans
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {detailedRecord.treatmentPlans.map((tp: any) => (
                          <div
                            key={tp.id}
                            style={{
                              padding: "10px 12px",
                              backgroundColor: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              borderRadius: "6px",
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>{tp.title}</div>
                            <div style={{ fontSize: "13px", color: "#475569" }}>{tp.description}</div>
                            {tp.goals && <div style={{ fontSize: "12px", color: "#0284c7" }}>Goals: {tp.goals}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AMENDMENTS AUDIT LOG (If record is amended) */}
                  {detailedRecord.amendments && detailedRecord.amendments.length > 0 && (
                    <div
                      style={{
                        marginTop: "10px",
                        padding: "16px",
                        backgroundColor: "#f5f3ff",
                        border: "1px solid #ddd6fe",
                        borderRadius: "8px",
                      }}
                    >
                      <h4
                        style={{
                          margin: "0 0 12px 0",
                          fontSize: "14px",
                          fontWeight: 700,
                          color: "#6d28d9",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <ShieldCheck size={18} /> Official Clinical Addendums & Amendments
                      </h4>

                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {detailedRecord.amendments.map((am: any, idx: number) => (
                          <div
                            key={am.id || idx}
                            style={{
                              padding: "12px",
                              backgroundColor: "white",
                              border: "1px solid #c4b5fd",
                              borderRadius: "6px",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                              <span style={{ fontWeight: 700, color: "#5b21b6", fontSize: "13px" }}>
                                Amendment #{idx + 1} by Dr. {am.amendedBy?.firstName} {am.amendedBy?.lastName}
                              </span>
                              <span style={{ fontSize: "11px", color: "#6b21a8" }}>
                                {new Date(am.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                              Reason: {am.reason}
                            </div>
                            <div style={{ fontSize: "13px", color: "#1f2937", marginTop: "4px" }}>
                              Addendum: {am.notes}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              {/* Doctor Actions */}
              {isDoctor && detailedRecord?.status === "DRAFT" && (
                <button
                  className="btn btn-primary"
                  disabled={signRecordMutation.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        "Sign and finalize this medical record? Status will become FINALIZED and immutable."
                      )
                    ) {
                      signRecordMutation.mutate(detailedRecord.id);
                    }
                  }}
                >
                  <Check size={16} /> Sign & Lock Record
                </button>
              )}

              {isDoctor && (detailedRecord?.status === "FINALIZED" || detailedRecord?.status === "AMENDED") && (
                <button
                  className="btn btn-secondary"
                  style={{ borderColor: "#c4b5fd", color: "#6d28d9" }}
                  onClick={() => {
                    setAmendingRecordId(detailedRecord.id);
                    setAmendForm({ reason: "", notes: "" });
                    setActiveModal("amend-record");
                  }}
                >
                  <Edit3 size={16} /> Add Clinical Amendment
                </button>
              )}

              <button
                className="btn btn-secondary"
                onClick={() => {
                  setActiveModal(null);
                  setViewingRecordId(null);
                }}
              >
                Close Chart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CREATE NEW CLINICAL MEDICAL RECORD */}
      {/* ============================================================ */}
      {activeModal === "create-record" && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: "750px" }}>
            <div className="modal-header">
              <h3 className="modal-title">Create Clinical Encounter (Draft)</h3>
              <button
                aria-label="Close modal"
                className="btn-sm"
                style={{ background: "none", border: "none", cursor: "pointer" }}
                onClick={() => setActiveModal(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createRecordMutation.mutate(recordForm);
              }}
            >
              <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
                {/* Patient Selector */}
                <div className="form-group">
                  <label className="form-label">Patient *</label>
                  <select
                    className="form-control"
                    required
                    value={recordForm.patientId}
                    onChange={(e) => setRecordForm({ ...recordForm, patientId: e.target.value })}
                  >
                    <option value="">Select a patient</option>
                    {patientsData?.items?.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} (MRN: {p.mrn})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Chief Complaint */}
                <div className="form-group">
                  <label className="form-label">Chief Complaint *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Acute severe lower abdominal pain radiating to right flank"
                    value={recordForm.chiefComplaint}
                    onChange={(e) => setRecordForm({ ...recordForm, chiefComplaint: e.target.value })}
                  />
                </div>

                {/* History of Present Illness */}
                <div className="form-group">
                  <label className="form-label">History of Present Illness (HPI)</label>
                  <textarea
                    rows={3}
                    className="form-control"
                    placeholder="Onset, duration, severity, modifying factors, associated symptoms..."
                    value={recordForm.presentIllness}
                    onChange={(e) => setRecordForm({ ...recordForm, presentIllness: e.target.value })}
                  />
                </div>

                <div className="form-grid-2">
                  {/* Past Medical History */}
                  <div className="form-group">
                    <label className="form-label">Past Medical History</label>
                    <textarea
                      rows={3}
                      className="form-control"
                      placeholder="Hypertension, DM, surgeries..."
                      value={recordForm.pastMedicalHistory}
                      onChange={(e) => setRecordForm({ ...recordForm, pastMedicalHistory: e.target.value })}
                    />
                  </div>

                  {/* Physical Examination */}
                  <div className="form-group">
                    <label className="form-label">Physical Examination</label>
                    <textarea
                      rows={3}
                      className="form-control"
                      placeholder="HEENT, Cardiovascular, Respiratory, Abdomen..."
                      value={recordForm.physicalExamination}
                      onChange={(e) => setRecordForm({ ...recordForm, physicalExamination: e.target.value })}
                    />
                  </div>
                </div>

                {/* Clinical Assessment */}
                <div className="form-group">
                  <label className="form-label">Clinical Assessment</label>
                  <textarea
                    rows={2}
                    className="form-control"
                    placeholder="Diagnostic synthesis, differential diagnosis..."
                    value={recordForm.assessment}
                    onChange={(e) => setRecordForm({ ...recordForm, assessment: e.target.value })}
                  />
                </div>

                <div className="form-grid-2">
                  {/* Clinical Notes */}
                  <div className="form-group">
                    <label className="form-label">Clinical Notes & Plan</label>
                    <textarea
                      rows={2}
                      className="form-control"
                      placeholder="Lab orders, imaging, medications recommended..."
                      value={recordForm.clinicalNotes}
                      onChange={(e) => setRecordForm({ ...recordForm, clinicalNotes: e.target.value })}
                    />
                  </div>

                  {/* Follow Up */}
                  <div className="form-group">
                    <label className="form-label">Follow-Up Instructions</label>
                    <textarea
                      rows={2}
                      className="form-control"
                      placeholder="Return to clinic in 7 days, red-flag warnings..."
                      value={recordForm.followUpInstructions}
                      onChange={(e) => setRecordForm({ ...recordForm, followUpInstructions: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={createRecordMutation.isPending}>
                  {createRecordMutation.isPending ? "Saving Draft..." : "Save Draft Encounter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADD CLINICAL AMENDMENT (IMMUTABILITY WORKFLOW) */}
      {/* ============================================================ */}
      {activeModal === "amend-record" && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Edit3 size={18} color="#7c3aed" />
                <h3 className="modal-title">Attach Clinical Amendment</h3>
              </div>
              <button
                aria-label="Close modal"
                className="btn-sm"
                style={{ background: "none", border: "none", cursor: "pointer" }}
                onClick={() => setActiveModal(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (amendingRecordId) {
                  amendRecordMutation.mutate({
                    id: amendingRecordId,
                    data: amendForm,
                  });
                }
              }}
            >
              <div className="modal-body">
                <div
                  style={{
                    padding: "12px",
                    backgroundColor: "#f5f3ff",
                    border: "1px solid #ddd6fe",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    fontSize: "13px",
                    color: "#5b21b6",
                  }}
                >
                  <strong>Healthcare Immutability Notice:</strong> This medical record has been finalized. Original clinical entries cannot be overwritten. Your amendment will be appended to the official permanent audit record with your physician signature and timestamp.
                </div>

                <div className="form-group">
                  <label className="form-label">Clinical Reason for Amendment *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Corrected lab reference, additional diagnostic report from radiology"
                    value={amendForm.reason}
                    onChange={(e) => setAmendForm({ ...amendForm, reason: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Amendment Notes / Clinical Addendum *</label>
                  <textarea
                    rows={4}
                    required
                    className="form-control"
                    placeholder="Detailed clinical addendum to be appended to this encounter record..."
                    value={amendForm.notes}
                    onChange={(e) => setAmendForm({ ...amendForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ backgroundColor: "#7c3aed" }}
                  disabled={amendRecordMutation.isPending}
                >
                  {amendRecordMutation.isPending ? "Attaching..." : "Attach Official Amendment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: RECORD VITAL SIGNS */}
      {/* ============================================================ */}
      {activeModal === "record-vitals" && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: "600px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Activity size={18} color="#0284c7" />
                <h3 className="modal-title">Record Patient Vital Signs</h3>
              </div>
              <button
                aria-label="Close modal"
                className="btn-sm"
                style={{ background: "none", border: "none", cursor: "pointer" }}
                onClick={() => setActiveModal(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                recordVitalsMutation.mutate(vitalsForm);
              }}
            >
              <div className="modal-body">
                {/* Patient */}
                <div className="form-group">
                  <label className="form-label">Patient *</label>
                  <select
                    className="form-control"
                    required
                    value={vitalsForm.patientId}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, patientId: e.target.value })}
                  >
                    <option value="">Select a patient</option>
                    {patientsData?.items?.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} (MRN: {p.mrn})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Systolic BP (mmHg)</label>
                    <input
                      type="number"
                      min="50"
                      max="250"
                      className="form-control"
                      placeholder="120"
                      value={vitalsForm.systolicBp}
                      onChange={(e) => setVitalsForm({ ...vitalsForm, systolicBp: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Diastolic BP (mmHg)</label>
                    <input
                      type="number"
                      min="30"
                      max="150"
                      className="form-control"
                      placeholder="80"
                      value={vitalsForm.diastolicBp}
                      onChange={(e) => setVitalsForm({ ...vitalsForm, diastolicBp: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">Heart Rate (bpm)</label>
                    <input
                      type="number"
                      min="30"
                      max="250"
                      className="form-control"
                      placeholder="72"
                      value={vitalsForm.heartRate}
                      onChange={(e) => setVitalsForm({ ...vitalsForm, heartRate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Respiratory (/min)</label>
                    <input
                      type="number"
                      min="6"
                      max="60"
                      className="form-control"
                      placeholder="16"
                      value={vitalsForm.respiratoryRate}
                      onChange={(e) => setVitalsForm({ ...vitalsForm, respiratoryRate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Temp (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="30"
                      max="45"
                      className="form-control"
                      placeholder="36.8"
                      value={vitalsForm.temperature}
                      onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">Oxygen Sat (%)</label>
                    <input
                      type="number"
                      min="50"
                      max="100"
                      className="form-control"
                      placeholder="98"
                      value={vitalsForm.oxygenSaturation}
                      onChange={(e) => setVitalsForm({ ...vitalsForm, oxygenSaturation: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Weight (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="400"
                      className="form-control"
                      placeholder="70.5"
                      value={vitalsForm.weightKg}
                      onChange={(e) => setVitalsForm({ ...vitalsForm, weightKg: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Height (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="30"
                      max="250"
                      className="form-control"
                      placeholder="175"
                      value={vitalsForm.heightCm}
                      onChange={(e) => setVitalsForm({ ...vitalsForm, heightCm: e.target.value })}
                    />
                  </div>
                </div>

                {/* Real-time calculated BMI indicator */}
                {liveBmi && (
                  <div
                    style={{
                      padding: "10px 14px",
                      backgroundColor: "#e0f2fe",
                      border: "1px solid #bae6fd",
                      borderRadius: "8px",
                      marginBottom: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: "#0369a1", fontWeight: 600 }}>
                      Automated BMI Computation:
                    </span>
                    <strong style={{ fontSize: "16px", color: "#0284c7" }}>{liveBmi} kg/m²</strong>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Clinical Telemetry Notes</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Post-prandial reading, patient seated 5 mins"
                    value={vitalsForm.notes}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={recordVitalsMutation.isPending}>
                  {recordVitalsMutation.isPending ? "Recording..." : "Record Vitals"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DOCUMENT ALLERGY */}
      {/* ============================================================ */}
      {activeModal === "add-allergy" && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 className="modal-title">Document Patient Allergy</h3>
              <button
                aria-label="Close modal"
                className="btn-sm"
                style={{ background: "none", border: "none", cursor: "pointer" }}
                onClick={() => setActiveModal(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addAllergyMutation.mutate(allergyForm);
              }}
            >
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Patient *</label>
                  <select
                    className="form-control"
                    required
                    value={allergyForm.patientId}
                    onChange={(e) => setAllergyForm({ ...allergyForm, patientId: e.target.value })}
                  >
                    <option value="">Select a patient</option>
                    {patientsData?.items?.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} (MRN: {p.mrn})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Allergen *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Penicillin, Peanuts, Latex, Contrast Dye"
                    value={allergyForm.allergen}
                    onChange={(e) => setAllergyForm({ ...allergyForm, allergen: e.target.value })}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Severity *</label>
                    <select
                      className="form-control"
                      value={allergyForm.severity}
                      onChange={(e) => setAllergyForm({ ...allergyForm, severity: e.target.value })}
                    >
                      <option value="MILD">Mild</option>
                      <option value="MODERATE">Moderate</option>
                      <option value="SEVERE">Severe</option>
                      <option value="LIFE_THREATENING">Life Threatening</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Observed Reaction</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Anaphylaxis, Urticaria, Bronchospasm"
                      value={allergyForm.reaction}
                      onChange={(e) => setAllergyForm({ ...allergyForm, reaction: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Clinical Notes</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Confirmed by immunologist in 2021"
                    value={allergyForm.notes}
                    onChange={(e) => setAllergyForm({ ...allergyForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={addAllergyMutation.isPending}>
                  {addAllergyMutation.isPending ? "Documenting..." : "Document Allergy"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DOCUMENT MEDICATION HISTORY */}
      {/* ============================================================ */}
      {activeModal === "add-medication" && (
        <div className="modal-dialog-backdrop modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 className="modal-title">Document Medication History</h3>
              <button
                aria-label="Close modal"
                className="btn-sm"
                style={{ background: "none", border: "none", cursor: "pointer" }}
                onClick={() => setActiveModal(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addMedicationMutation.mutate(medicationForm);
              }}
            >
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Patient *</label>
                  <select
                    className="form-control"
                    required
                    value={medicationForm.patientId}
                    onChange={(e) => setMedicationForm({ ...medicationForm, patientId: e.target.value })}
                  >
                    <option value="">Select a patient</option>
                    {patientsData?.items?.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} (MRN: {p.mrn})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Medication Name *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Atorvastatin, Metformin, Lisinopril"
                    value={medicationForm.medicationName}
                    onChange={(e) => setMedicationForm({ ...medicationForm, medicationName: e.target.value })}
                  />
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">Dosage *</label>
                    <input
                      type="text"
                      required
                      className="form-control"
                      placeholder="e.g. 20 mg"
                      value={medicationForm.dosage}
                      onChange={(e) => setMedicationForm({ ...medicationForm, dosage: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Frequency *</label>
                    <input
                      type="text"
                      required
                      className="form-control"
                      placeholder="e.g. Once daily at bedtime"
                      value={medicationForm.frequency}
                      onChange={(e) => setMedicationForm({ ...medicationForm, frequency: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Route</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. ORAL, IV, TOPICAL"
                      value={medicationForm.route}
                      onChange={(e) => setMedicationForm({ ...medicationForm, route: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Prescription / Start Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={medicationForm.prescribedDate}
                    onChange={(e) => setMedicationForm({ ...medicationForm, prescribedDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={addMedicationMutation.isPending}>
                  {addMedicationMutation.isPending ? "Documenting..." : "Document Medication"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADD DIAGNOSIS */}
      {/* ============================================================ */}
      {activeModal === "add-diagnosis" && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 className="modal-title">Record Clinical Diagnosis</h3>
              <button
                aria-label="Close modal"
                className="btn-sm"
                style={{ background: "none", border: "none", cursor: "pointer" }}
                onClick={() => setActiveModal(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                recordDiagnosisMutation.mutate(diagnosisForm);
              }}
            >
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Patient *</label>
                  <select
                    className="form-control"
                    required
                    value={diagnosisForm.patientId}
                    onChange={(e) => setDiagnosisForm({ ...diagnosisForm, patientId: e.target.value })}
                  >
                    <option value="">Select a patient</option>
                    {patientsData?.items?.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} (MRN: {p.mrn})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Diagnosis / ICD Code *</label>
                    <input
                      type="text"
                      required
                      className="form-control"
                      placeholder="e.g. I10, E11.9, J45.909"
                      value={diagnosisForm.code}
                      onChange={(e) => setDiagnosisForm({ ...diagnosisForm, code: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select
                      className="form-control"
                      value={diagnosisForm.type}
                      onChange={(e) => setDiagnosisForm({ ...diagnosisForm, type: e.target.value })}
                    >
                      <option value="PRIMARY">Primary</option>
                      <option value="SECONDARY">Secondary</option>
                      <option value="ADMITTING">Admitting</option>
                      <option value="DISCHARGE">Discharge</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Essential (primary) hypertension"
                    value={diagnosisForm.description}
                    onChange={(e) => setDiagnosisForm({ ...diagnosisForm, description: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Clinical Notes</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Stage 2 hypertension, well controlled on ACE inhibitors"
                    value={diagnosisForm.notes}
                    onChange={(e) => setDiagnosisForm({ ...diagnosisForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={recordDiagnosisMutation.isPending}>
                  {recordDiagnosisMutation.isPending ? "Recording..." : "Record Diagnosis"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
