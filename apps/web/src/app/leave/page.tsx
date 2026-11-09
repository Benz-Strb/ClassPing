"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RetryButton } from "@/components/retry-button";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { LeaveAccess } from "@/components/leave-access";
import {
  formatSession,
  formatSubmittedAt,
  EMPTY_DOCUMENT_DETAILS,
  DOCUMENT_FIELDS,
  type DocumentDetails,
  type LeaveDraft,
  OCR_STATUS_LABEL,
  STATUS_LABEL,
  type LeaveRequest,
  type LeaveSession,
} from "@/lib/leave";

const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

export default function LeavePage() {
  return <LeaveAccess role="student"><StudentLeavePage /></LeaveAccess>;
}

function StudentLeavePage() {
  const router = useRouter();
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [sessions, setSessions] = useState<LeaveSession[] | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [reason, setReason] = useState("");
  const [documentDetails, setDocumentDetails] = useState<DocumentDetails>({ ...EMPTY_DOCUMENT_DETAILS });
  const [evidence, setEvidence] = useState<File | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const photosInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [ocrText, setOcrText] = useState<string | null>(null);
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
    // คำขอที่ถูกปฏิเสธยื่นคาบเดิมใหม่ได้
    const requested = new Set(
      requests
        ?.filter((request) => request.status !== "rejected")
        .map((request) => request.sessionId) ?? [],
    );
    return sessions?.filter((session) => !requested.has(session.id)) ?? [];
  }, [requests, sessions]);

  async function autoReadEvidence(targetSessionId: string, file: File) {
    if (file.size > MAX_EVIDENCE_BYTES) {
      setError("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 25 MB");
      return;
    }
    setReading(true);
    setError(null);
    const body = new FormData();
    body.set("sessionId", targetSessionId);
    body.set("evidence", file);
    try {
      const draft = await apiFetch<LeaveDraft>(
        "/leave-requests/preview",
        { method: "POST", body },
      );
      setOcrText(draft.text);
      setReason(current => current.trim() ? current : draft.reason);
      setDocumentDetails(current => Object.fromEntries(
        DOCUMENT_FIELDS.map(([key]) => [key, current[key] || draft.documentDetails[key] || '']),
      ) as unknown as DocumentDetails);
    } catch (e) {
      setError(
        `${await handleApiError(e, router)} — สามารถกรอกเหตุผลและส่งให้อาจารย์ตรวจเองได้`,
      );
    } finally {
      setReading(false);
    }
  }

  async function readEvidence() {
    if (!sessionId || !evidence) {
      setError("กรุณาเลือกคาบและแนบหลักฐานก่อนอ่านร่าง");
      return;
    }
    await autoReadEvidence(sessionId, evidence);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || reading) return;
    if (!sessionId) {
      setError("กรุณาเลือกคาบที่ต้องการลา");
      return;
    }
    if (!evidence) {
      setError("กรุณาแนบหลักฐานการลา");
      return;
    }
    if (evidence.size > MAX_EVIDENCE_BYTES) {
      setError("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 25 MB");
      return;
    }
    setSaving(true);
    setError(null);
    const body = new FormData();
    body.set("sessionId", sessionId);
    body.set("reason", reason);
    body.set("documentDetails", JSON.stringify(documentDetails));
    body.set("evidence", evidence);
    try {
      await apiFetch("/leave-requests", { method: "POST", body });
      setSessionId("");
      setReason("");
      setDocumentDetails({ ...EMPTY_DOCUMENT_DETAILS });
      setEvidence(null);
      setOcrText(null);

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
        <h1 className="text-2xl sm:text-3xl font-semibold">ยื่นคำขอลา</h1>
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
        <fieldset disabled={saving || reading} className="space-y-4">
          <label htmlFor="leave-session" className="block">
            <span className="mb-1 block font-medium">คาบที่ต้องการลา</span>
            <select
              id="leave-session"
              required
              disabled={sessions === null || availableSessions.length === 0}
              value={sessionId}
              onChange={(event) => {
                const nextSessionId = event.target.value;
                setSessionId(nextSessionId);
                if (nextSessionId && evidence && !reason.trim() && !reading) {
                  void autoReadEvidence(nextSessionId, evidence);
                }
              }}
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
          <fieldset className="space-y-3" disabled={saving || reading}>
            <legend className="font-medium">ข้อมูลร่างจากหลักฐาน</legend>
            <p className="text-sm text-gray-600">ตรวจแก้ก่อนส่ง ช่องที่อ่านไม่พบเว้นว่างได้ วันที่เหล่านี้ไม่เปลี่ยนคาบเรียนที่เลือก</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {DOCUMENT_FIELDS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block">{label}</span>
                  <input type={key === 'facility' ? 'text' : 'date'}
                    maxLength={key === 'facility' ? 200 : undefined}
                    value={documentDetails[key]}
                    onChange={event => setDocumentDetails(current => ({ ...current, [key]: event.target.value }))}
                    className="w-full min-w-0 rounded-lg border px-3 py-2" />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={saving || reading} className="space-y-2">
            <legend className="mb-1 font-medium">หลักฐานการลา</legend>
            <select
              aria-label="เลือกวิธีแนบหลักฐาน"
              value=""
              onChange={(event) => {
                const inputs: Record<string, typeof cameraInput> = { camera: cameraInput, photos: photosInput, files: fileInput };
                const input = inputs[event.target.value];
                input?.current?.click();
              }}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="" disabled>เลือกวิธีแนบหลักฐาน</option>
              <option value="camera">ถ่ายรูป</option>
              <option value="photos">เลือกจากคลังภาพ</option>
              <option value="files">เลือกไฟล์ PDF / รูปภาพ</option>
            </select>
            {([
              [cameraInput, "image/jpeg,image/png", "environment"],
              [photosInput, "image/jpeg,image/png", undefined],
              [fileInput, "application/pdf,image/jpeg,image/png", undefined],
            ] as const).map(([ref, accept, capture], index) => (
              <input key={index} ref={ref} type="file" accept={accept} capture={capture} hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
                    setError("กรุณาเลือกไฟล์ PDF, JPG หรือ PNG");
                    return;
                  }
                  if (file.size > MAX_EVIDENCE_BYTES) {
                    setError("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 25 MB");
                    return;
                  }
                  setEvidence(file);
                  setDocumentDetails({ ...EMPTY_DOCUMENT_DETAILS });
                  setError(null);
                  setOcrText(null);
                  if (sessionId) void autoReadEvidence(sessionId, file);
                }} />
            ))}
            {evidence && <p role="status" className="break-all text-sm">ไฟล์ที่เลือก: {evidence.name}</p>}
            <p className="text-sm text-gray-500">PDF, JPG หรือ PNG ขนาดไม่เกิน 25 MB · แนบได้ครั้งละ 1 ไฟล์</p>
            <p className="text-sm text-gray-500">การถ่ายรูปขึ้นอยู่กับอุปกรณ์และเบราว์เซอร์ที่ใช้</p>
          </fieldset>
          <button
            type="button"
            onClick={() => void readEvidence()}
            disabled={!evidence || !sessionId}
            className="rounded-lg border px-4 py-2 disabled:opacity-50"
          >
            {reading ? "กำลังอ่านหลักฐาน..." : "อ่านหลักฐานช่วยกรอกเหตุผล"}
          </button>
          {ocrText !== null && (
            <div role="status" className="space-y-2 rounded-lg bg-blue-50 p-3">
              <details>
                <summary className="cursor-pointer">ดูข้อความต้นฉบับที่ OCR อ่านได้</summary>
                <p className="whitespace-pre-wrap">{ocrText || "ไม่พบข้อความ กรุณากรอกข้อมูลเอง"}</p>
              </details>
              <p>
                ตรวจและแก้เหตุผลด้านบนก่อนส่ง หากกรอกไว้แล้วระบบจะไม่เขียนทับ
              </p>
            </div>
          )}
          <p className="text-sm text-gray-600">
            OCR เป็นข้อมูลร่าง ไม่รับรองความแท้ของหลักฐาน
            การอ่านร่างยังไม่ส่งคำขอลา
          </p>
          <button
            type="submit"
            disabled={saving || availableSessions.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {saving ? "กำลังส่ง..." : "ส่งคำขอลา"}
          </button>
        </fieldset>
      </form>

      <section className="space-y-3" aria-labelledby="my-leave-requests">
        <h2 id="my-leave-requests" className="font-medium">
          คำขอลาของฉัน
        </h2>
        {requests === null ? (
          error ? <RetryButton /> : <p role="status">กำลังโหลด...</p>
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
                {DOCUMENT_FIELDS.map(([key, label]) => request.documentDetails?.[key] ? (
                  <p key={key} className="text-sm">{label}: {request.documentDetails[key]}</p>
                ) : null)}
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
