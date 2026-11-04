"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { STATUS_LABEL, formatSubmittedAt } from "@/lib/leave";

interface LeaveStatus {
  id: string;
  status: keyof typeof STATUS_LABEL;
  createdAt: string;
  reviewedAt: string | null;
}

export default function LeaveStatusesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<LeaveStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<LeaveStatus[]>("/leave-requests/statuses").then(setRows)
      .catch(async (value: unknown) => setError(await handleApiError(value, router)));
  }, [router]);

  return <section className="space-y-4" aria-labelledby="leave-statuses-title">
    <h2 id="leave-statuses-title" className="text-xl font-semibold">สถานะการลา</h2>
    <p className="text-sm text-gray-600">สถานะคำขอล่าสุดไม่เกิน 100 รายการ</p>
    {error ? <p role="alert" className="text-red-700">{error}</p>
      : rows === null ? <p role="status">กำลังโหลด...</p>
      : rows.length === 0 ? <p>ยังไม่มีคำขอลา</p>
      : <ul className="space-y-3">{rows.map((row) => <li key={row.id} className="space-y-1 rounded-lg border p-4">
        <p className="break-all text-sm">คำขอ {row.id}</p>
        <p className="font-medium">{STATUS_LABEL[row.status]}</p>
        <p className="text-sm text-gray-600">ส่งเมื่อ {formatSubmittedAt(row.createdAt)}</p>
        {row.reviewedAt && <p className="text-sm text-gray-600">พิจารณาเมื่อ {formatSubmittedAt(row.reviewedAt)}</p>}
      </li>)}</ul>}
  </section>;
}
