"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LoginScene } from "./login-scene";

function LoginForm() {
  const urlError = useSearchParams().get("error");
  const [loading, setLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const error = signInError ?? urlError;

  async function signIn() {
    setLoading(true);
    setSignInError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          // ให้ Google แสดงเฉพาะบัญชีมหาลัย (backend ยังตรวจซ้ำอีกชั้น)
          queryParams: { hd: "dpu.ac.th", prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch {
      setSignInError("เข้าสู่ระบบด้วย Google ไม่ได้ ลองใหม่อีกครั้ง");
      setLoading(false);
    }
  }

  return <LoginScene>
    <h2>ยินดีต้อนรับกลับ</h2>
    <p className="signin-description">เข้าสู่ระบบเพื่อจัดการรายวิชา<br />และติดตามการเข้าเรียนของนักศึกษา</p>
    <button type="button" className="signin-google" onClick={signIn} disabled={loading} aria-busy={loading}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22ZM6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59ZM12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z" /></svg>
      <span>{loading ? 'กำลังไปหน้า Google...' : 'เข้าสู่ระบบด้วย Google'}</span>
      {!loading && <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>}
    </button>
    {error && <p role="alert" className="signin-error">{error}</p>}
    <p className="signin-domain">ใช้บัญชีมหาวิทยาลัย <strong>@dpu.ac.th</strong></p>
    <div className="signin-student"><span>สำหรับนักศึกษา</span><p>ดูตารางเรียน เช็คผลเข้าเรียน และยื่นลา<br />ผ่านแอป ClassPing บนมือถือ</p></div>
  </LoginScene>;
}

export default function LoginScreen() {
  return (
    <Suspense fallback={<LoginScene><p role="status">กำลังเตรียมหน้าเข้าสู่ระบบ...</p></LoginScene>}>
      <LoginForm />
    </Suspense>
  );
}
