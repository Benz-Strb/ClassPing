import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabase } from './supabase-server';
import type { Me } from './types';

export const getWebUser = cache(async (): Promise<Me | null> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  // API ตรวจ token กับ Supabase และตรวจ Google identity/บทบาทอีกครั้ง
  const response = await fetch(`${process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/me`, {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null);
  if (response.status === 401) return null;
  if (response.status === 403) redirect(`/login?error=${encodeURIComponent(body?.error?.message ?? 'บัญชีนี้ไม่มีสิทธิ์ใช้งานเว็บไซต์')}`);
  if (!response.ok || !body?.data) throw new Error('ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองใหม่');
  const user = body.data as Me;
  if (user.role !== 'admin' && user.role !== 'teacher') {
    redirect(`/login?error=${encodeURIComponent('เว็บไซต์สำหรับผู้ดูแลระบบและอาจารย์เท่านั้น นักศึกษากรุณาใช้งานผ่านแอป ClassPing')}`);
  }
  return user;
});

export async function requireWebUser() {
  const user = await getWebUser();
  if (!user) redirect('/login');
  return user;
}
