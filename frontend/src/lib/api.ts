"use client";

import { supabaseBrowser } from "./supabase/client";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const API_BASE = RAW_BASE.replace(/\/+$/, "");
export const API_URL = `${API_BASE}/api/v1`;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** The account is authenticated but has no firm attached yet. */
  get needsFirm() {
    return this.status === 409 && /firm/i.test(this.message);
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip the Authorization header (public portal / marketing endpoints). */
  anonymous?: boolean;
}

async function accessToken(): Promise<string | null> {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, anonymous, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);

  if (!anonymous) {
    const token = await accessToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    finalHeaders.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: payload,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      0,
      "Could not reach the API. Check NEXT_PUBLIC_API_URL and that the Space is awake.",
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, extractDetail(parsed, response.status));
  }

  return parsed as T;
}

function extractDetail(parsed: unknown, status: number): string {
  if (typeof parsed === "string" && parsed) return parsed;

  if (parsed && typeof parsed === "object" && "detail" in parsed) {
    const detail = (parsed as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    // FastAPI validation errors arrive as a list of {loc, msg}
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            const field = Array.isArray((item as { loc?: unknown[] }).loc)
              ? String((item as { loc: unknown[] }).loc.at(-1))
              : null;
            const message = String((item as { msg: unknown }).msg);
            return field ? `${field}: ${message}` : message;
          }
          return String(item);
        })
        .join("; ");
    }
  }

  if (status === 401) return "Your session expired. Please sign in again.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "That record no longer exists.";
  return `Request failed (${status}).`;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });
export const patch = <T,>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body });
export const del = <T,>(path: string) => api<T>(path, { method: "DELETE" });

/** Portal endpoints are intentionally unauthenticated. */
export const publicGet = <T,>(path: string) => api<T>(path, { anonymous: true });
export const publicPost = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body, anonymous: true });

export function queryString(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}
