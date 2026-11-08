"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  apiRequest,
  setStoredToken,
  getStoredToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearStoredAuth,
} from "./api";

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
  hospital?: { id: string; name: string; code: string; status: string };
}

interface AuthContextValue {
  user: UserSession | null;
  loading: boolean;
  initError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retryAuth: () => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchProfile = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setInitError(null);

    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setInitError(null);
      setLoading(false);
      isFetchingRef.current = false;
      return;
    }

    try {
      // 5-second timeout for quick initialization and graceful error handling
      const res = await apiRequest<any>("/auth/me", { timeoutMs: 5000 });
      const userData = res?.data || res?.user || res;
      if (userData && userData.id && userData.role) {
        setUser(userData);
        setInitError(null);
      } else {
        clearStoredAuth();
        setUser(null);
        setInitError(null);
      }
    } catch (err: any) {
      console.warn("MedCore session verification error:", err);
      // If 401 or 403, the stored credentials are stale/expired - clear and show login
      if (err?.status === 401 || err?.status === 403) {
        clearStoredAuth();
        setUser(null);
        setInitError(null);
      } else {
        // Network timeout, backend down, or server error
        setInitError(
          err?.message ||
            "Unable to connect to the MedCore authentication service. Please verify that the backend is running."
        );
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Safety timeout: Guarantee that the loading screen releases after at most 5.5s
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setLoading((prevLoading) => {
          if (prevLoading) {
            console.warn("Safety timer: Auth initialization exceeded 5.5s, forcing release.");
            setInitError(
              (prev) =>
                prev ||
                "Connection to MedCore API timed out during workspace initialization. Click Retry or Continue to Sign In."
            );
            return false;
          }
          return false;
        });
      }
    }, 5500);

    fetchProfile().finally(() => {
      clearTimeout(safetyTimer);
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, [fetchProfile]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearStoredAuth();
      setUser(null);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("medcore:unauthorized", handleUnauthorized);
      return () => {
        window.removeEventListener("medcore:unauthorized", handleUnauthorized);
      };
    }
  }, []);

  const login = async (email: string, password: string) => {
    setInitError(null);
    const res = await apiRequest<any>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      timeoutMs: 10000,
      skipAuthRefresh: true,
    });
    const token = res?.data?.accessToken || res?.accessToken;
    const refreshToken = res?.data?.refreshToken || res?.refreshToken;
    const userSession = res?.data?.user || res?.user;
    if (!token || !userSession) {
      throw new Error("Authentication response was missing user or token credentials.");
    }
    setStoredToken(token);
    if (refreshToken) {
      setStoredRefreshToken(refreshToken);
    }
    setUser(userSession);
  };

  const logout = async () => {
    try {
      const refreshToken = getStoredRefreshToken();
      await apiRequest("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: refreshToken || "" }),
        timeoutMs: 3000,
        skipAuthRefresh: true,
      });
    } catch {
      // Ignore logout errors
    } finally {
      clearStoredAuth();
      setUser(null);
      setInitError(null);
    }
  };

  const retryAuth = () => {
    isFetchingRef.current = false;
    fetchProfile();
  };

  const clearAuth = () => {
    clearStoredAuth();
    setUser(null);
    setInitError(null);
    setLoading(false);
    isFetchingRef.current = false;
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, initError, login, logout, retryAuth, clearAuth }}
    >
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
