"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Me } from "@/lib/types";

export default function DocumentsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Me>("/me").then(setMe).catch(async (value: unknown) => {
      setError(await handleApiError(value, router));
    });
  }, [router]);

  if (error) return <p className="p-6 text-red-700" role="alert">{error}</p>;
  if (!me) return <p className="p-6" role="status">กำลังโหลดเอกสาร...</p>;

  return (
    <main className="mx-auto space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">เอกสาร</h1>
        <p className="tool-note">จัดการคำขอลาและการเทียบโอนรายวิชา</p>
      </header>
      <section className="work-surface" aria-label="ประเภทเอกสาร">
        <Link href={me.role === "admin" ? "/admin/leave-statuses" : "/leave/review"} className="tool-link">
          <span>การลา<small className="tool-note block mt-1">{me.role === "admin" ? "ติดตามสถานะการพิจารณาคำขอลา" : "ตรวจเอกสารและพิจารณาคำขอลา"}</small></span>
          <span aria-hidden="true">&rsaquo;</span>
        </Link>
        <Link href="/documents/transfers" className="tool-link">
          <span>การเทียบโอนรายวิชา<small className="tool-note block mt-1">อ่านหลักสูตรด้วย OCR จับคู่รายวิชา และพิจารณาคำขอของนักศึกษา</small></span>
          <span aria-hidden="true">&rsaquo;</span>
        </Link>
      </section>
    </main>
  );
}
