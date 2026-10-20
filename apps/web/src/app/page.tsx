"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { supabase } from "@/lib/supabase";
import type { Me } from "@/lib/types";

// login แล้ว: อาจารย์/แอดมินไปหน้าวิชา นักศึกษาใช้แอปมือถือ
export default function Home() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "guest" | "student">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setState("guest");
        return;
      }
      try {
        const me = await apiFetch<Me>("/me");
        if (me.role === "student") setState("student");
        else router.replace("/courses");
      } catch (e) {
        setError(await handleApiError(e, router));
      }
    });
  }, [router]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (state === "loading") return <p className="p-6">กำลังโหลด...</p>;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      {state === "student" ? (
        <>
          <p>นักศึกษาใช้แอป ClassPing บนมือถือเพื่อลงทะเบียนใบหน้าและดูการเข้าเรียน</p>
          <Link href="/me" className="text-blue-600 underline">
            ดูบัญชีของฉัน
          </Link>
        </>
      ) : (
        <Link href="/login" className="rounded-lg bg-blue-600 px-4 py-2 text-white">
          เข้าสู่ระบบ ClassPing
        </Link>
      )}
    </main>
  );
}
