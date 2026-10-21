import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

// เรียก API ของ ClassPing พร้อมแนบ token ของคนที่ login อยู่ (แบบเดียวกับฝั่งเว็บ)
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // FormData ต้องให้ fetch ใส่ boundary เอง
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK', 'ต่อเซิร์ฟเวอร์ไม่ได้ ตรวจว่ามือถืออยู่ Wi-Fi เดียวกับเครื่องที่รัน API');
  }
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? 'เรียกระบบไม่สำเร็จ',
    );
  }
  return body.data as T;
}
