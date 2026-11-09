"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Shield,
  UserCheck,
  UserX,
  Building2,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function UsersManagementPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const isHospitalAdmin = currentUser?.role === "HOSPITAL_ADMIN";

  // Filter & Pagination State
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Feedback State
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Deactivation confirmation modal state
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string; email: string; willActivate: boolean } | null>(null);
  const [actionReason, setActionReason] = useState("");

  // Build query string
  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", "15");
  if (search.trim()) queryParams.set("search", search.trim());
  if (roleFilter) queryParams.set("role", roleFilter);
  if (statusFilter === "active") queryParams.set("isActive", "true");
  if (statusFilter === "inactive") queryParams.set("isActive", "false");

  // Load Users List
  const { data: usersData, isLoading, isError, error } = useQuery({
    queryKey: ["users-list", page, search, roleFilter, statusFilter],
    queryFn: () =>
      apiRequest<{ items: any[]; total: number; page: number; limit: number; totalPages: number }>(
        `/users?${queryParams.toString()}`
      ),
    enabled: isSuperAdmin || isHospitalAdmin,
  });

  // Toggle Activation Status Mutation
  const statusMutation = useMutation({
    mutationFn: ({ userId, isActive, reason }: { userId: string; isActive: boolean; reason?: string }) =>
      apiRequest(`/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive, reason }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
      setConfirmTarget(null);
      setActionReason("");
      setSuccessMsg(
        variables.isActive
          ? "User account successfully activated. The user can now authenticate."
          : "User account deactivated. Active sessions have been terminated."
      );
      setErrorMsg(null);
      setTimeout(() => setSuccessMsg(null), 5000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to update user status.");
      setSuccessMsg(null);
    },
  });

  const handleOpenConfirm = (u: any, willActivate: boolean) => {
    setConfirmTarget({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
      willActivate,
    });
    setActionReason("");
  };

  const handleExecuteStatusChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmTarget) return;
    statusMutation.mutate({
      userId: confirmTarget.id,
      isActive: confirmTarget.willActivate,
      reason: actionReason.trim() || undefined,
    });
  };

  // Helper: Format role badge
  const formatRole = (role: string) => {
    return role.replace(/_/g, " ");
  };

  if (!isSuperAdmin && !isHospitalAdmin) {
    return (
      <div className="panel" style={{ padding: 48, textAlign: "center" }}>
        <Shield size={48} style={{ color: "var(--danger)", margin: "0 auto 16px auto" }} />
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Access Restricted</h2>
        <p style={{ color: "var(--text-muted)", marginTop: 8 }}>
          User governance and account activation is reserved for Hospital and Platform Administrators.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">User Governance &amp; Activation</h1>
          <div className="page-subtitle">
            {isSuperAdmin
              ? "Platform-wide user management, institutional access, and account status control"
              : "Hospital staff directory, authorization status, and activation management"}
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

      <div className="panel">
        {/* Filters and Controls */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Search Input */}
          <div style={{ position: "relative", minWidth: 260, flex: "1 1 260px" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              className="form-control"
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ paddingLeft: 36 }}
            />
          </div>

          {/* Role Filter */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="form-control"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              style={{ minWidth: 160 }}
            >
              <option value="">All User Roles</option>
              <option value="HOSPITAL_ADMIN">Hospital Admin</option>
              <option value="DOCTOR">Doctor</option>
              <option value="NURSE">Nurse</option>
              <option value="RECEPTIONIST">Receptionist</option>
              <option value="LAB_TECHNICIAN">Lab Technician</option>
              <option value="PHARMACIST">Pharmacist</option>
              <option value="ACCOUNTANT">Accountant</option>
              <option value="PATIENT">Patient</option>
              {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
            </select>

            {/* Status Filter */}
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{ minWidth: 140 }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>User Details</th>
                <th>Assigned Role</th>
                <th>Hospital Tenant</th>
                <th>Account Status</th>
                <th>Registered On</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Loading user directory...</span>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 36, color: "var(--danger)" }}>
                    {(error as any)?.message || "Failed to load users directory."}
                  </td>
                </tr>
              ) : usersData?.items && usersData.items.length > 0 ? (
                usersData.items.map((u: any) => {
                  const isSelf = u.id === currentUser?.id;
                  const isTargetSuper = u.role === "SUPER_ADMIN";
                  const canModify = !isSelf && !(isHospitalAdmin && isTargetSuper);

                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-main)" }}>
                          {u.firstName} {u.lastName}
                          {isSelf && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 4,
                                backgroundColor: "var(--primary-subtle)",
                                color: "var(--primary)",
                                fontWeight: 700,
                              }}
                            >
                              YOU
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                          {u.email}
                        </div>
                        {u.phone && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {u.phone}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="mono-id" style={{ fontSize: 11 }}>
                          {formatRole(u.role)}
                        </span>
                      </td>
                      <td>
                        {u.hospital ? (
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13, color: "var(--text-main)" }}>
                              {u.hospital.name}
                            </div>
                            <span className="mono-id" style={{ fontSize: 11 }}>
                              {u.hospital.code}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Platform-Wide</span>
                        )}
                      </td>
                      <td>
                        {u.isActive ? (
                          <span className="status-badge badge-active">
                            <span className="badge-dot" />
                            <span>ACTIVE</span>
                          </span>
                        ) : (
                          <span className="status-badge badge-inactive">
                            <span className="badge-dot" />
                            <span>INACTIVE</span>
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {new Date(u.createdAt).toLocaleDateString("en-IN", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {canModify ? (
                          u.isActive ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleOpenConfirm(u, false)}
                              disabled={statusMutation.isPending}
                              title="Deactivate account and revoke active sessions"
                              style={{ color: "#d97706" }}
                            >
                              <UserX size={13} style={{ marginRight: 4 }} />
                              <span>Deactivate</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => handleOpenConfirm(u, true)}
                              disabled={statusMutation.isPending}
                              title="Activate user account"
                            >
                              <UserCheck size={13} style={{ marginRight: 4 }} />
                              <span>Activate</span>
                            </button>
                          )
                        ) : (
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text-muted)",
                              fontStyle: "italic",
                            }}
                          >
                            {isSelf ? "Current User" : "Protected"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                      <Users size={36} style={{ color: "var(--text-muted)", opacity: 0.5 }} />
                      <div style={{ fontWeight: 600, color: "var(--text-main)" }}>No Users Found</div>
                      <div style={{ fontSize: 13, maxWidth: 360 }}>
                        No user accounts matched your search and filter criteria.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {usersData && usersData.totalPages > 1 && (
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            <div>
              Showing {((page - 1) * 15) + 1} to {Math.min(page * 15, usersData.total)} of {usersData.total} users
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft size={14} />
                <span>Previous</span>
              </button>
              <span style={{ display: "flex", alignItems: "center", padding: "0 8px", fontWeight: 600 }}>
                {page} / {usersData.totalPages}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setPage((p) => Math.min(usersData.totalPages, p + 1))}
                disabled={page >= usersData.totalPages}
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmTarget && (
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
              maxWidth: 460,
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div className="panel-header">
              <h3 className="panel-title">
                {confirmTarget.willActivate ? "Activate User Account" : "Deactivate User Account"}
              </h3>
            </div>
            <form onSubmit={handleExecuteStatusChange} style={{ padding: 20 }}>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
                {confirmTarget.willActivate ? (
                  <>
                    Are you sure you want to <strong>activate</strong> the account for{" "}
                    <strong>{confirmTarget.name}</strong> ({confirmTarget.email})? The user will immediately be able to log in to MedCore HMS.
                  </>
                ) : (
                  <>
                    Are you sure you want to <strong>deactivate</strong> the account for{" "}
                    <strong>{confirmTarget.name}</strong> ({confirmTarget.email})? This will immediately terminate all active sessions and block further authentication.
                  </>
                )}
              </p>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Reason for Action (Audit Record)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={
                    confirmTarget.willActivate
                      ? "e.g. Identity verified by hospital HR"
                      : "e.g. Employment ended or clinical leave"
                  }
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirmTarget(null)}
                  disabled={statusMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={confirmTarget.willActivate ? "btn btn-primary" : "btn btn-danger"}
                  disabled={statusMutation.isPending}
                >
                  {statusMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : confirmTarget.willActivate ? (
                    "Confirm Activation"
                  ) : (
                    "Confirm Deactivation"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

