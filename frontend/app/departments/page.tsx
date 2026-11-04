"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import { Layers, Plus, Search, Edit2, Trash2, CheckCircle2, AlertCircle, X } from "lucide-react";

export default function DepartmentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "SUPER_ADMIN" || user?.role === "HOSPITAL_ADMIN";

  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [activeDept, setActiveDept] = useState<any>(null);
  const [deptForm, setDeptForm] = useState({ code: "", name: "", description: "" });
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: deptData, isLoading } = useQuery({
    queryKey: ["departments", search],
    queryFn: () =>
      apiRequest<{ items: any[]; total: number }>(
        `/departments?search=${encodeURIComponent(search)}&limit=50`
      ),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof deptForm) =>
      apiRequest("/departments", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setSuccessMsg("Department created successfully.");
      setModalMode(null);
      setDeptForm({ code: "", name: "", description: "" });
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof deptForm> }) =>
      apiRequest(`/departments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setSuccessMsg("Department updated successfully.");
      setModalMode(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/departments/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setSuccessMsg("Department deleted successfully.");
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const handleOpenCreate = () => {
    setActiveDept(null);
    setDeptForm({ code: "", name: "", description: "" });
    setErrorMsg(null);
    setModalMode("create");
  };

  const handleOpenEdit = (dept: any) => {
    setActiveDept(dept);
    setDeptForm({
      code: dept.code,
      name: dept.name,
      description: dept.description || "",
    });
    setErrorMsg(null);
    setModalMode("edit");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (modalMode === "create") {
      createMutation.mutate(deptForm);
    } else if (modalMode === "edit" && activeDept) {
      updateMutation.mutate({ id: activeDept.id, data: deptForm });
    }
  };

  const handleDelete = (dept: any) => {
    if (dept._count?.doctors > 0) {
      alert(`Cannot delete department: ${dept._count.doctors} doctor(s) are assigned to it.`);
      return;
    }
    if (confirm(`Are you sure you want to delete department '${dept.name}'?`)) {
      deleteMutation.mutate(dept.id);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Department Management</h1>
          <div className="page-subtitle">
            Configure clinical wings, specialty departments, and doctor assignments
          </div>
        </div>

        {canManage && (
          <button className="btn btn-primary" onClick={handleOpenCreate}>
            <Plus size={16} />
            <span>Create Department</span>
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
            <div style={{ position: "relative" }}>
              <input
                type="text"
                className="search-input"
                placeholder="Search departments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            Total: {deptData?.total ?? 0}
          </span>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Department Name</th>
                <th>Description</th>
                <th>Doctors</th>
                <th>Rooms</th>
                {canManage && <th style={{ textAlign: "right" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 30 }}>
                    Loading departments...
                  </td>
                </tr>
              ) : deptData?.items && deptData.items.length > 0 ? (
                deptData.items.map((d: any) => (
                  <tr key={d.id}>
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 12,
                          background: "#e0f2fe",
                          color: "#0369a1",
                          padding: "3px 8px",
                          borderRadius: 4,
                        }}
                      >
                        {d.code}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{d.name}</div>
                    </td>
                    <td style={{ color: "#64748b", maxWidth: 360 }}>
                      {d.description || "—"}
                    </td>
                    <td>
                      <span className="badge-active" style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>
                        {d._count?.doctors ?? 0} doctors
                      </span>
                    </td>
                    <td>{d._count?.rooms ?? 0}</td>
                    {canManage && (
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenEdit(d)}
                            title="Edit Department"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: "#ef4444" }}
                            onClick={() => handleDelete(d)}
                            title="Delete Department"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 30 }}>
                    No departments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog */}
      {modalMode && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 className="modal-title">
                {modalMode === "create" ? "Create New Department" : "Edit Department"}
              </h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setModalMode(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {errorMsg && <div className="alert alert-error">{errorMsg}</div>}

                <div className="form-group">
                  <label className="form-label">Department Code (e.g. CARD, NEUR)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={deptForm.code}
                    onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Department Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={deptForm.name}
                    onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description / Scope of Practice</label>
                  <textarea
                    rows={3}
                    className="form-control"
                    value={deptForm.description}
                    onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
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
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {modalMode === "create" ? "Create Department" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
