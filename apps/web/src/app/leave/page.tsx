"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";

type LeaveRequest = {
  id: string;
  sessionId: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: string;
  attachments: { fileName: string; mime: string; size: number }[];
};

const STATUS_LABEL = {
  pending: "รอตรวจ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
};

export default function LeavePage() {
  const router = useRouter();
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRequests(await apiFetch<LeaveRequest[]>("/leave-requests/mine"));
    } catch (e) {
      setError(await handleApiError(e, router));
    }
  }

  useEffect(() => {
    void load();
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!evidence) {
      setError("กรุณาแนบหลักฐานการลา");
      return;
    }
    setSaving(true);
    setError(null);
    const body = new FormData();
    body.set("sessionId", sessionId);
    body.set("reason", reason);
    body.set("evidence", evidence);
    try {
      await apiFetch("/leave-requests", { method: "POST", body });
      setSessionId("");
      setReason("");
      setEvidence(null);
      await load();
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">ยื่นคำขอลา</h1>
      {error && <p className="text-red-600">{error}</p>}

      <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
        <label className="block">
          <span className="mb-1 block">Session ID</span>
          <input
            required
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block">เหตุผลการลา</span>
          <textarea
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-24 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block">หลักฐานการลา</span>
          <input
            required
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(event) => setEvidence(event.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "กำลังส่ง..." : "ส่งคำขอลา"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="font-medium">คำขอลาของฉัน</h2>
        {requests === null ? (
          <p>กำลังโหลด...</p>
        ) : requests.length === 0 ? (
          <p className="text-gray-600">ยังไม่มีคำขอลา</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {requests.map((request) => (
              <li key={request.id} className="space-y-1 p-4">
                <p>
                  <strong>{STATUS_LABEL[request.status]}</strong> · คาบ {request.sessionId}
                </p>
                <p>{request.reason}</p>
                {request.reviewNote && <p className="text-gray-600">หมายเหตุ: {request.reviewNote}</p>}
                <p className="text-sm text-gray-500">
                  ส่งเมื่อ {new Date(request.createdAt).toLocaleString("th-TH")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
