"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { supabase } from "@/lib/supabase";
import type { Me } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "guest">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setState("guest");
        return;
      }
      try {
        const me = await apiFetch<Me>("/me");
        if (me.role === "teacher" || me.role === "admin") router.replace("/courses");
      } catch (e) {
        setError(await handleApiError(e, router));
      }
    });
  }, [router]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (state === "loading") return <p className="p-6">กำลังโหลด...</p>;

  return (
    <main className="welcome-layout">
        <section className="work-surface welcome-panel">
          <h1>ClassPing</h1>
          <p className="tool-note mt-3 mb-8">ระบบจัดการรายวิชาและการเข้าเรียนด้วยใบหน้า สำหรับผู้ดูแลระบบและอาจารย์</p>
          <Link href="/login" className="welcome-action">เข้าสู่ระบบด้วยบัญชีมหาวิทยาลัย</Link>
        </section>
    </main>
  );
}
