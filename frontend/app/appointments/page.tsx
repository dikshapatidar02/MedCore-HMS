"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import {
  Calendar,
  Plus,
  Clock,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Ban,
  Filter,
  Check,
  ChevronRight,
} from "lucide-react";

export default function AppointmentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isPatient = user?.role === "PATIENT";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [modalMode, setModalMode] = useState<"book" | "reschedule" | "cancel" | null>(null);
  const [activeAppt, setActiveAppt] = useState<any>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Booking Form State
  const [bookForm, setBookForm] = useState({
    patientId: "",
    doctorId: "",
    appointmentDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    startTime: "09:00",
    endTime: "09:30",
    reason: "",
    notes: "",
    type: "CONSULTATION",
    isEmergency: false,
  });

  // Reschedule Form State
  const [rescheduleForm, setRescheduleForm] = useState({
    appointmentDate: "",
    startTime: "",
    endTime: "",
    reason: "",
  });

  // Cancel Form State
  const [cancelReason, setCancelReason] = useState("");

  // Queries for form dropdowns
  const { data: doctorsData } = useQuery({
    queryKey: ["doctors-dropdown"],
    queryFn: () => apiRequest<{ items: any[] }>("/doctors?limit=100"),
  });

  const { data: patientsData } = useQuery({
    queryKey: ["patients-dropdown"],
    queryFn: () =>
      !isPatient
        ? apiRequest<{ items: any[] }>("/patients?limit=100")
        : Promise.resolve({ items: [] }),
    enabled: !isPatient,
  });

  // Query live slots when doctor and date selected in booking modal
  const { data: slotsData, isLoading: loadingSlots } = useQuery({
    queryKey: ["available-slots", bookForm.doctorId, bookForm.appointmentDate],
    queryFn: () =>
      apiRequest<{ slots: any[]; isAvailable: boolean; reason?: string }>(
        `/scheduling/doctors/${bookForm.doctorId}/slots?date=${bookForm.appointmentDate}`
      ),
    enabled: !!bookForm.doctorId && !!bookForm.appointmentDate && modalMode === "book",
  });

  // Main Appointments Query
  const { data: appointmentsData, isLoading: loadingAppts } = useQuery({
    queryKey: ["appointments", search, statusFilter],
    queryFn: () => {
      let url = `/appointments?limit=50&search=${encodeURIComponent(search)}`;
      if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;
      return apiRequest<{ items: any[]; total: number }>(url);
    },
  });

  // Mutations
  const bookMutation = useMutation({
    mutationFn: (data: typeof bookForm) =>
      apiRequest("/appointments", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setSuccessMsg("Appointment booked successfully.");
      setModalMode(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof rescheduleForm }) =>
      apiRequest(`/appointments/${id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setSuccessMsg("Appointment rescheduled successfully.");
      setModalMode(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      apiRequest(`/appointments/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, notes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setSuccessMsg("Appointment status updated.");
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest(`/appointments/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setSuccessMsg("Appointment cancelled.");
      setModalMode(null);
      setCancelReason("");
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const handleOpenBook = () => {
    setErrorMsg(null);
    if (isPatient && user?.patientProfile?.id) {
      setBookForm((prev) => ({ ...prev, patientId: user.patientProfile!.id }));
    }
    setModalMode("book");
  };

  const handleOpenReschedule = (appt: any) => {
    setActiveAppt(appt);
    setRescheduleForm({
      appointmentDate: new Date(appt.appointmentDate).toISOString().split("T")[0],
      startTime: appt.startTime,
      endTime: appt.endTime,
      reason: "",
    });
    setErrorMsg(null);
    setModalMode("reschedule");
  };

  const handleOpenCancel = (appt: any) => {
    setActiveAppt(appt);
    setCancelReason("");
    setErrorMsg(null);
    setModalMode("cancel");
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Appointment Management</h1>
          <div className="page-subtitle">
            Lifecycle consultations, double-booking prevention, and clinical workflow state transitions
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleOpenBook}>
          <Plus size={16} />
          <span>Book New Appointment</span>
        </button>
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
            <div className="search-input-wrapper">
              <Search size={15} className="search-input-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search by patient, reason, MRN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="select-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="NO_SHOW">No Show</option>
            </select>
          </div>

          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
            Total: {appointmentsData?.total ?? 0}
          </span>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Doctor & Dept</th>
                <th>Date & Slot</th>
                <th>Type & Reason</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Workflow Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingAppts ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 36, color: "var(--text-muted)" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span className="spinner" style={{ width: 16, height: 16 }} />
                      <span>Loading appointments...</span>
                    </div>
                  </td>
                </tr>
              ) : appointmentsData?.items && appointmentsData.items.length > 0 ? (
                appointmentsData.items.map((appt: any) => {
                  const isTerminal = ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(appt.status);

                  return (
                    <tr key={appt.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-main)" }}>
                          {appt.patient.firstName} {appt.patient.lastName}
                        </div>
                        <div style={{ marginTop: 2 }}>
                          <span className="mono-id">
                            {appt.patient.mrn}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-main)" }}>
                          Dr. {appt.doctor.user.firstName} {appt.doctor.user.lastName}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {appt.department.name}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-main)" }}>
                          {new Date(appt.appointmentDate).toLocaleDateString()}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>
                          {appt.startTime} – {appt.endTime}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {appt.type}
                        </span>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {appt.reason}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge badge-${appt.status.toLowerCase()}`}>
                          <span className="badge-dot" />
                          <span>{appt.status}</span>
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {/* Status transitions based on state machine */}
                          {!isPatient && appt.status === "PENDING" && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ color: "var(--primary)" }}
                              onClick={() => statusMutation.mutate({ id: appt.id, status: "CONFIRMED" })}
                              title="Confirm Appointment"
                            >
                              <Check size={12} />
                              <span>Confirm</span>
                            </button>
                          )}

                          {!isPatient && appt.status === "CONFIRMED" && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ color: "var(--purple)" }}
                              onClick={() => statusMutation.mutate({ id: appt.id, status: "IN_PROGRESS" })}
                              title="Begin Consultation"
                            >
                              <ChevronRight size={12} />
                              <span>In-Progress</span>
                            </button>
                          )}

                          {!isPatient && appt.status === "IN_PROGRESS" && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ color: "var(--success)" }}
                              onClick={() => statusMutation.mutate({ id: appt.id, status: "COMPLETED" })}
                              title="Complete Consultation"
                            >
                              <CheckCircle2 size={12} />
                              <span>Complete</span>
                            </button>
                          )}

                          {!isTerminal && (
                            <>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleOpenReschedule(appt)}
                                title="Reschedule Date/Time"
                              >
                                <RefreshCw size={12} />
                                <span>Reschedule</span>
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: "var(--danger)" }}
                                onClick={() => handleOpenCancel(appt)}
                                title="Cancel Appointment"
                              >
                                <Ban size={12} />
                                <span>Cancel</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 36, color: "var(--text-muted)" }}>
                    No appointments found matching filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Book Appointment Modal */}
      {modalMode === "book" && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h3 className="modal-title">Schedule New Appointment</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalMode(null)}>
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setErrorMsg(null);
                bookMutation.mutate(bookForm);
              }}
            >
              <div className="modal-body">
                {errorMsg && <div className="alert alert-error">{errorMsg}</div>}

                {/* Patient selection */}
                <div className="form-group">
                  <label className="form-label">Patient</label>
                  {isPatient ? (
                    <input
                      type="text"
                      className="form-control"
                      value={`${user?.firstName} ${user?.lastName} (Self Booking)`}
                      disabled
                      style={{ background: "#f8fafc" }}
                    />
                  ) : (
                    <select
                      className="form-control"
                      value={bookForm.patientId}
                      onChange={(e) => setBookForm({ ...bookForm, patientId: e.target.value })}
                      required
                    >
                      <option value="">Select Patient</option>
                      {patientsData?.items?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName} — MRN: {p.mrn} ({p.phone})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Doctor selection */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Consulting Doctor</label>
                    <select
                      className="form-control"
                      value={bookForm.doctorId}
                      onChange={(e) => setBookForm({ ...bookForm, doctorId: e.target.value })}
                      required
                    >
                      <option value="">Select Doctor</option>
                      {doctorsData?.items?.map((d) => (
                        <option key={d.id} value={d.id}>
                          Dr. {d.user.firstName} {d.user.lastName} ({d.department.name} — ₹
                          {d.consultationFee})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Appointment Date</label>
                    <input
                      type="date"
                      className="form-control"
                      min={new Date().toISOString().split("T")[0]}
                      value={bookForm.appointmentDate}
                      onChange={(e) =>
                        setBookForm({ ...bookForm, appointmentDate: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>

                {/* Live Computed Available Slots */}
                <div className="form-group">
                  <label className="form-label">
                    Live Available Slots for Selected Date & Doctor
                  </label>

                  {loadingSlots ? (
                    <div style={{ fontSize: 13, color: "#64748b" }}>
                      Querying doctor availability and checking schedule exceptions...
                    </div>
                  ) : slotsData && slotsData.slots && slotsData.slots.length > 0 ? (
                    <div>
                      <div className="slot-grid">
                        {slotsData.slots.map((slot: any, idx: number) => {
                          const isSelected =
                            bookForm.startTime === slot.startTime &&
                            bookForm.endTime === slot.endTime;
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={!slot.isAvailable}
                              className={`slot-button ${isSelected ? "selected" : ""}`}
                              onClick={() =>
                                setBookForm({
                                  ...bookForm,
                                  startTime: slot.startTime,
                                  endTime: slot.endTime,
                                })
                              }
                              title={slot.conflictReason || "Click to select slot"}
                            >
                              {slot.startTime}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                        Selected: <strong>{bookForm.startTime} – {bookForm.endTime}</strong>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: 10,
                        background: "#fffbeb",
                        border: "1px solid #fef3c7",
                        borderRadius: 6,
                        fontSize: 12,
                        color: "#92400e",
                      }}
                    >
                      {slotsData?.reason ||
                        "No available automated slots for this date. You may specify custom hours below or select another date."}
                    </div>
                  )}
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Start Time (HH:mm)</label>
                    <input
                      type="time"
                      className="form-control"
                      value={bookForm.startTime}
                      onChange={(e) => setBookForm({ ...bookForm, startTime: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time (HH:mm)</label>
                    <input
                      type="time"
                      className="form-control"
                      value={bookForm.endTime}
                      onChange={(e) => setBookForm({ ...bookForm, endTime: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Reason for Consultation</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Chest discomfort, general checkup, follow-up"
                    value={bookForm.reason}
                    onChange={(e) => setBookForm({ ...bookForm, reason: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Clinical / Administrative Notes (Optional)</label>
                  <textarea
                    rows={2}
                    className="form-control"
                    value={bookForm.notes}
                    onChange={(e) => setBookForm({ ...bookForm, notes: e.target.value })}
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
                  disabled={bookMutation.isPending}
                >
                  {bookMutation.isPending ? "Validating & Booking..." : "Confirm Booking"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {modalMode === "reschedule" && activeAppt && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 className="modal-title">Reschedule Appointment</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalMode(null)}>
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setErrorMsg(null);
                rescheduleMutation.mutate({ id: activeAppt.id, data: rescheduleForm });
              }}
            >
              <div className="modal-body">
                {errorMsg && <div className="alert alert-error">{errorMsg}</div>}

                <div className="form-group">
                  <label className="form-label">New Appointment Date</label>
                  <input
                    type="date"
                    className="form-control"
                    min={new Date().toISOString().split("T")[0]}
                    value={rescheduleForm.appointmentDate}
                    onChange={(e) =>
                      setRescheduleForm({ ...rescheduleForm, appointmentDate: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Start Time (HH:mm)</label>
                    <input
                      type="time"
                      className="form-control"
                      value={rescheduleForm.startTime}
                      onChange={(e) =>
                        setRescheduleForm({ ...rescheduleForm, startTime: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time (HH:mm)</label>
                    <input
                      type="time"
                      className="form-control"
                      value={rescheduleForm.endTime}
                      onChange={(e) =>
                        setRescheduleForm({ ...rescheduleForm, endTime: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Reason for Rescheduling</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Patient requested morning slot"
                    value={rescheduleForm.reason}
                    onChange={(e) =>
                      setRescheduleForm({ ...rescheduleForm, reason: e.target.value })
                    }
                    required
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
                  disabled={rescheduleMutation.isPending}
                >
                  {rescheduleMutation.isPending ? "Rescheduling..." : "Reschedule Appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {modalMode === "cancel" && activeAppt && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 className="modal-title">Cancel Appointment</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalMode(null)}>
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setErrorMsg(null);
                cancelMutation.mutate({ id: activeAppt.id, reason: cancelReason });
              }}
            >
              <div className="modal-body">
                {errorMsg && <div className="alert alert-error">{errorMsg}</div>}

                <p style={{ fontSize: 14, color: "#334155", margin: "0 0 16px" }}>
                  Are you sure you want to cancel the appointment for{" "}
                  <strong>
                    {activeAppt.patient.firstName} {activeAppt.patient.lastName}
                  </strong>{" "}
                  with Dr. {activeAppt.doctor.user.firstName} {activeAppt.doctor.user.lastName} on{" "}
                  {new Date(activeAppt.appointmentDate).toLocaleDateString()} at{" "}
                  {activeAppt.startTime}?
                </p>

                <div className="form-group">
                  <label className="form-label">Cancellation Reason (Required)</label>
                  <textarea
                    rows={3}
                    className="form-control"
                    placeholder="Enter reason for appointment cancellation..."
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    required
                  />
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
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={!cancelReason.trim() || cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
