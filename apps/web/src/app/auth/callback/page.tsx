"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
      router.replace(`/login?error=${encodeURIComponent(failed ?? "เข้าสู่ระบบไม่สำเร็จ")}`);
      return;
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      router.replace(
        error ? `/login?error=${encodeURIComponent(error.message)}` : "/",
      );
    });
  }, [params, router]);

  return <p className="p-6">กำลังเข้าสู่ระบบ...</p>;
}

export default function CallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
