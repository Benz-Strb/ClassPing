"use client";

import { useState } from "react";
import type { AttendanceRow } from "@/lib/types";
import { Photo } from "./photo";

export type ReviewAction =
  | { action: "confirm" }
  | { action: "reject" }
  | { action: "reassign"; toCode: string; backAt?: string };

// เลือกนักศึกษาที่ถูกต้อง รอบนอกห้องใส่เวลากลับได้ด้วย (ถ้าไม่ใส่ backAtFor จะไม่มีช่องเวลา)
export function ReassignForm({
  candidates,
  busy,
  backAtFor,
  onSubmit,
  onCancel,
}: {
  candidates: AttendanceRow[];
  busy: boolean;
  backAtFor?: (hhmm: string) => string;
  onSubmit: (action: ReviewAction) => void;
  onCancel: () => void;
}) {
  const [toCode, setToCode] = useState("");
  const [backTime, setBackTime] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!toCode) return;
        onSubmit({
          action: "reassign",
          toCode,
          ...(backAtFor && backTime ? { backAt: backAtFor(backTime) } : {}),
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <select
        required
        value={toCode}
        onChange={(e) => setToCode(e.target.value)}
        className="rounded-lg border bg-white px-3 py-2"
      >
        <option value="" disabled>
          เลือกนักศึกษา
        </option>
        {candidates.map((c) => (
          <option key={c.studentCode} value={c.studentCode}>
            {c.studentCode} {c.fullName ?? ""}
          </option>
        ))}
      </select>
      {backAtFor && (
        <label className="flex items-center gap-1 text-sm text-gray-600">
          เวลากลับ
          <input
            type="time"
            value={backTime}
            onChange={(e) => setBackTime(e.target.value)}
            className="rounded-lg border bg-white px-2 py-2 text-base text-gray-900"
          />
        </label>
      )}
      <button
        disabled={busy || !toCode}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        บันทึก
      </button>
      <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2">
        ยกเลิก
      </button>
    </form>
  );
}

// รายการที่ระบบไม่แน่ใจ อาจารย์ดูรูปแล้วเลือกว่าใช่คนที่ระบบเดาไหม
export function ReviewCard({
  imageUrl,
  code,
  name,
  spoof = false,
  detail,
  rejectLabel,
  rejectMessage,
  candidates,
  busy,
  backAtFor,
  onReview,
}: {
  imageUrl: string | null;
  code: string;
  name: string | null;
  spoof?: boolean;
  detail: string;
  rejectLabel: string;
  rejectMessage: string;
  candidates: AttendanceRow[];
  busy: boolean;
  backAtFor?: (hhmm: string) => string;
  onReview: (action: ReviewAction) => void;
}) {
  const [choosing, setChoosing] = useState(false);

  function reject() {
    if (!window.confirm(rejectMessage)) return;
    onReview({ action: "reject" });
  }

  return (
    <div className="flex flex-wrap gap-4 rounded-lg border p-4">
      {imageUrl ? <Photo src={imageUrl} size="h-32 w-32" /> : <div className="h-32 w-32" />}
      <div className="flex-1 space-y-2">
        <p>
          ระบบคิดว่าเป็น <span className="font-mono">{code}</span> {name ?? ""}
        </p>
        {spoof && <p className="text-sm font-medium text-yellow-700">สงสัยว่าเป็นรูปหรือจอ</p>}
        <p className="text-sm text-gray-600">{detail}</p>

        {choosing ? (
          <ReassignForm
            candidates={candidates}
            busy={busy}
            backAtFor={backAtFor}
            onSubmit={onReview}
            onCancel={() => setChoosing(false)}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => onReview({ action: "confirm" })}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            >
              ใช่
            </button>
            <button
              disabled={busy || candidates.length === 0}
              onClick={() => setChoosing(true)}
              className="rounded-lg border px-4 py-2 disabled:opacity-50"
            >
              เปลี่ยนคน
            </button>
            <button
              disabled={busy}
              onClick={reject}
              className="rounded-lg border px-4 py-2 text-red-600 disabled:opacity-50"
            >
              {rejectLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
