import Constants from 'expo-constants';
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

// ปกติเรียก API ผ่าน Metro (/api) ที่โหลดแอปมา ใช้ได้ทั้งในวง Wi-Fi และผ่าน tunnel
// ตั้ง EXPO_PUBLIC_API_URL เมื่ออยากชี้ไปที่อื่น
function apiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri;
  if (!host) return 'http://localhost:3001';
  // ผ่าน tunnel จะไม่มีพอร์ตและเป็น https
  return `${host.includes(':') ? 'http' : 'https'}://${host}/api`;
}

const API_URL = apiUrl();
const TIMEOUT_MS = 20_000;

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

  // เน็ตค้างกลางทางจะได้ไม่รอไปตลอด
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError(0, 'NETWORK', 'ต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง');
  } finally {
    clearTimeout(timer);
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
