"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function LoginForm() {
  const error = useSearchParams().get("error");
  const [loading, setLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setSignInError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // ให้ Google แสดงเฉพาะบัญชีมหาลัย (backend ยังตรวจซ้ำอีกชั้น)
        queryParams: { hd: "dpu.ac.th", prompt: "select_account" },
      },
    });
    if (error) { setSignInError(error.message); setLoading(false); }
  }

  return (
    <main className="login-layout">
      <div className="login-panel space-y-6">
        <div className="login-brand">ClassPing</div>
        <div className="space-y-2"><h1 className="text-3xl font-semibold">เข้าสู่ระบบ</h1><p className="text-gray-600">จัดการรายวิชาและติดตามการเข้าเรียน</p></div>
        <p className="text-sm text-gray-600">เข้าสู่ระบบด้วยเมลมหาวิทยาลัย (@dpu.ac.th)</p>
        {(signInError || error) && <p role="alert" className="surface-feedback text-sm text-red-600">{signInError || error}</p>}
        <button
          onClick={signIn}
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "กำลังไปหน้า Google..." : "เข้าสู่ระบบด้วย Google"}
        </button>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
