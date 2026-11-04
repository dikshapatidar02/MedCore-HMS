"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import { Building2, Save, CheckCircle2, Shield, AlertCircle } from "lucide-react";

export default function HospitalsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  // For Super Admin: load all hospitals
  const { data: hospitalsData, isLoading: loadingAll } = useQuery({
    queryKey: ["hospitals-all"],
    queryFn: () => apiRequest<{ items: any[]; total: number }>("/hospitals"),
    enabled: isSuperAdmin,
  });

  // For Hospital Admin: load own hospital
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

      {isSuperAdmin ? (
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
                  <th>Hospital Name & Code</th>
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
                    <td colSpan={6} style={{ textAlign: "center", padding: 30 }}>
                      Loading hospital directory...
                    </td>
                  </tr>
                ) : hospitalsData?.items && hospitalsData.items.length > 0 ? (
                  hospitalsData.items.map((h: any) => (
                    <tr key={h.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{h.name}</div>
                        <div style={{ fontSize: 11, color: "#0284c7" }}>CODE: {h.code}</div>
                      </td>
                      <td>{h.email}</td>
                      <td>{h.phone}</td>
                      <td>
                        {h.address ? `${h.address.city}, ${h.address.state}` : "No address registered"}
                      </td>
                      <td>
                        <span className={`status-badge badge-${h.status.toLowerCase()}`}>
                          {h.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>
                          {h._count?.departments ?? 0} depts &middot; {h._count?.doctors ?? 0} doctors
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 30 }}>
                      No hospitals found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 800 }}>
          <div className="panel">
            <div className="panel-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Building2 size={20} style={{ color: "var(--primary)" }} />
                <h3 className="panel-title">Hospital Profile & Settings</h3>
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
                      <label className="form-label">Hospital Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Tagline / Mission</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.tagline}
                      onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                    />
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Contact Phone</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Website</label>
                      <input
                        type="url"
                        className="form-control"
                        value={formData.website}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      />
                    </div>
                  </div>

                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: "24px 0 12px", color: "#334155" }}>
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
                      <label className="form-label">State</label>
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

                  <div style={{ marginTop: 20 }}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={updateMutation.isPending}
                    >
                      <Save size={16} />
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
