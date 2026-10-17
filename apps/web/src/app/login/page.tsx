"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function LoginForm() {
  const error = useSearchParams().get("error");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // ให้ Google แสดงเฉพาะบัญชีมหาลัย (backend ยังตรวจซ้ำอีกชั้น)
        queryParams: { hd: "dpu.ac.th", prompt: "select_account" },
      },
    });
    if (error) setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl border p-6">
        <h1 className="text-xl font-semibold">ClassPing</h1>
        <p className="text-sm text-gray-600">เข้าสู่ระบบด้วยเมลมหาวิทยาลัย (@dpu.ac.th)</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
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
