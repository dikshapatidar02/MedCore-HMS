"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import {
  Stethoscope,
  Plus,
  Search,
  Calendar,
  Clock,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  User,
} from "lucide-react";

export default function DoctorsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = user?.role === "SUPER_ADMIN" || user?.role === "HOSPITAL_ADMIN";

  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [modalMode, setModalMode] = useState<"add" | "edit" | "schedule" | null>(null);
  const [activeDoctor, setActiveDoctor] = useState<any>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form for adding doctor
  const [addForm, setAddForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "DemoPassword@123",
    phone: "",
    departmentId: "",
    licenseNumber: "",
    specialization: "",
    experienceYears: 5,
    consultationFee: 1000,
    bio: "",
  });

  // Form for schedule exception
  const [exceptionForm, setExceptionForm] = useState({
    date: "",
    reason: "Medical Leave",
    isAvailable: false,
  });

  // Fetch departments for filter and dropdowns
  const { data: deptData } = useQuery({
    queryKey: ["departments-dropdown"],
    queryFn: () => apiRequest<{ items: any[] }>("/departments?limit=100"),
  });

  // Fetch doctors list
  const { data: doctorsData, isLoading } = useQuery({
    queryKey: ["doctors", search, selectedDept],
    queryFn: () => {
      let url = `/doctors?limit=50&search=${encodeURIComponent(search)}`;
      if (selectedDept) url += `&departmentId=${encodeURIComponent(selectedDept)}`;
      return apiRequest<{ items: any[]; total: number }>(url);
    },
  });

  // Fetch active doctor's schedule when modal opened
  const { data: scheduleData, refetch: refetchSchedule } = useQuery({
    queryKey: ["doctor-schedule", activeDoctor?.id],
    queryFn: () => apiRequest<any>(`/scheduling/doctors/${activeDoctor.id}/availability`),
    enabled: !!activeDoctor && modalMode === "schedule",
  });

  const { data: exceptionsData, refetch: refetchExceptions } = useQuery({
    queryKey: ["doctor-exceptions", activeDoctor?.id],
    queryFn: () => apiRequest<any[]>(`/scheduling/doctors/${activeDoctor.id}/exceptions`),
    enabled: !!activeDoctor && modalMode === "schedule",
  });

  const createDoctorMutation = useMutation({
    mutationFn: (data: typeof addForm) =>
      apiRequest("/doctors", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      setSuccessMsg("Doctor registered successfully.");
      setModalMode(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const createExceptionMutation = useMutation({
    mutationFn: (data: typeof exceptionForm) =>
      apiRequest(`/scheduling/doctors/${activeDoctor.id}/exceptions`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      refetchExceptions();
      setSuccessMsg("Schedule exception added.");
      setExceptionForm({ date: "", reason: "Medical Leave", isAvailable: false });
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const deleteExceptionMutation = useMutation({
    mutationFn: (exId: string) =>
      apiRequest(`/scheduling/doctors/${activeDoctor.id}/exceptions/${exId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      refetchExceptions();
      setSuccessMsg("Schedule exception removed.");
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const deleteDoctorMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/doctors/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      setSuccessMsg("Doctor record soft-deleted.");
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const handleOpenAdd = () => {
    setActiveDoctor(null);
    setErrorMsg(null);
    setModalMode("add");
  };

  const handleOpenSchedule = (doc: any) => {
    setActiveDoctor(doc);
    setErrorMsg(null);
    setModalMode("schedule");
  };

  const handleDeleteDoctor = (doc: any) => {
    if (confirm(`Are you sure you want to delete doctor Dr. ${doc.user.firstName} ${doc.user.lastName}?`)) {
      deleteDoctorMutation.mutate(doc.id);
    }
  };

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Doctor Management</h1>
          <div className="page-subtitle">
            Clinical profiles, weekly availability schedules, and medical council registrations
          </div>
        </div>

        {isStaff && (
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <Plus size={16} />
            <span>Add New Doctor</span>
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

      <div className="panel">
        <div className="panel-header">
          <div className="toolbar">
            <input
              type="text"
              className="search-input"
              placeholder="Search by name, specialization, license..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="select-input"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
            >
              <option value="">All Departments</option>
              {deptData?.items?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <span style={{ fontSize: 13, color: "#64748b" }}>
            Total: {doctorsData?.total ?? 0}
          </span>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Doctor</th>
                <th>Department</th>
                <th>Specialization</th>
                <th>License</th>
                <th>Experience & Fee</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 30 }}>
                    Loading doctors...
                  </td>
                </tr>
              ) : doctorsData?.items && doctorsData.items.length > 0 ? (
                doctorsData.items.map((doc: any) => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        Dr. {doc.user.firstName} {doc.user.lastName}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{doc.user.email}</div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 12,
                          background: "#e0f2fe",
                          color: "#0369a1",
                          padding: "3px 8px",
                          borderRadius: 4,
                        }}
                      >
                        {doc.department.name}
                      </span>
                    </td>
                    <td>{doc.specialization}</td>
                    <td>
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: "#475569" }}>
                        {doc.licenseNumber}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>
                        <strong>{doc.experienceYears} yrs</strong> &middot; ₹{doc.consultationFee}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenSchedule(doc)}
                          title="View & Manage Availability"
                        >
                          <Clock size={13} />
                          <span>Schedule</span>
                        </button>
                        {isStaff && (
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: "#ef4444" }}
                            onClick={() => handleDeleteDoctor(doc)}
                            title="Soft Delete Doctor"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 30 }}>
                    No doctors found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Doctor Modal */}
      {modalMode === "add" && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 className="modal-title">Register New Consulting Doctor</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalMode(null)}>
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createDoctorMutation.mutate(addForm);
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
                      value={addForm.firstName}
                      onChange={(e) => setAddForm({ ...addForm, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Last Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={addForm.lastName}
                      onChange={(e) => setAddForm({ ...addForm, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={addForm.email}
                      onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contact Phone</label>
                    <input
                      type="text"
                      className="form-control"
                      value={addForm.phone}
                      onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select
                      className="form-control"
                      value={addForm.departmentId}
                      onChange={(e) => setAddForm({ ...addForm, departmentId: e.target.value })}
                      required
                    >
                      <option value="">Select Department</option>
                      {deptData?.items?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Medical Council License Number</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. MCI-CARD-99102"
                      value={addForm.licenseNumber}
                      onChange={(e) => setAddForm({ ...addForm, licenseNumber: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">Specialization</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Cardiology"
                      value={addForm.specialization}
                      onChange={(e) => setAddForm({ ...addForm, specialization: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Experience (Years)</label>
                    <input
                      type="number"
                      min={0}
                      className="form-control"
                      value={addForm.experienceYears}
                      onChange={(e) =>
                        setAddForm({ ...addForm, experienceYears: parseInt(e.target.value, 10) })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fee (₹)</label>
                    <input
                      type="number"
                      min={0}
                      className="form-control"
                      value={addForm.consultationFee}
                      onChange={(e) =>
                        setAddForm({ ...addForm, consultationFee: parseFloat(e.target.value) })
                      }
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Professional Bio</label>
                  <textarea
                    rows={2}
                    className="form-control"
                    value={addForm.bio}
                    onChange={(e) => setAddForm({ ...addForm, bio: e.target.value })}
                  />
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
                  disabled={createDoctorMutation.isPending}
                >
                  {createDoctorMutation.isPending ? "Creating..." : "Register Doctor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule & Exceptions Modal */}
      {modalMode === "schedule" && activeDoctor && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  Dr. {activeDoctor.user.firstName} {activeDoctor.user.lastName} — Schedule
                </h3>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Weekly working hours and calendar exceptions
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalMode(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
              {successMsg && <div className="alert alert-success">{successMsg}</div>}

              <h4 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "#334155" }}>
                Weekly Scheduled Working Hours
              </h4>

              {scheduleData?.availabilities && scheduleData.availabilities.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                  {scheduleData.availabilities.map((avail: any) => (
                    <div
                      key={avail.id}
                      style={{
                        padding: 10,
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        background: "#f8fafc",
                        fontSize: 13,
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{dayNames[avail.dayOfWeek] || "Day"}</span>
                      <span style={{ color: "#0284c7" }}>
                        {avail.startTime} – {avail.endTime} ({avail.slotDurationMinutes}m)
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8, marginBottom: 24, fontSize: 13, color: "#64748b" }}>
                  No weekly hours configured. Default hours apply or appointments can be booked manually.
                </div>
              )}

              <h4 style={{ fontSize: 14, fontWeight: 700, margin: "16px 0 10px", color: "#334155" }}>
                Schedule Exceptions (Leaves & Time-Off)
              </h4>

              {exceptionsData && exceptionsData.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {exceptionsData.map((ex: any) => (
                    <div
                      key={ex.id}
                      style={{
                        padding: 10,
                        border: "1px solid #fee2e2",
                        borderRadius: 8,
                        background: "#fff5f5",
                        fontSize: 13,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong>{new Date(ex.date).toLocaleDateString()}</strong> &middot;{" "}
                        <span style={{ color: "#b91c1c" }}>{ex.reason || "Leave / Unavailable"}</span>
                        {ex.startTime && ex.endTime && (
                          <span style={{ fontSize: 11, color: "#64748b" }}>
                            {" "}({ex.startTime} - {ex.endTime})
                          </span>
                        )}
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ color: "#ef4444" }}
                        onClick={() => deleteExceptionMutation.mutate(ex.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
                  No active exceptions on calendar.
                </div>
              )}

              {/* Add Exception form */}
              <div style={{ padding: 16, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <h5 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700 }}>
                  Block Doctor Availability for a Date
                </h5>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    type="date"
                    className="form-control"
                    style={{ width: "auto" }}
                    value={exceptionForm.date}
                    onChange={(e) => setExceptionForm({ ...exceptionForm, date: e.target.value })}
                  />
                  <input
                    type="text"
                    className="form-control"
                    style={{ flex: 1 }}
                    placeholder="Reason (e.g. Conference, Medical Leave)"
                    value={exceptionForm.reason}
                    onChange={(e) => setExceptionForm({ ...exceptionForm, reason: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={!exceptionForm.date || createExceptionMutation.isPending}
                    onClick={() => createExceptionMutation.mutate(exceptionForm)}
                  >
                    Add Leave Block
                  </button>
                </div>
              </div>
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
