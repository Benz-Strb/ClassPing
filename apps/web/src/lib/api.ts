import { supabase } from "./supabase";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// เรียก API ของ ClassPing พร้อมแนบ token ของคนที่ login อยู่
// สำเร็จคืนค่าใน data, ไม่สำเร็จ throw ApiError ที่มี code ให้เช็กต่อ
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? "เรียกระบบไม่สำเร็จ",
    );
  }
  return body.data as T;
}
