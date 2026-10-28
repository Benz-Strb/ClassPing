"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import {
  formatSession,
  formatSubmittedAt,
  OCR_STATUS_LABEL,
  STATUS_LABEL,
  type LeaveRequest,
} from "@/lib/leave";

export default function LeaveReviewPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
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
    apiFetch<LeaveRequest[]>("/leave-requests/review")
      .then(setRequests)
      .catch(async (e: unknown) => setError(await handleApiError(e, router)));
  }, [router]);

  async function review(id: string, decision: "approved" | "rejected") {
    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/leave-requests/${id}/review`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          reviewNote: notes[id]?.trim() || undefined,
        }),
      });
      await load();
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setBusy(null);
    }
  }

  async function openEvidence(id: string) {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy(id);
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/leave-requests/${id}/evidence`,
      );
      if (tab) tab.location.replace(url);
      else window.location.assign(url);
    } catch (e) {
      tab?.close();
      setError(await handleApiError(e, router));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">ตรวจคำขอลา</h1>
        <p className="mt-1 text-sm text-gray-600">
          ตรวจข้อมูลคาบ ข้อความ OCR และหลักฐานก่อนตัดสินใจ
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700"
        >
          {error}
        </p>
      )}
      {requests === null ? (
        <p role="status">กำลังโหลด...</p>
      ) : requests.length === 0 ? (
        <p className="rounded-lg border p-4 text-gray-600">ไม่มีคำขอลา</p>
      ) : (
        <ul className="space-y-4">
          {requests.map((request) => (
            <li
              key={request.id}
              className="space-y-3 rounded-lg border bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-medium">
                    {formatSession(request.session)}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {request.student.fullName || "ไม่พบชื่อ"}
                    {request.student.studentId
                      ? ` · ${request.student.studentId}`
                      : ""}
                  </p>
                </div>
                <span className="rounded-full border px-2 py-1 text-sm">
                  {STATUS_LABEL[request.status]}
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <p>
                  <strong>เหตุผล:</strong> {request.reason}
                </p>
                <p>
                  <strong>OCR:</strong> {OCR_STATUS_LABEL[request.ocrStatus]}
                </p>
                {request.ocrText && (
                  <p className="whitespace-pre-wrap text-gray-700">
                    {request.ocrText}
                  </p>
                )}
                <p className="text-gray-500">
                  ส่งเมื่อ {formatSubmittedAt(request.createdAt)}
                </p>
              </div>
              {request.attachments.length > 0 && (
                <button
                  type="button"
                  disabled={busy === request.id}
                  onClick={() => void openEvidence(request.id)}
                  className="text-sm text-blue-700 underline disabled:opacity-50"
                >
                  เปิดหลักฐาน: {request.attachments[0].fileName}
                </button>
              )}
              {request.status === "pending" ? (
                <div className="space-y-3 border-t pt-3">
                  <label
                    htmlFor={`review-note-${request.id}`}
                    className="block"
                  >
                    <span className="mb-1 block text-sm font-medium">
                      หมายเหตุถึงนักศึกษา (ถ้ามี)
                    </span>
                    <textarea
                      id={`review-note-${request.id}`}
                      maxLength={1000}
                      value={notes[request.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      className="min-h-20 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === request.id}
                      onClick={() => void review(request.id, "approved")}
                      className="rounded-lg bg-green-700 px-3 py-2 text-white disabled:opacity-50"
                    >
                      {busy === request.id ? "กำลังบันทึก..." : "อนุมัติ"}
                    </button>
                    <button
                      type="button"
                      disabled={busy === request.id}
                      onClick={() => void review(request.id, "rejected")}
                      className="rounded-lg bg-red-700 px-3 py-2 text-white disabled:opacity-50"
                    >
                      ปฏิเสธ
                    </button>
                  </div>
                </div>
              ) : (
                request.reviewNote && (
                  <p className="text-sm">
                    หมายเหตุที่บันทึก: {request.reviewNote}
                  </p>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
