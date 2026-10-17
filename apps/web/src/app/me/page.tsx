"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: "student" | "teacher" | "admin";
  studentId: string | null;
}

const ROLE_LABEL: Record<Me["role"], string> = {
  student: "นักศึกษา",
  teacher: "อาจารย์",
  admin: "ผู้ดูแลระบบ",
};

export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Me>("/me")
      .then(setMe)
      .catch(async (e: unknown) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          await supabase.auth.signOut();
          const message =
            e.code === "DOMAIN_NOT_ALLOWED" ? "ใช้ได้เฉพาะเมล @dpu.ac.th" : e.message;
          router.replace(`/login?error=${encodeURIComponent(message)}`);
          return;
        }
        setError(e instanceof Error ? e.message : "เรียกระบบไม่สำเร็จ");
      });
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!me) return <p className="p-6">กำลังโหลด...</p>;

  return (
    <main className="mx-auto max-w-md space-y-3 p-6">
      <h1 className="text-xl font-semibold">{me.fullName ?? me.email}</h1>
      <p>{me.email}</p>
      <p>บทบาท: {ROLE_LABEL[me.role]}</p>
      {me.studentId && <p>รหัสนักศึกษา: {me.studentId}</p>}
      <button onClick={signOut} className="rounded-lg border px-4 py-2">
        ออกจากระบบ
      </button>
    </main>
  );
}
