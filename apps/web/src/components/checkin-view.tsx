"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { bangkokTimeToIso, formatDate, formatTime } from "@/lib/time";
import type { AttendanceRow, AttendanceStatus, SessionAttendance } from "@/lib/types";
import { Photo } from "./photo";
import { ReassignForm, ReviewCard, type ReviewAction } from "./review-card";
import { TripChip } from "./trip-chip";
import { TripDialog, type TripResult } from "./trip-dialog";
import { ExamBadge } from "./exam-badge";

const POLL_MS = 5000;
// คาบจบแล้วไม่ดึงถี่ แต่ดึงเป็นระยะให้ URL รูปไม่หมดอายุ (อายุ 10 นาที)
const IDLE_POLL_MS = 4 * 60 * 1000;
// รูปโหลดไม่ได้ (URL หมดอายุ) ดึงใหม่ได้อย่างมากทุก 30 วินาที
const IMAGE_RELOAD_MS = 30_000;

const STATUS_LABEL: Record<AttendanceStatus, { label: string; className: string }> = {
  present: { label: "มา", className: "bg-green-100 text-green-800" },
  late: { label: "สาย", className: "bg-yellow-100 text-yellow-800" },
  absent: { label: "ขาด", className: "bg-red-100 text-red-700" },
  leave: { label: "ลา", className: "bg-blue-100 text-blue-800" },
  pending: { label: "รอตรวจ", className: "bg-orange-100 text-orange-800" },
};

const EDITABLE = ["present", "late", "absent"] as const;

const OUT_LABEL = {
  out_now: { text: (n: number) => `ออกอยู่ ${n} นาที`, className: "bg-gray-100 text-gray-700" },
  out: { text: (n: number) => `ออก ${n} นาที`, className: "bg-gray-100 text-gray-700" },
  gone: { text: (n: number) => `หาย ${n} นาที`, className: "bg-red-100 text-red-700" },
  gone_no_return: { text: () => "หาย · ไม่กลับ", className: "bg-red-100 text-red-700" },
};

