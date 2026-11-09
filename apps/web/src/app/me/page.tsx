"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
            e.code === "DOMAIN_NOT_ALLOWED"
              ? "ใช้ได้เฉพาะเมล @dpu.ac.th"
              : e.message;
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
    <main className="account-page mx-auto space-y-6 p-6">
      <header><h1 className="text-2xl sm:text-3xl font-semibold">บัญชีของฉัน</h1><p className="text-gray-600">ข้อมูลบัญชีมหาวิทยาลัยของคุณ</p></header>
      <section className="account-profile" aria-label="ข้อมูลบัญชี">
        <span className="account-avatar" aria-hidden="true">{(me.fullName ?? me.email).trim().slice(0, 1).toUpperCase()}</span>
        <div><h2>{me.fullName ?? me.email}</h2><p className="text-gray-600 break-all">{me.email}</p></div>
      </section>
      <dl className="account-details"><div><dt>บทบาท</dt><dd>{ROLE_LABEL[me.role]}</dd></div>{me.studentId && <div><dt>รหัสนักศึกษา</dt><dd>{me.studentId}</dd></div>}</dl>
      {me.role === "admin" && (
        <Link
          href="/admin"
          className="block w-fit rounded-lg bg-blue-700 px-4 py-2 text-white hover:bg-blue-800"
        >
          ระบบผู้ดูแล
        </Link>
      )}
      {me.role === "student" && (
        <Link href="/leave" className="block text-blue-700 underline">
          ยื่นคำขอลาและดูสถานะ
        </Link>
      )}
      {me.role === "student" && (
        <Link href="/transfers" className="block text-blue-700 underline">
          เทียบโอนรายวิชา
        </Link>
      )}
      {me.role === "teacher" && (
        <Link href="/leave/review" className="block text-blue-700 underline">
          ตรวจคำขอลา
        </Link>
      )}
      {me.role === "teacher" && (
        <Link href="/teacher/transfers" className="block text-blue-700 underline">
          พิจารณาเทียบโอนและหลักสูตร
        </Link>
      )}
      <button onClick={signOut} className="rounded-lg border px-4 py-2">
        ออกจากระบบ
      </button>
    </main>
  );
}
