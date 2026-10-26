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

export default function LeaveReviewPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      setRequests(await apiFetch<LeaveRequest[]>("/leave-requests/review"));
    } catch (e) {
      setError(await handleApiError(e, router));
    }
  }

  useEffect(() => {
    void load();
  }, [router]);

  async function review(id: string, decision: "approved" | "rejected") {
    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/leave-requests/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      await load();
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setBusy(null);
    }
  }

  async function openEvidence(id: string) {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(`/leave-requests/${id}/evidence`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(await handleApiError(e, router));
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">ตรวจคำขอลา</h1>
      {error && <p className="text-red-600">{error}</p>}
      {requests === null ? (
        <p>กำลังโหลด...</p>
      ) : requests.length === 0 ? (
        <p className="text-gray-600">ไม่มีคำขอลา</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id} className="space-y-2 rounded-lg border p-4">
              <p>คาบ: {request.sessionId}</p>
              <p>เหตุผล: {request.reason}</p>
              <p>สถานะ: {request.status}</p>
              <p className="text-sm text-gray-600">
                หลักฐาน: {request.attachments.map((file) => file.fileName).join(", ") || "ไม่มี"}
              </p>
              {request.attachments.length > 0 && (
                <button
                  type="button"
                  onClick={() => void openEvidence(request.id)}
                  className="text-blue-600 underline"
                >
                  เปิดหลักฐาน
                </button>
              )}
              {request.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy === request.id}
                    onClick={() => void review(request.id, "approved")}
                    className="rounded-lg bg-green-600 px-3 py-2 text-white disabled:opacity-50"
                  >
                    อนุมัติ
                  </button>
                  <button
                    type="button"
                    disabled={busy === request.id}
                    onClick={() => void review(request.id, "rejected")}
                    className="rounded-lg bg-red-600 px-3 py-2 text-white disabled:opacity-50"
                  >
                    ปฏิเสธ
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
