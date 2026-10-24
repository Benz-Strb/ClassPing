"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { addDays, bangkokDate, formatDate, formatTime } from "@/lib/time";
import type { SessionView } from "@/lib/types";
import { ExamBadge } from "./exam-badge";

const STATUS = {
  upcoming: { label: "ยังไม่เริ่ม", className: "bg-gray-100 text-gray-700" },
  live: { label: "กำลังเรียน", className: "bg-green-100 text-green-800" },
  ended: { label: "จบแล้ว", className: "bg-gray-100 text-gray-500" },
};

export function CheckinSessions() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const today = bangkokDate(new Date());
  const [date, setDate] = useState(today);
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SessionView[]>(`/courses/${id}/sessions?from=${date}&to=${date}`)
      .then(setSessions)
      .catch(async (e: unknown) => setError(await handleApiError(e, router)));
  }, [id, date, router]);

  function go(days: number) {
    setSessions(null);
    setError(null);
    setDate((d) => addDays(d, days));
  }

  return (
    <section className="space-y-4">
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
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                href={`/courses/${id}/checkin/${session.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
              >
                <span>
                  {formatTime(session.startsAt)}-{formatTime(session.endsAt)} · {session.roomName}
                </span>
                {session.kind === "exam" && <ExamBadge title={session.title} />}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${STATUS[session.status].className}`}
                >
                  {STATUS[session.status].label}
                </span>
                <span className="ml-auto text-sm text-blue-600">ดูการเช็คชื่อ</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
