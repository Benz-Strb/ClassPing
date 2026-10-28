"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import {
  formatSession,
  formatSubmittedAt,
  OCR_STATUS_LABEL,
  STATUS_LABEL,
  type LeaveRequest,
  type LeaveSession,
} from "@/lib/leave";

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export default function LeavePage() {
  const router = useRouter();
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [sessions, setSessions] = useState<LeaveSession[] | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [nextRequests, nextSessions] = await Promise.all([
        apiFetch<LeaveRequest[]>("/leave-requests/mine"),
        apiFetch<LeaveSession[]>("/leave-requests/sessions"),
      ]);
      setRequests(nextRequests);
      setSessions(nextSessions);
    } catch (e) {
      setError(await handleApiError(e, router));
    }
  }

  useEffect(() => {
    Promise.all([
      apiFetch<LeaveRequest[]>("/leave-requests/mine"),
      apiFetch<LeaveSession[]>("/leave-requests/sessions"),
    ])
      .then(([nextRequests, nextSessions]) => {
        setRequests(nextRequests);
        setSessions(nextSessions);
      })
      .catch(async (e: unknown) => setError(await handleApiError(e, router)));
  }, [router]);

  const availableSessions = useMemo(() => {
    const requested = new Set(
      requests?.map((request) => request.sessionId) ?? [],
    );
    return sessions?.filter((session) => !requested.has(session.id)) ?? [];
  }, [requests, sessions]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionId) {
      setError("กรุณาเลือกคาบที่ต้องการลา");
      return;
    }
    if (!evidence) {
      setError("กรุณาแนบหลักฐานการลา");
      return;
    }
    if (evidence.size > MAX_EVIDENCE_BYTES) {
      setError("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 10 MB");
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
      setFileKey((value) => value + 1);
      await load();
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setSaving(false);
    }
  }

  async function openEvidence(id: string) {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setOpening(id);
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
      setOpening(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">ยื่นคำขอลา</h1>
        <p className="mt-1 text-sm text-gray-600">
          เลือกคาบ แนบหลักฐาน และตรวจสถานะได้จากหน้านี้
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

      <form
        onSubmit={submit}
        className="space-y-4 rounded-lg border bg-white p-4"
      >
        <label htmlFor="leave-session" className="block">
          <span className="mb-1 block font-medium">คาบที่ต้องการลา</span>
          <select
            id="leave-session"
            required
            disabled={sessions === null || availableSessions.length === 0}
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            className="w-full rounded-lg border px-3 py-2 disabled:bg-gray-100"
          >
            <option value="">
              {sessions === null
                ? "กำลังโหลดคาบเรียน..."
                : availableSessions.length === 0
                  ? "ไม่มีคาบที่ยื่นลาได้"
                  : "เลือกคาบเรียน"}
            </option>
            {availableSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {formatSession(session)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="leave-reason" className="block">
          <span className="mb-1 block font-medium">เหตุผลการลา</span>
          <textarea
            id="leave-reason"
            required
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-24 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label htmlFor="leave-evidence" className="block">
          <span className="mb-1 block font-medium">หลักฐานการลา</span>
          <input
            key={fileKey}
            id="leave-evidence"
            required
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(event) => setEvidence(event.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <span className="mt-1 block text-sm text-gray-500">
            PDF, JPG หรือ PNG ขนาดไม่เกิน 10 MB
          </span>
        </label>
        <button
          type="submit"
          disabled={saving || availableSessions.length === 0}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {saving ? "กำลังส่ง..." : "ส่งคำขอลา"}
        </button>
      </form>

      <section className="space-y-3" aria-labelledby="my-leave-requests">
        <h2 id="my-leave-requests" className="font-medium">
          คำขอลาของฉัน
        </h2>
        {requests === null ? (
          <p role="status">กำลังโหลด...</p>
        ) : requests.length === 0 ? (
          <p className="rounded-lg border p-4 text-gray-600">ยังไม่มีคำขอลา</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li
                key={request.id}
                className="space-y-2 rounded-lg border bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-medium">
                    {formatSession(request.session)}
                  </h3>
                  <span className="rounded-full border px-2 py-1 text-sm">
                    {STATUS_LABEL[request.status]}
                  </span>
                </div>
                <p>{request.reason}</p>
                <p className="text-sm text-gray-600">
                  OCR: {OCR_STATUS_LABEL[request.ocrStatus]}
                  {request.ocrText ? ` — ${request.ocrText}` : ""}
                </p>
                {request.reviewNote && (
                  <p className="text-sm">
                    หมายเหตุจากอาจารย์: {request.reviewNote}
                  </p>
                )}
                {request.attachments.length > 0 && (
                  <button
                    type="button"
                    disabled={opening === request.id}
                    onClick={() => void openEvidence(request.id)}
                    className="text-sm text-blue-700 underline disabled:opacity-50"
                  >
                    {opening === request.id
                      ? "กำลังเปิด..."
                      : `เปิดหลักฐาน: ${request.attachments[0].fileName}`}
                  </button>
                )}
                <p className="text-sm text-gray-500">
                  ส่งเมื่อ {formatSubmittedAt(request.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
