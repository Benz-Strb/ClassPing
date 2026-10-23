"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { formatDate, formatTime } from "@/lib/time";
import type { AttendanceRow, AttendanceStatus, SessionAttendance } from "@/lib/types";
import { Photo } from "./photo";
import { ReviewCard, type ReviewAction } from "./review-card";

const POLL_MS = 5000;

const STATUS_LABEL: Record<AttendanceStatus, { label: string; className: string }> = {
  present: { label: "มา", className: "bg-green-100 text-green-800" },
  late: { label: "สาย", className: "bg-yellow-100 text-yellow-800" },
  absent: { label: "ขาด", className: "bg-red-100 text-red-700" },
  leave: { label: "ลา", className: "bg-blue-100 text-blue-800" },
  pending: { label: "รอตรวจ", className: "bg-orange-100 text-orange-800" },
};

const EDITABLE = ["present", "late", "absent"] as const;

export function CheckinView() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SessionAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/sessions/${sessionId}/attendance`;

  const load = useCallback(
    () =>
      apiFetch<SessionAttendance>(base)
        .then((next) => {
          setData(next);
          return next;
        })
        .catch(async (e: unknown) => {
          setError(await handleApiError(e, router));
          return null;
        }),
    [base, router],
  );

  // ดึงใหม่เรื่อย ๆ เฉพาะตอนคาบกำลังเรียน แท็บที่ซ่อนอยู่ข้ามรอบนั้นไป
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      let live = true;
      if (document.visibilityState === "visible") {
        const next = await load();
        live = !next || next.session.status === "live";
      }
      if (!stopped && live) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [load]);

  async function send(path: string, method: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      setData(await apiFetch<SessionAttendance>(path, { method, body: JSON.stringify(body) }));
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setBusy(false);
    }
  }

  function review(code: string, action: ReviewAction) {
    return send(`${base}/${code}/review`, "POST", action);
  }

  function setStatus(code: string, status: string) {
    return send(`${base}/${code}`, "PATCH", { status });
  }

  if (!data) return error ? <p className="text-red-600">{error}</p> : <p>กำลังโหลด...</p>;

  const { session, rows, unknown } = data;
  const pending = rows.filter((r) => r.status === "pending");
  const unseen = rows.filter((r) => r.status === null);
  const count = (status: AttendanceStatus) => rows.filter((r) => r.status === status).length;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <Link href={`/courses/${id}/checkin`} className="text-sm text-blue-600 underline">
          คาบทั้งหมด
        </Link>
        <h2 className="font-medium">
          {formatDate(session.onDate)} {formatTime(session.startsAt)}-{formatTime(session.endsAt)}{" "}
          · {session.roomName}
          {session.status === "live" && (
            <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
              กำลังเรียน
            </span>
          )}
        </h2>
        <p className="text-sm text-gray-600">
          มา {count("present")} · สาย {count("late")} · ขาด {count("absent")} · ลา {count("leave")}{" "}
          · รอตรวจ {pending.length} · ยังไม่เห็น {unseen.length}
        </p>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium">รอตรวจ</h3>
          <p className="text-sm text-gray-600">ระบบไม่แน่ใจว่าเป็นคนนี้ ดูรูปแล้วเลือก</p>
          {pending.map((row) => (
            <ReviewCard
              key={row.studentCode}
              row={row}
              candidates={unseen}
              busy={busy}
              onReview={(action) => review(row.studentCode, action)}
            />
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2">รูป</th>
              <th className="px-4 py-2">นักศึกษา</th>
              <th className="px-4 py-2">เห็นตอน</th>
              <th className="px-4 py-2">สถานะ</th>
              <th className="px-4 py-2">แก้</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <StudentRow
                key={row.studentCode}
                row={row}
                busy={busy}
                onChange={(status) => setStatus(row.studentCode, status)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {unknown.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">หน้าที่ไม่ตรงกับใครในวิชา</h3>
          <p className="text-sm text-gray-600">เก็บไว้ 7 วันแล้วลบเอง</p>
          <div className="flex flex-wrap gap-2">
            {unknown.map((face) => (
              <figure key={face.imageUrl} className="text-center text-xs text-gray-500">
                <Photo src={face.imageUrl} size="h-20 w-20" />
                <figcaption>{formatTime(face.seenAt)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StudentRow({
  row,
  busy,
  onChange,
}: {
  row: AttendanceRow;
  busy: boolean;
  onChange: (status: string) => void;
}) {
  const editable = EDITABLE.find((s) => s === row.status);
  return (
    <tr>
      <td className="px-4 py-2">
        {row.imageUrl ? <Photo src={row.imageUrl} size="h-12 w-12" /> : <div className="h-12 w-12" />}
      </td>
      <td className="px-4 py-2">
        <div className="font-mono">{row.studentCode}</div>
        <div className="text-gray-600">{row.fullName ?? "-"}</div>
        {!row.faceEnrolled && <div className="text-xs text-yellow-700">ยังไม่ลงทะเบียนหน้า</div>}
      </td>
      <td className="px-4 py-2">{row.firstSeenAt ? formatTime(row.firstSeenAt) : "-"}</td>
      <td className="px-4 py-2">
        {row.status ? (
          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_LABEL[row.status].className}`}>
            {STATUS_LABEL[row.status].label}
          </span>
        ) : (
          <span className="text-gray-500">ยังไม่เห็น</span>
        )}
        {row.updatedBy && <div className="text-xs text-gray-500">แก้โดย {row.updatedBy}</div>}
      </td>
      <td className="px-4 py-2">
        {row.status !== "pending" && (
          <select
            disabled={busy}
            value={editable ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-lg border bg-white px-2 py-1"
          >
            <option value="" disabled>
              เลือก
            </option>
            {EDITABLE.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status].label}
              </option>
            ))}
          </select>
        )}
      </td>
    </tr>
  );
}
