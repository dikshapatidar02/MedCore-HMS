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
  return localStorage.getItem("medcore_token");
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("medcore_token", token);
  } else {
    localStorage.removeItem("medcore_token");
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

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
      } else if (data.error && typeof data.error === "object" && typeof data.error.message === "string") {
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
}
