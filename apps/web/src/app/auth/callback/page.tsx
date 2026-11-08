"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const RETRY_MESSAGE = "เข้าสู่ระบบไม่สำเร็จ กรุณากดเข้าสู่ระบบอีกครั้ง";

function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  // code ใช้แลกได้ครั้งเดียว ตอน dev React รัน effect สองรอบ (Strict Mode)
  // ถ้าแลกซ้ำ รอบสองจะ error แล้วพาไปหน้า login ทั้งที่ login สำเร็จแล้ว
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = params.get("code");
    const failed = params.get("error_description") ?? params.get("error");

    if (failed || !code) {
      router.replace(`/login?error=${encodeURIComponent(RETRY_MESSAGE)}`);
      return;
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      router.replace(
        error ? `/login?error=${encodeURIComponent(RETRY_MESSAGE)}` : "/",
      );
    });
  }, [params, router]);

  return <main className="login-layout"><section className="login-panel space-y-3"><h1>กำลังเข้าสู่ระบบ</h1><p role="status">กำลังตรวจสอบบัญชีมหาวิทยาลัย...</p></section></main>;
}

export default function CallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
