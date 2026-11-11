"use client";

import { useRouter } from "next/navigation";
import { RetryButton } from "@/components/retry-button";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { VideoView } from "@/lib/admin";
import { addDays, bangkokDate, formatBuddhistDate, formatTime } from "@/lib/time";

const KINDS = { live: "ดูสด", playback: "ดูย้อนหลัง", download: "ดาวน์โหลด" } as const;
const dateTime = (iso: string) => `${formatBuddhistDate(bangkokDate(new Date(iso)))} ${formatTime(iso)}`;

export default function AdminVideoViewsPage() {
  const router = useRouter();
  const [today] = useState(() => bangkokDate(new Date()));
  const [from, setFrom] = useState(() => addDays(today, -6));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<VideoView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<VideoView[]>(`/admin/video-views?from=${from}&to=${to}`)
      .then((data) => { if (!cancelled) { setRows(data); setError(null); } })
      .catch(async (value: unknown) => {
        const message = await handleApiError(value, router);
        if (!cancelled) setError(message);
      });
    return () => { cancelled = true; };
  }, [from, to, router]);

  function change(setter: (value: string) => void, value: string) {
    if (!value) return;
    setRows(null);
    setError(null);
    setter(value);
  }

  return (
    <section aria-labelledby="video-views-title" className="space-y-4">
      <h2 id="video-views-title" className="text-xl font-semibold">ประวัติการดูกล้อง</h2>
      <div className="flex flex-wrap gap-4">
        <label className="block text-sm font-medium">
          ตั้งแต่วันที่
          <input type="date" value={from} max={to} onChange={(event) => change(setFrom, event.target.value)} className="mt-1 block rounded-md border px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">
          ถึงวันที่
          <input type="date" value={to} min={from} onChange={(event) => change(setTo, event.target.value)} className="mt-1 block rounded-md border px-3 py-2" />
        </label>
      </div>
      {error && <p className="text-red-700" role="alert">{error}</p>}
      {rows === null ? (
        error ? <RetryButton /> : <p role="status">กำลังโหลดประวัติ...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-600">ไม่มีการดูกล้องในช่วงนี้</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3">เวลา</th>
                <th className="px-4 py-3">ผู้ดู</th>
                <th className="px-4 py-3">การดู</th>
                <th className="px-4 py-3">วิชา</th>
                <th className="px-4 py-3">ห้อง</th>
                <th className="px-4 py-3">คาบ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, index) => (
                <tr key={`${row.viewedAt}-${index}`} className={row.isTeacherOfCourse ? undefined : "bg-amber-50"}>
                  <td className="px-4 py-3">
                    {dateTime(row.viewedAt)}
                    {formatTime(row.until) !== formatTime(row.viewedAt) && `-${formatTime(row.until)}`}
                  </td>
                  <td className="px-4 py-3">
                    {row.viewerName || row.viewerEmail}
                    {row.viewerName && <span className="block text-gray-600">{row.viewerEmail}</span>}
                    {!row.isTeacherOfCourse && <span className="block font-medium text-amber-800">ไม่ใช่ผู้สอนวิชานี้</span>}
                  </td>
                  <td className="px-4 py-3">{KINDS[row.kind]}</td>
                  <td className="px-4 py-3">{row.courseCode} {row.courseName}</td>
                  <td className="px-4 py-3">{row.roomName}</td>
                  <td className="px-4 py-3">
                    {dateTime(row.startsAt)}
                    {row.sessionKind === "exam" && <span className="block text-gray-600">สอบ{row.sessionTitle ? ` · ${row.sessionTitle}` : ""}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
