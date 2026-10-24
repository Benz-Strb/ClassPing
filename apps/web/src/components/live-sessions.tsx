"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { addDays, bangkokDate, formatDate, formatTime } from "@/lib/time";
import type { LiveSession } from "@/lib/types";
import { ExamBadge } from "./exam-badge";

const STATUS = {
  upcoming: { label: "ยังไม่เริ่ม", className: "bg-gray-100 text-gray-700" },
  live: { label: "กำลังเรียน", className: "bg-green-100 text-green-800" },
  ended: { label: "จบแล้ว", className: "bg-gray-100 text-gray-500" },
};

export function LiveSessions() {
  const router = useRouter();
  const today = bangkokDate(new Date());
  const [date, setDate] = useState(today);
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<LiveSession[]>(`/live/sessions?date=${date}`)
      .then(setSessions)
      .catch(async (e: unknown) => setError(await handleApiError(e, router)));
  }, [date, router]);

  function go(days: number) {
    setSessions(null);
    setError(null);
    setDate((d) => addDays(d, days));
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">กล้องหน้าห้อง</h1>
        <Link href="/courses" className="text-sm text-blue-600 underline">
          วิชาทั้งหมด
        </Link>
      </header>
      <p className="text-sm text-gray-600">
        เห็นเฉพาะคาบของวิชาที่สอนและคาบสอบที่คุม กล้องเปิดเฉพาะช่วงที่มีคาบ
      </p>

      <div className="flex items-center gap-3">
        <button onClick={() => go(-1)} className="rounded-lg border px-3 py-1">
          วันก่อน
        </button>
        <h2 className="font-medium">
          {date === today ? "วันนี้ · " : ""}
          {formatDate(date)}
        </h2>
        {date < today && (
          <button onClick={() => go(1)} className="rounded-lg border px-3 py-1">
            วันถัดไป
          </button>
        )}
      </div>

      {error && <p className="text-red-600">{error}</p>}

      {sessions === null ? (
        !error && <p>กำลังโหลด...</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-600">ไม่มีคาบในวันนี้</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span>
                <span className="font-medium">{s.courseCode}</span> {formatTime(s.startsAt)}-
                {formatTime(s.endsAt)} · {s.roomName}
              </span>
              {s.kind === "exam" && <ExamBadge title={s.title} />}
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[s.status].className}`}>
                {STATUS[s.status].label}
              </span>
              <span className="ml-auto text-sm">
                {!s.hasCamera ? (
                  <span className="text-gray-500">ห้องนี้ไม่มีกล้อง</span>
                ) : s.cameraOpen ? (
                  <Link href={`/live/${s.id}`} className="text-blue-600 hover:underline">
                    ดูสด
                  </Link>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
