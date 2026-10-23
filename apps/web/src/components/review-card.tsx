"use client";

import { useState } from "react";
import { formatTime } from "@/lib/time";
import type { AttendanceRow } from "@/lib/types";
import { Photo } from "./photo";

export type ReviewAction =
  | { action: "confirm" }
  | { action: "reject" }
  | { action: "reassign"; toCode: string };

// รายการที่ระบบไม่แน่ใจ อาจารย์ดูรูปแล้วเลือกว่าใช่คนที่ระบบเดาไหม
export function ReviewCard({
  row,
  candidates,
  busy,
  onReview,
}: {
  row: AttendanceRow;
  candidates: AttendanceRow[];
  busy: boolean;
  onReview: (action: ReviewAction) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const [toCode, setToCode] = useState("");

  function reject() {
    if (!window.confirm(`ไม่ใช่นักศึกษาวิชานี้ใช่ไหม รูปนี้จะไม่ถูกนับเป็นของ ${row.studentCode}`)) {
      return;
    }
    onReview({ action: "reject" });
  }

  return (
    <div className="flex flex-wrap gap-4 rounded-lg border p-4">
      {row.imageUrl ? <Photo src={row.imageUrl} size="h-32 w-32" /> : <div className="h-32 w-32" />}
      <div className="flex-1 space-y-2">
        <p>
          ระบบคิดว่าเป็น <span className="font-mono">{row.studentCode}</span>{" "}
          {row.fullName ?? ""}
        </p>
        <p className="text-sm text-gray-600">
          เห็นตอน {row.firstSeenAt ? formatTime(row.firstSeenAt) : "-"}
          {row.confidence !== null && ` · ความเหมือน ${Math.round(row.confidence * 100)}%`}
        </p>

        {choosing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (toCode) onReview({ action: "reassign", toCode });
            }}
            className="flex flex-wrap gap-2"
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
            <button
              disabled={busy || !toCode}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            >
              บันทึก
            </button>
            <button
              type="button"
              onClick={() => setChoosing(false)}
              className="rounded-lg border px-4 py-2"
            >
              ยกเลิก
            </button>
          </form>
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
              ไม่ใช่นักศึกษาวิชานี้
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