export function CheckinView() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SessionAttendance | null>(null);
  // error จากการกดแก้ กับ error จากการดึงข้อมูลเป็นรอบ แยกกันเพื่อให้รอบที่สำเร็จล้างได้เฉพาะอย่างหลัง
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // นับตอนเริ่มและตอนจบการกดแก้ ผลจากรอบดึงข้อมูลที่เริ่มก่อนการแก้เสร็จจะไม่ถูกใช้
  const edits = useRef(0);
  // 403 คือไม่มีสิทธิ์ดูคาบนี้ ลองใหม่ก็ไม่หาย
  const forbidden = useRef(false);
  const lastImageReload = useRef(0);
  const [openTrip, setOpenTrip] = useState<{ code: string; tripId: string } | null>(null);
  const base = `/sessions/${sessionId}/attendance`;

  const load = useCallback(() => {
    const startedAt = edits.current;
    return apiFetch<SessionAttendance>(base)
      .then((next) => {
        if (edits.current === startedAt) {
          setData(next);
          setPollError(null);
        }
        return next;
      })
      .catch(async (e: unknown) => {
        if (e instanceof ApiError && e.status === 403) forbidden.current = true;
        setPollError(await handleApiError(e, router));
        return null;
      });
  }, [base, router]);

  // ดึงใหม่เรื่อย ๆ จนคาบจบ (กล้องเริ่มก่อนเวลาคาบ) แท็บที่ซ่อนอยู่ข้ามรอบนั้นไป
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      let ended = false;
      if (document.visibilityState === "visible") {
        const next = await load();
        ended = next?.session.status === "ended";
      }
      if (!stopped && !forbidden.current) timer = setTimeout(tick, ended ? IDLE_POLL_MS : POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [load]);

  // คืนข้อความ error ให้ผู้เรียกเลือกที่แสดงเอง (ออกจากระบบแล้ว error เป็น null)
  async function run(path: string, method: string, body?: unknown): Promise<TripResult> {
    edits.current += 1;
    setBusy(true);
    let result: TripResult;
    // 409 (NOT_PENDING, PENDING_REVIEW) คือข้อมูลบนจอเก่า แสดงข้อความแล้วดึงใหม่
    let stale = false;
    try {
      const init = body === undefined ? { method } : { method, body: JSON.stringify(body) };
      setData(await apiFetch<SessionAttendance>(path, init));
      result = { ok: true, error: null };
    } catch (e) {
      stale = e instanceof ApiError && e.status === 409;
      result = { ok: false, error: await handleApiError(e, router) };
    }
    edits.current += 1;
    setBusy(false);
    if (stale) void load();
    return result;
  }

  // รูปโหลดไม่ได้มักเพราะ URL หมดอายุ (เปิดหน้าทิ้งไว้) ดึงข้อมูลใหม่ให้ได้ URL ใหม่
  function reloadOnImageError() {
    const now = Date.now();
    if (now - lastImageReload.current < IMAGE_RELOAD_MS) return;
    lastImageReload.current = now;
    void load();
  }

  async function send(path: string, method: string, body?: unknown) {
    setError(null);
    const result = await run(path, method, body);
    if (!result.ok) setError(result.error);
  }

  const tripBase = `/sessions/${sessionId}/trips`;

  function reviewTrip(tripId: string, action: ReviewAction) {
    return send(`${tripBase}/${tripId}/review`, "POST", action);
  }

  function reviewTripResult(tripId: string, action: ReviewAction) {
    return run(`${tripBase}/${tripId}/review`, "POST", action);
  }

  function review(code: string, action: ReviewAction) {
    return send(`${base}/${code}/review`, "POST", action);
  }

  function setStatus(code: string, status: string) {
    return send(`${base}/${code}`, "PATCH", { status });
  }

  if (!data) {
    const message = error ?? pollError;
    return message ? <p className="text-red-600">{message}</p> : <p>กำลังโหลด...</p>;
  }

  const { session, rows, unknown, tripReviews, unknownTrips } = data;
  const pending = rows.filter((r) => r.status === "pending");
  const unseen = rows.filter((r) => r.status === null);
  const absentByTime = rows.filter((r) => r.absentByTime).length;
  const backAtFor = (hhmm: string) =>
    bangkokTimeToIso(session.onDate, hhmm, session.startsAt, session.endsAt);
  const selected = openTrip
    ? rows
        .find((r) => r.studentCode === openTrip.code)
        ?.outOfRoom.trips.find((t) => t.id === openTrip.tripId)
    : undefined;
  const selectedRow = openTrip ? rows.find((r) => r.studentCode === openTrip.code) : undefined;
  const count = (status: AttendanceStatus) => rows.filter((r) => r.status === status).length;

  return (
    <section className="space-y-6" onErrorCapture={reloadOnImageError}>
      <div className="space-y-1">
        <Link href={`/courses/${id}/checkin`} className="text-sm text-blue-600 underline">
          คาบทั้งหมด
        </Link>
        <h2 className="font-medium">
          {formatDate(session.onDate)} {formatTime(session.startsAt)}-{formatTime(session.endsAt)} ·{" "}
          {session.roomName}
          {session.kind === "exam" && (
            <span className="ml-2">
              <ExamBadge title={session.title} />
            </span>
          )}
          {!session.cancelled && session.status === "live" && (
            <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
              กำลังเรียน
            </span>
          )}
          {!session.cancelled && session.status === "upcoming" && (
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
              ยังไม่เริ่ม
            </span>
          )}
        </h2>
        <p className="text-sm text-gray-600">
          มา {count("present")} · สาย {count("late")} · ขาด {count("absent") + absentByTime} · ลา{" "}
          {count("leave")} · รอตรวจ {pending.length + tripReviews.length} · ยังไม่เห็น{" "}
          {unseen.length - absentByTime}
        </p>
        {session.cancelled ? (
          <p className="text-sm text-red-700">คาบนี้ถูกลบแล้ว รายงานไม่นับคาบนี้</p>
        ) : (
          session.status === "ended" &&
          !session.recorded && (
            <p className="text-sm text-yellow-700">
              คาบนี้ไม่มีข้อมูลจากกล้อง รายงานจึงยังไม่นับคาบนี้
            </p>
          )
        )}
      </div>

      {(error ?? pollError) && <p className="text-red-600">{error ?? pollError}</p>}

      {(pending.length > 0 || tripReviews.length > 0) && (
        <div className="space-y-3">
          <h3 className="font-medium">รอตรวจ</h3>
          <p className="text-sm text-gray-600">ระบบไม่แน่ใจว่าเป็นคนนี้ ดูรูปแล้วเลือก</p>
          {pending.map((row) => (
            <ReviewCard
              key={row.studentCode}
              imageUrl={row.imageUrl}
              code={row.studentCode}
              name={row.fullName}
              spoof={row.reviewReason === "spoof"}
              detail={`เห็นตอน ${row.firstSeenAt ? formatTime(row.firstSeenAt) : "-"}${
                row.confidence !== null ? ` · ความเหมือน ${Math.round(row.confidence * 100)}%` : ""
              }`}
              rejectLabel="ไม่ใช่นักศึกษาวิชานี้"
              rejectMessage={
                row.reviewReason === "spoof"
                  ? "ไม่นับรูปนี้ใช่ไหม ถ้าตัวจริงเข้ามา กล้องจะเช็คให้ใหม่"
                  : `ไม่ใช่นักศึกษาวิชานี้ใช่ไหม รูปนี้จะไม่ถูกนับเป็นของ ${row.studentCode}`
              }
              candidates={unseen}
              busy={busy}
              onReview={(action) => review(row.studentCode, action)}
            />
          ))}
          {tripReviews.map((t) => (
            <ReviewCard
              key={t.id}
              imageUrl={t.imageUrl}
              code={t.guessCode}
              name={t.guessName}
              detail={`ออกตอน ${formatTime(t.outAt)}${
                t.score !== null ? ` · ความเหมือน ${Math.round(t.score * 100)}%` : ""
              }`}
              rejectLabel="ไม่ใช่ ลบรอบนี้"
              rejectMessage="ลบรอบนี้ใช่ไหม รอบนี้จะหายไปจากการนับเวลานอกห้อง"
              candidates={rows}
              busy={busy}
              backAtFor={backAtFor}
              onReview={(action) => reviewTrip(t.id, action)}
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
              <th className="px-4 py-2">นอกห้อง</th>
              <th className="px-4 py-2">แก้</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <StudentRow
                key={row.studentCode}
                row={row}
                busy={busy}
                ended={session.status === "ended"}
                onChange={(status) => setStatus(row.studentCode, status)}
                onOpenTrip={(tripId) => setOpenTrip({ code: row.studentCode, tripId })}
              />
            ))}
          </tbody>
        </table>
      </div>

      {(unknown.length > 0 || unknownTrips.length > 0) && (
        <div className="space-y-2">
          <h3 className="font-medium">หน้าที่ไม่ตรงกับใครในวิชา</h3>
          <p className="text-sm text-gray-600">เก็บไว้ 7 วันแล้วลบเอง</p>
          <div className="flex flex-wrap gap-2">
            {unknown.map((face, index) => (
              <figure key={`${face.seenAt}-${index}`} className="text-center text-xs text-gray-500">
                <Photo src={face.imageUrl} size="h-20 w-20" />
                <figcaption>{formatTime(face.seenAt)}</figcaption>
              </figure>
            ))}
          </div>
          {unknownTrips.map((t) => (
            <UnknownTripCard
              key={t.id}
              trip={t}
              candidates={rows}
              busy={busy}
              backAtFor={backAtFor}
              onReview={(action) => reviewTripResult(t.id, action)}
            />
          ))}
        </div>
      )}

      {openTrip && selected && selectedRow && (
        <TripDialog
          key={openTrip.tripId}
          studentCode={selectedRow.studentCode}
          fullName={selectedRow.fullName}
          trip={selected}
          session={session}
          busy={busy}
          onSave={(backAt) => run(`${tripBase}/${openTrip.tripId}`, "PATCH", { backAt })}
          onDelete={() => run(`${tripBase}/${openTrip.tripId}`, "DELETE")}
          onClose={() => setOpenTrip(null)}
        />
      )}
    </section>
  );
}

function StudentRow({
  row,
  busy,
  ended,
  onChange,
  onOpenTrip,
}: {
  row: AttendanceRow;
  busy: boolean;
  // คาบจบแล้ว (สถานะมากับข้อมูลที่ดึงใหม่ทุกรอบ)
  ended: boolean;
  onChange: (status: string) => void;
  onOpenTrip: (tripId: string) => void;
}) {
  const editable = EDITABLE.find((s) => s === row.status);
  return (
    <tr>
      <td className="px-4 py-2">
        {row.imageUrl ? (
          <Photo src={row.imageUrl} size="h-12 w-12" />
        ) : (
          <div className="h-12 w-12" />
        )}
      </td>
      <td className="px-4 py-2">
        <div className="font-mono">{row.studentCode}</div>
        <div className="text-gray-600">{row.fullName ?? "-"}</div>
        {!row.faceEnrolled && <div className="text-xs text-yellow-700">ยังไม่ลงทะเบียนหน้า</div>}
      </td>
      <td className="px-4 py-2">{row.firstSeenAt ? formatTime(row.firstSeenAt) : "-"}</td>
      <td className="px-4 py-2">
        {row.status || row.absentByTime ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${STATUS_LABEL[row.status ?? "absent"].className}`}
          >
            {STATUS_LABEL[row.status ?? "absent"].label}
          </span>
        ) : (
          <span className="text-gray-500">ยังไม่เห็น</span>
        )}
        {row.outOfRoom.label && (
          <span
            className={`ml-1 rounded-full px-2 py-0.5 text-xs ${OUT_LABEL[row.outOfRoom.label].className}`}
          >
            {OUT_LABEL[row.outOfRoom.label].text(row.outOfRoom.minutes)}
          </span>
        )}
        {row.updatedBy && <div className="text-xs text-gray-500">แก้โดย {row.updatedBy}</div>}
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {row.outOfRoom.trips.map((trip) => (
            <TripChip key={trip.id} trip={trip} ended={ended} onClick={() => onOpenTrip(trip.id)} />
          ))}
        </div>
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

// รอบที่กล้องไม่รู้ว่าใคร อาจารย์ระบุตัวหรือลบทิ้ง
function UnknownTripCard({
  trip,
  candidates,
  busy,
  backAtFor,
  onReview,
}: {
  trip: { id: string; outAt: string; imageUrl: string | null };
  candidates: AttendanceRow[];
  busy: boolean;
  backAtFor: (hhmm: string) => string;
  onReview: (action: ReviewAction) => Promise<TripResult>;
}) {
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: ReviewAction) {
    setError(null);
    const result = await onReview(action);
    if (!result.ok) setError(result.error);
  }

  function reject() {
    if (!window.confirm("ลบรอบนี้ใช่ไหม รอบนี้จะหายไปจากการนับเวลานอกห้อง")) return;
    void submit({ action: "reject" });
  }

  return (
    <div className="flex flex-wrap gap-4 rounded-lg border p-4">
      {trip.imageUrl ? (
        <Photo src={trip.imageUrl} size="h-20 w-20" />
      ) : (
        <div className="h-20 w-20" />
      )}
      <div className="flex-1 space-y-2">
        <p className="text-sm">ออกตอน {formatTime(trip.outAt)}</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {choosing ? (
          <ReassignForm
            candidates={candidates}
            busy={busy}
            backAtFor={backAtFor}
            onSubmit={(action) => void submit(action)}
            onCancel={() => setChoosing(false)}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || candidates.length === 0}
              onClick={() => setChoosing(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            >
              ระบุตัว
            </button>
            <button
              disabled={busy}
              onClick={reject}
              className="rounded-lg border px-4 py-2 text-red-600 disabled:opacity-50"
            >
              ลบรอบนี้
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
