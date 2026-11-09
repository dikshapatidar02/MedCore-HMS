"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import {
  Building2,
  Save,
  CheckCircle2,
  Shield,
  AlertCircle,
  Clock,
  XCircle,
  UserCheck,
  Check,
  Loader2,
} from "lucide-react";

export default function HospitalsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  // Tab state for Super Admin: "all" | "pending"
  const [activeTab, setActiveTab] = useState<"all" | "pending">("all");

  // Rejection modal state
  const [rejectingHospitalId, setRejectingHospitalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Super Admin: Load all hospitals
  const { data: hospitalsData, isLoading: loadingAll } = useQuery({
    queryKey: ["hospitals-all"],
    queryFn: () => apiRequest<{ items: any[]; total: number }>("/hospitals"),
    enabled: isSuperAdmin,
  });

  // Super Admin: Load pending registration requests
  const { data: pendingData, isLoading: loadingPending } = useQuery({
    queryKey: ["hospitals-pending"],
    queryFn: () => apiRequest<any[]>("/hospitals/pending-registrations"),
    enabled: isSuperAdmin,
  });

  // Hospital Admin: Load own hospital
  const { data: myHospital, isLoading: loadingMy } = useQuery({
    queryKey: ["my-hospital"],
    queryFn: () => apiRequest<any>("/hospitals/my-hospital"),
    enabled: !isSuperAdmin && !!user?.hospitalId,
  });

  // Profile Form state for Hospital Admin
  const [formData, setFormData] = useState({
    name: "",
    tagline: "",
    phone: "",
    website: "",
    street: "",
    city: "",
    state: "",
    postalCode: "",
  });

  const [formInitialized, setFormInitialized] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize form once hospital data is loaded
  if (myHospital && !formInitialized) {
    setFormData({
      name: myHospital.name || "",
      tagline: myHospital.tagline || "",
      phone: myHospital.phone || "",
      website: myHospital.website || "",
      street: myHospital.address?.street || "",
      city: myHospital.address?.city || "",
      state: myHospital.address?.state || "",
      postalCode: myHospital.address?.postalCode || "",
    });
    setFormInitialized(true);
  }

  // Mutation: Update own hospital profile
  const updateMutation = useMutation({
    mutationFn: (payload: any) =>
      apiRequest("/hospitals/my-hospital", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-hospital"] });
      setSuccessMsg("Hospital profile successfully updated.");
      setErrorMsg(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to update hospital profile.");
      setSuccessMsg(null);
    },
  });

  // Mutation: Approve hospital registration
  const approveMutation = useMutation({
    mutationFn: (hospitalId: string) =>
      apiRequest(`/hospitals/${hospitalId}/approve`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospitals-pending"] });
      queryClient.invalidateQueries({ queryKey: ["hospitals-all"] });
      setSuccessMsg("Hospital registration approved and administrator account activated successfully.");
      setErrorMsg(null);
      setTimeout(() => setSuccessMsg(null), 5000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to approve hospital registration.");
      setSuccessMsg(null);
    },
  });

  // Mutation: Reject hospital registration
  const rejectMutation = useMutation({
    mutationFn: ({ hospitalId, reason }: { hospitalId: string; reason: string }) =>
      apiRequest(`/hospitals/${hospitalId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospitals-pending"] });
      queryClient.invalidateQueries({ queryKey: ["hospitals-all"] });
      setRejectingHospitalId(null);
      setRejectReason("");
      setSuccessMsg("Hospital registration request has been rejected.");
      setErrorMsg(null);
      setTimeout(() => setSuccessMsg(null), 5000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to reject hospital registration.");
      setSuccessMsg(null);
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    updateMutation.mutate({
      name: formData.name,
      tagline: formData.tagline,
      phone: formData.phone,
      website: formData.website,
      address: {
        street: formData.street,
        city: formData.city,
        state: formData.state,
        postalCode: formData.postalCode,
      },
    });
  };

  const handleApprove = (hospitalId: string, hospitalName: string) => {
    if (window.confirm(`Approve registration for "${hospitalName}"?\nThis will activate the hospital tenant and its administrator account.`)) {
      approveMutation.mutate(hospitalId);
    }
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingHospitalId) return;
    rejectMutation.mutate({
      hospitalId: rejectingHospitalId,
      reason: rejectReason.trim() || "Registration declined by platform administrator",
    });
  };

  const pendingCount = pendingData?.length ?? 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hospital Management</h1>
          <div className="page-subtitle">
            {isSuperAdmin
              ? "Global Super Admin Directory & Tenant Governance"
              : "Hospital Profile & Institutional Settings"}
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="alert alert-success" style={{ marginBottom: 20 }}>
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="alert alert-error" style={{ marginBottom: 20 }}>
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {isSuperAdmin ? (
        <div>
          {/* Super Admin Navigation Tabs */}
          <div className="tab-list" style={{ marginBottom: 20 }}>
            <button
              type="button"
              className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All Hospitals ({hospitalsData?.total ?? 0})
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}
              onClick={() => setActiveTab("pending")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span>Pending Approvals</span>
              {pendingCount > 0 && (
                <span
                  style={{
                    backgroundColor: "#f59e0b",
                    color: "#ffffff",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "1px 7px",
                    borderRadius: 10,
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: ALL HOSPITALS */}
          {activeTab === "all" && (
            <div className="panel">
              <div className="panel-header">
                <h3 className="panel-title">All Onboarded Hospital Tenants</h3>
                <span style={{ fontSize: 13, color: "#64748b" }}>
                  Total: {hospitalsData?.total ?? 0}
                </span>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Hospital Name &amp; Code</th>
                      <th>Contact Email</th>
                      <th>Phone</th>
                      <th>Location</th>
                      <th>Status</th>
                      <th>Counts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingAll ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: 36, color: "var(--text-muted)" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                            <span className="spinner" style={{ width: 16, height: 16 }} />
                            <span>Loading hospital directory...</span>
                          </div>
                        </td>
                      </tr>
                    ) : hospitalsData?.items && hospitalsData.items.length > 0 ? (
                      hospitalsData.items.map((h: any) => (
                        <tr key={h.id}>
                          <td>
                            <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{h.name}</div>
                            <div style={{ marginTop: 2 }}>
                              <span className="mono-id">{h.code}</span>
                            </div>
                          </td>
                          <td style={{ color: "var(--text-secondary)" }}>{h.email}</td>
                          <td style={{ color: "var(--text-secondary)" }}>{h.phone}</td>
                          <td>
                            {h.address ? `${h.address.city}, ${h.address.state}` : "No address registered"}
                          </td>
                          <td>
                            <span className={`status-badge badge-${h.status.toLowerCase()}`}>
                              <span className="badge-dot" />
                              <span>{h.status}</span>
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              <strong>{h._count?.departments ?? 0}</strong> depts &middot;{" "}
                              <strong>{h._count?.doctors ?? 0}</strong> doctors
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: 36, color: "var(--text-muted)" }}>
                          No hospitals found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: PENDING APPROVALS */}
          {activeTab === "pending" && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">Pending Hospital Registration Requests</h3>
                  <div className="panel-subtitle">
                    Review and authorize new hospital tenant onboarding submissions
                  </div>
                </div>
                <span
                  style={{
                    backgroundColor: pendingCount > 0 ? "#fef3c7" : "#f1f5f9",
                    color: pendingCount > 0 ? "#b45309" : "#64748b",
                    padding: "4px 10px",
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {pendingCount} Pending Review
                </span>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Hospital Organization</th>
                      <th>Initial Administrator</th>
                      <th>Contact Info</th>
                      <th>Requested Date</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingPending ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: 36, color: "var(--text-muted)" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                            <span className="spinner" style={{ width: 16, height: 16 }} />
                            <span>Loading pending registrations...</span>
                          </div>
                        </td>
                      </tr>
                    ) : pendingData && pendingData.length > 0 ? (
                      pendingData.map((h: any) => {
                        const adminUser = h.users?.find((u: any) => u.role === "HOSPITAL_ADMIN") || h.users?.[0];
                        return (
                          <tr key={h.id}>
                            <td>
                              <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{h.name}</div>
                              <div style={{ marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
                                <span className="mono-id">{h.code}</span>
                                <span className="status-badge badge-onboarding">
                                  <Clock size={11} style={{ marginRight: 3 }} />
                                  <span>ONBOARDING</span>
                                </span>
                              </div>
                            </td>
                            <td>
                              {adminUser ? (
                                <div>
                                  <div style={{ fontWeight: 600, color: "var(--text-main)" }}>
                                    {adminUser.firstName} {adminUser.lastName}
                                  </div>
                                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                    {adminUser.email}
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>None registered</span>
                              )}
                            </td>
                            <td>
                              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{h.email}</div>
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{h.phone}</div>
                            </td>
                            <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {new Date(h.createdAt).toLocaleDateString("en-IN", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end" }}>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  onClick={() => handleApprove(h.id, h.name)}
                                  disabled={approveMutation.isPending || rejectMutation.isPending}
                                  title="Authorize hospital and activate administrator"
                                >
                                  {approveMutation.isPending ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <Check size={13} style={{ marginRight: 4 }} />
                                  )}
                                  <span>Approve</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  onClick={() => setRejectingHospitalId(h.id)}
                                  disabled={approveMutation.isPending || rejectMutation.isPending}
                                  title="Reject registration request"
                                >
                                  <XCircle size={13} style={{ marginRight: 4 }} />
                                  <span>Reject</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                            <Shield size={36} style={{ color: "#10b981", opacity: 0.8 }} />
                            <div style={{ fontWeight: 600, color: "var(--text-main)" }}>
                              No Pending Registration Requests
                            </div>
                            <div style={{ fontSize: 13, maxWidth: 360 }}>
                              All hospital onboarding submissions have been reviewed. New hospital registrations will appear here for authorization.
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rejection Reason Modal */}
          {rejectingHospitalId && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(15, 23, 42, 0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: 16,
              }}
            >
              <div
                className="panel"
                style={{
                  maxWidth: 480,
                  width: "100%",
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                }}
              >
                <div className="panel-header">
                  <h3 className="panel-title">Reject Hospital Registration</h3>
                </div>
                <form onSubmit={handleConfirmReject} style={{ padding: 20 }}>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                    Are you sure you want to reject this hospital registration? The hospital status will be set to INACTIVE and its registered users will remain disabled.
                  </p>
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label className="form-label">Rejection Reason (Audit Trail)</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      placeholder="e.g. Incomplete hospital licensing documentation provided"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setRejectingHospitalId(null);
                        setRejectReason("");
                      }}
                      disabled={rejectMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-danger"
                      disabled={rejectMutation.isPending}
                    >
                      {rejectMutation.isPending ? "Rejecting..." : "Confirm Rejection"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ maxWidth: 800 }}>
          <div className="panel">
            <div className="panel-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Building2 size={20} style={{ color: "var(--primary)" }} />
                <h3 className="panel-title">Hospital Profile &amp; Settings</h3>
              </div>
              <span className={`status-badge badge-${myHospital?.status?.toLowerCase() || "active"}`}>
                {myHospital?.status || "ACTIVE"}
              </span>
            </div>

            <div style={{ padding: 24 }}>
              {loadingMy ? (
                <div>Loading hospital profile...</div>
              ) : (
                <form onSubmit={handleProfileSubmit}>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Hospital Code (Locked)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={myHospital?.code || ""}
                        disabled
                        style={{ backgroundColor: "#f1f5f9", cursor: "not-allowed" }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Institutional Status</label>
                      <input
                        type="text"
                        className="form-control"
                        value={myHospital?.status || "ACTIVE"}
                        disabled
                        style={{ backgroundColor: "#f1f5f9", cursor: "not-allowed" }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Hospital Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Tagline / Mission Statement</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.tagline}
                      onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                    />
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Official Phone</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Public Website</label>
                      <input
                        type="url"
                        className="form-control"
                        value={formData.website}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      />
                    </div>
                  </div>

                  <h4 style={{ margin: "24px 0 16px 0", fontSize: 14, fontWeight: 700, color: "var(--text-secondary)" }}>
                    Physical Address
                  </h4>

                  <div className="form-group">
                    <label className="form-label">Street Address</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.street}
                      onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    />
                  </div>

                  <div className="form-grid-3">
                    <div className="form-group">
                      <label className="form-label">City</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">State / Province</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Postal Code</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.postalCode}
                        onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={updateMutation.isPending}
                    >
                      <Save size={16} style={{ marginRight: 6 }} />
                      <span>{updateMutation.isPending ? "Saving Changes..." : "Save Hospital Profile"}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
