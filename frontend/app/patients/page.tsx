"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import {
  Users,
  Plus,
  Search,
  Calendar,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  User,
} from "lucide-react";

export default function PatientsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isPatient = user?.role === "PATIENT";
  const canRegister =
    user?.role === "SUPER_ADMIN" ||
    user?.role === "HOSPITAL_ADMIN" ||
    user?.role === "RECEPTIONIST" ||
    user?.role === "NURSE";

  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<"register" | "details" | null>(null);
  const [activePatient, setActivePatient] = useState<any>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form for registering patient
  const [regForm, setRegForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "1990-01-01",
    gender: "MALE",
    bloodGroup: "O+",
    phone: "",
    email: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    address: {
      street: "",
      city: "",
      state: "",
      postalCode: "",
      country: "India",
    },
  });

  // Query all patients (for staff)
  const { data: patientsData, isLoading: loadingPatients } = useQuery({
    queryKey: ["patients", search],
    queryFn: () =>
      apiRequest<{ items: any[]; total: number }>(
        `/patients?limit=50&search=${encodeURIComponent(search)}`
      ),
    enabled: !isPatient,
  });

  // Query self profile (for logged in patient)
  const { data: myPatientProfile, isLoading: loadingSelf } = useQuery({
    queryKey: ["my-patient-profile"],
    queryFn: () => apiRequest<any>("/patients/me"),
    enabled: isPatient,
  });

  // Query patient appointments for details view
  const { data: patientAppts } = useQuery({
    queryKey: ["patient-appointments", activePatient?.id],
    queryFn: () =>
      apiRequest<{ items: any[] }>(`/patients/${activePatient.id}/appointments?limit=20`),
    enabled: !!activePatient && modalMode === "details",
  });

  const registerMutation = useMutation({
    mutationFn: (data: typeof regForm) =>
      apiRequest("/patients", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setSuccessMsg(`Patient registered successfully with MRN: ${res.mrn}`);
      setModalMode(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const deletePatientMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/patients/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setSuccessMsg("Patient record soft-deleted.");
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const handleOpenRegister = () => {
    setActivePatient(null);
    setErrorMsg(null);
    setModalMode("register");
  };

  const handleOpenDetails = (pat: any) => {
    setActivePatient(pat);
    setErrorMsg(null);
    setModalMode("details");
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Patient Management</h1>
          <div className="page-subtitle">
            {isPatient
              ? "Your Patient Profile & Clinical Appointment History"
              : "Medical Record Numbers (MRN), demographics, and patient care files"}
          </div>
        </div>

        {canRegister && (
          <button className="btn btn-primary" onClick={handleOpenRegister}>
            <Plus size={16} />
            <span>Register New Patient</span>
          </button>
        )}
      </div>

      {successMsg && (
        <div className="alert alert-success">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="alert alert-error">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Patient Self-View */}
      {isPatient ? (
        <div style={{ maxWidth: 840 }}>
          {loadingSelf ? (
            <div>Loading your medical profile...</div>
          ) : myPatientProfile ? (
            <div className="panel">
              <div className="panel-header">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <User size={22} style={{ color: "var(--primary)" }} />
                  <div>
                    <h3 className="panel-title">
                      {myPatientProfile.firstName} {myPatientProfile.lastName}
                    </h3>
                    <div style={{ fontSize: 12, color: "#0284c7", fontWeight: 700 }}>
                      MRN: {myPatientProfile.mrn} &middot; {myPatientProfile.hospital?.name}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ padding: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Date of Birth</div>
                    <div style={{ fontWeight: 600 }}>
                      {new Date(myPatientProfile.dateOfBirth).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Gender & Blood Group</div>
                    <div style={{ fontWeight: 600 }}>
                      {myPatientProfile.gender} &middot; {myPatientProfile.bloodGroup || "Not specified"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Contact Phone</div>
                    <div style={{ fontWeight: 600 }}>{myPatientProfile.phone}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Emergency Contact</div>
                    <div style={{ fontWeight: 600 }}>
                      {myPatientProfile.emergencyContactName} ({myPatientProfile.emergencyContactPhone})
                    </div>
                  </div>
                </div>

                {myPatientProfile.address && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Registered Address</div>
                    <div style={{ fontWeight: 500 }}>
                      {myPatientProfile.address.street}, {myPatientProfile.address.city},{" "}
                      {myPatientProfile.address.state} — {myPatientProfile.address.postalCode}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="alert alert-info">
              No patient profile linked to this portal user account.
            </div>
          )}
        </div>
      ) : (
        /* Staff Directory Table */
        <div className="panel">
          <div className="panel-header">
            <div className="toolbar">
              <div className="search-input-wrapper">
                <Search size={15} className="search-input-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search by MRN, name, phone, email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
              Total: {patientsData?.total ?? 0}
            </span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>MRN</th>
                  <th>Patient Name</th>
                  <th>Gender & Age</th>
                  <th>Contact</th>
                  <th>City / State</th>
                  <th>Appointments</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingPatients ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: 36, color: "var(--text-muted)" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                        <span className="spinner" style={{ width: 16, height: 16 }} />
                        <span>Loading patient registry...</span>
                      </div>
                    </td>
                  </tr>
                ) : patientsData?.items && patientsData.items.length > 0 ? (
                  patientsData.items.map((pat: any) => (
                    <tr key={pat.id}>
                      <td>
                        <span className="mono-id">
                          {pat.mrn}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-main)" }}>
                          {pat.firstName} {pat.lastName}
                        </div>
                        {pat.email && (
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{pat.email}</div>
                        )}
                      </td>
                      <td>
                        {pat.gender} &middot;{" "}
                        {new Date().getFullYear() - new Date(pat.dateOfBirth).getFullYear()} yrs
                      </td>
                      <td>
                        <div>{pat.phone}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          Emerg: {pat.emergencyContactName} ({pat.emergencyContactPhone})
                        </div>
                      </td>
                      <td>
                        {pat.address
                          ? `${pat.address.city}, ${pat.address.state}`
                          : "No address recorded"}
                      </td>
                      <td>
                        <span className="status-badge badge-confirmed">
                          <span className="badge-dot" />
                          <span>{pat._count?.appointments ?? 0} booked</span>
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenDetails(pat)}
                            title="View Full Profile & Appointment History"
                          >
                            <FileText size={13} />
                            <span>Details</span>
                          </button>
                          {user?.role === "SUPER_ADMIN" || user?.role === "HOSPITAL_ADMIN" ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: "var(--danger)" }}
                              onClick={() => {
                                if (confirm(`Soft-delete record for patient ${pat.firstName} ${pat.lastName}?`)) {
                                  deletePatientMutation.mutate(pat.id);
                                }
                              }}
                              title="Soft Delete Patient"
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: 36, color: "var(--text-muted)" }}>
                      No patient records found matching criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Register Patient Modal */}
      {modalMode === "register" && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 className="modal-title">Register New Hospital Patient</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalMode(null)}>
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                registerMutation.mutate(regForm);
              }}
            >
              <div className="modal-body">
                {errorMsg && <div className="alert alert-error">{errorMsg}</div>}

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">First Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={regForm.firstName}
                      onChange={(e) => setRegForm({ ...regForm, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Last Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={regForm.lastName}
                      onChange={(e) => setRegForm({ ...regForm, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">Date of Birth</label>
                    <input
                      type="date"
                      className="form-control"
                      value={regForm.dateOfBirth}
                      onChange={(e) => setRegForm({ ...regForm, dateOfBirth: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Gender</label>
                    <select
                      className="form-control"
                      value={regForm.gender}
                      onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })}
                      required
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                      <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Blood Group</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. O+, A+, B-"
                      value={regForm.bloodGroup}
                      onChange={(e) => setRegForm({ ...regForm, bloodGroup: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Contact Phone</label>
                    <input
                      type="text"
                      className="form-control"
                      value={regForm.phone}
                      onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email (Optional)</label>
                    <input
                      type="email"
                      className="form-control"
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Emergency Contact Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={regForm.emergencyContactName}
                      onChange={(e) =>
                        setRegForm({ ...regForm, emergencyContactName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Emergency Contact Phone</label>
                    <input
                      type="text"
                      className="form-control"
                      value={regForm.emergencyContactPhone}
                      onChange={(e) =>
                        setRegForm({ ...regForm, emergencyContactPhone: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>

                <h4 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 8px", color: "#334155" }}>
                  Residential Address
                </h4>

                <div className="form-group">
                  <label className="form-label">Street Address</label>
                  <input
                    type="text"
                    className="form-control"
                    value={regForm.address.street}
                    onChange={(e) =>
                      setRegForm({
                        ...regForm,
                        address: { ...regForm.address, street: e.target.value },
                      })
                    }
                    required
                  />
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input
                      type="text"
                      className="form-control"
                      value={regForm.address.city}
                      onChange={(e) =>
                        setRegForm({
                          ...regForm,
                          address: { ...regForm.address, city: e.target.value },
                        })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input
                      type="text"
                      className="form-control"
                      value={regForm.address.state}
                      onChange={(e) =>
                        setRegForm({
                          ...regForm,
                          address: { ...regForm.address, state: e.target.value },
                        })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Postal Code</label>
                    <input
                      type="text"
                      className="form-control"
                      value={regForm.address.postalCode}
                      onChange={(e) =>
                        setRegForm({
                          ...regForm,
                          address: { ...regForm.address, postalCode: e.target.value },
                        })
                      }
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalMode(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? "Generating MRN & Registering..." : "Register Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patient Details & Appointment History Modal */}
      {modalMode === "details" && activePatient && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {activePatient.firstName} {activePatient.lastName}
                </h3>
                <div style={{ fontSize: 12, color: "#0284c7", fontWeight: 700 }}>
                  MRN: {activePatient.mrn}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalMode(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                <div>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Gender & DOB: </span>
                  <strong>{activePatient.gender}</strong>, {new Date(activePatient.dateOfBirth).toLocaleDateString()}
                </div>
                <div>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Blood Group: </span>
                  <strong>{activePatient.bloodGroup || "—"}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Phone: </span>
                  <strong>{activePatient.phone}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Emergency Contact: </span>
                  <strong>
                    {activePatient.emergencyContactName} ({activePatient.emergencyContactPhone})
                  </strong>
                </div>
              </div>

              <h4 style={{ fontSize: 14, fontWeight: 700, margin: "20px 0 10px", color: "#334155" }}>
                Patient Appointment History
              </h4>

              {patientAppts?.items && patientAppts.items.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {patientAppts.items.map((appt: any) => (
                    <div
                      key={appt.id}
                      style={{
                        padding: 12,
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          Dr. {appt.doctor.user.firstName} {appt.doctor.user.lastName} ({appt.department.name})
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {new Date(appt.appointmentDate).toLocaleDateString()} @ {appt.startTime} - {appt.endTime}
                        </div>
                        <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>
                          Reason: {appt.reason}
                        </div>
                      </div>
                      <span className={`status-badge badge-${appt.status.toLowerCase()}`}>
                        {appt.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>
                  No appointments on record for this patient.
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalMode(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
