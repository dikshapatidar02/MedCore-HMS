export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = "ApiError";
  }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem("medcore_token");
    if (!token || token === "undefined" || token === "null" || !token.trim()) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token && token !== "undefined" && token !== "null" && token.trim()) {
      localStorage.setItem("medcore_token", token);
    } else {
      localStorage.removeItem("medcore_token");
    }
  } catch {
    // Ignore storage write errors in private mode
  }
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem("medcore_refresh_token");
    if (!token || token === "undefined" || token === "null" || !token.trim()) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function setStoredRefreshToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token && token !== "undefined" && token !== "null" && token.trim()) {
      localStorage.setItem("medcore_refresh_token", token);
    } else {
      localStorage.removeItem("medcore_refresh_token");
    }
  } catch {
    // Ignore storage write errors in private mode
  }
}

export function clearStoredAuth() {
  setStoredToken(null);
  setStoredRefreshToken(null);
}

let activeRefreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  const currentRefreshToken = getStoredRefreshToken();
  if (!currentRefreshToken) {
    clearStoredAuth();
    return null;
  }

  // Single-flight: If a refresh operation is already in flight, await the existing promise
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const url = `${API_BASE}/auth/refresh`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken: currentRefreshToken }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        clearStoredAuth();
        return null;
      }

      const contentType = response.headers.get("content-type");
      let data: any = null;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      }

      const newAccessToken = data?.data?.accessToken || data?.accessToken;
      const newRefreshToken = data?.data?.refreshToken || data?.refreshToken;

      if (!newAccessToken) {
        clearStoredAuth();
        return null;
      }

      // Store refreshed access token
      setStoredToken(newAccessToken);

      // Store rotated refresh token if provided
      if (newRefreshToken) {
        setStoredRefreshToken(newRefreshToken);
      }

      return newAccessToken;
    } catch {
      clearStoredAuth();
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
  _isRetry?: boolean;
  skipAuthRefresh?: boolean;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    timeoutMs = 8000,
    _isRetry = false,
    skipAuthRefresh = false,
    ...fetchOptions
  } = options;

  const token = getStoredToken();
  const headers = new Headers(fetchOptions.headers || {});

  if (!headers.has("Content-Type") && !(fetchOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: fetchOptions.signal || controller.signal,
    });
    clearTimeout(timeoutId);

    // If HTTP 401 received, check if we should attempt a one-time token refresh
    const isAuthEndpoint =
      endpoint.includes("/auth/login") ||
      endpoint.includes("/auth/refresh");

    if (
      response.status === 401 &&
      !_isRetry &&
      !skipAuthRefresh &&
      !isAuthEndpoint
    ) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        // Retry the original request exactly once with the refreshed access token
        const retryHeaders = new Headers(fetchOptions.headers || {});
        retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);
        if (!retryHeaders.has("Content-Type") && !(fetchOptions.body instanceof FormData)) {
          retryHeaders.set("Content-Type", "application/json");
        }
        return apiRequest<T>(endpoint, {
          ...options,
          headers: retryHeaders,
          _isRetry: true,
        });
      } else {
        // Refresh failed: clear auth and notify workspace if in browser
        clearStoredAuth();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("medcore:unauthorized"));
        }
      }
    }

    const contentType = response.headers.get("content-type");
    let data: any = null;

    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      let errorMsg: string | null = null;
      if (data && typeof data === "object") {
        if (typeof data.message === "string") {
          errorMsg = data.message;
        } else if (Array.isArray(data.message)) {
          errorMsg = data.message.join(", ");
        } else if (
          data.error &&
          typeof data.error === "object" &&
          typeof data.error.message === "string"
        ) {
          errorMsg = data.error.message;
        } else if (typeof data.error === "string") {
          errorMsg = data.error;
        }
      }
      if (!errorMsg) {
        errorMsg = `Request failed with status ${response.status}`;
      }
      throw new ApiError(response.status, errorMsg, data);
    }

    return data as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError" || controller.signal.aborted) {
      throw new ApiError(
        408,
        `Connection timed out (${timeoutMs}ms) while communicating with MedCore API (${endpoint}).`
      );
    }
    throw err;
  }
}
