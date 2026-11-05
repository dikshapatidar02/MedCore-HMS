"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiRequest, setStoredToken, getStoredToken } from "./api";

export interface UserSession {
  id: string;
  email: string;
  role: string;
  hospitalId: string | null;
  firstName: string;
  lastName: string;
  phone?: string;
  doctorProfile?: { id: string; specialization: string; departmentId: string };
  patientProfile?: { id: string; mrn: string };
}

interface AuthContextValue {
  user: UserSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await apiRequest<any>("/auth/me");
      const userData = res?.data || res?.user || res;
      if (userData && userData.id && userData.role) {
        setUser(userData);
      } else {
        setStoredToken(null);
        setUser(null);
      }
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest<any>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const token = res?.data?.accessToken || res?.accessToken;
    const userSession = res?.data?.user || res?.user;
    if (!token || !userSession) {
      throw new Error("Authentication response was missing user or token credentials.");
    }
    setStoredToken(token);
    setUser(userSession);
  };

  const logout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout errors
    } finally {
      setStoredToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
