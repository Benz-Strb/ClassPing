"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { bangkokDate, formatTime } from "@/lib/time";
import type { LiveSession } from "@/lib/types";

const LABEL = { upcoming: "ยังไม่เริ่ม", live: "กำลังเรียน", ended: "จบแล้ว" };

export function TodayAgenda() {
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    apiFetch<LiveSession[]>(`/live/sessions?date=${bangkokDate(new Date())}`)
      .then(value => { if (active) setSessions(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [revision]);
  return <section className="work-surface" aria-labelledby="today-agenda-title">
    <div className="surface-heading"><h2 id="today-agenda-title">คาบเรียนวันนี้</h2><Link href="/live">ดูคาบและกล้อง</Link></div>
    {error ? <div className="space-y-2"><p className="tool-note">ยังโหลดคาบเรียนไม่ได้</p><button type="button" onClick={() => { setError(false); setSessions(null); setRevision(v => v + 1); }} className="rounded-lg border px-4 py-2">ลองใหม่</button></div> : !sessions ? <p role="status">กำลังโหลดคาบเรียน...</p> : !sessions.length ? <p className="tool-note py-4">ไม่มีคาบเรียนหรือคาบสอบในวันนี้</p> : <ul className="agenda-list">{sessions.map(session => <li className="agenda-row" key={session.id}>
      <div className="agenda-time"><span>{formatTime(session.startsAt)}</span><small>{formatTime(session.endsAt)}</small></div>
      <div className="agenda-description"><strong>{session.courseCode} · {session.courseName}</strong><p>{session.roomName || "ยังไม่ระบุห้อง"}{session.kind === "exam" ? " · คาบสอบ" : " · คาบเรียน"}</p></div>
      <span className="agenda-state" data-state={session.status}>{LABEL[session.status]}</span>
    </li>)}</ul>}
  </section>;
}
