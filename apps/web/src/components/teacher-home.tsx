"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { bangkokDate, formatTime } from "@/lib/time";
import type { Course, LiveSession } from "@/lib/types";
import type { LeaveRequest } from "@/lib/leave";
import "./teacher-home.css";

function useHomeResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    apiFetch<T>(path)
      .then(value => { if (active) setData(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [path, revision]);
  const retry = () => { setError(false); setData(null); setRevision(value => value + 1); };
  return { data, error, retry };
}

function LoadState({ error, retry }: { error: boolean; retry: () => void }) {
  return error ? <div role="alert"><p>โหลดข้อมูลไม่สำเร็จ</p><button className="teacher-home-button" onClick={retry}>ลองใหม่</button></div>
    : <p role="status" className="teacher-home-muted">กำลังโหลด...</p>;
}

export function TeacherHome() {
  const [today] = useState(() => new Date());
  const courses = useHomeResource<Course[]>("/courses");
  const sessions = useHomeResource<LiveSession[]>(`/live/sessions?date=${bangkokDate(today)}`);
  const leave = useHomeResource<LeaveRequest[]>("/leave-requests/review");
  const pending = leave.data?.filter(request => request.status === "pending");

  return <main className="teacher-home-home" aria-label="หน้าหลักอาจารย์">
    <header className="teacher-home-heading">
      <h1>หน้าหลักอาจารย์</h1>
      <time dateTime={bangkokDate(today)}>{new Intl.DateTimeFormat("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(today)}</time>
    </header>
    <div className="teacher-home-columns">
      <section className="teacher-home-panel" aria-labelledby="home-sessions">
        <div className="teacher-home-panelHeading">
          <h2 id="home-sessions" className="teacher-home-sectionTitle">คาบเรียนวันนี้</h2>
          <Link href="/live">ดูคาบและกล้อง</Link>
        </div>
        {!sessions.data ? <LoadState {...sessions} /> : !sessions.data.length ? <p className="teacher-home-muted">ไม่มีคาบเรียนหรือคาบสอบในวันนี้</p>
          : <ul className="teacher-home-sessionList">{[...sessions.data].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(session => <li key={session.id}>
            <Link href={`/live/${session.id}`} className="teacher-home-session">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <div><strong>{formatTime(session.startsAt)}–{formatTime(session.endsAt)}</strong><p className="teacher-home-sessionName">{session.courseName}</p><p>{session.courseCode} · {session.roomName || "ยังไม่ระบุห้อง"}{session.kind === "exam" ? " · คาบสอบ" : ""}</p></div>
              <span className="agenda-state" data-state={session.status}>{session.status === "live" ? "กำลังเรียน" : session.status === "ended" ? "จบแล้ว" : "ยังไม่เริ่ม"}</span>
            </Link>
          </li>)}</ul>}
      </section>
      <section className="teacher-home-panel" aria-labelledby="home-leave">
        <div className="teacher-home-panelHeading">
          <h2 id="home-leave" className="teacher-home-sectionTitle">ตรวจคำขอลา</h2>
          <Link href="/leave/review">ดูใบลาทั้งหมด</Link>
        </div>
        {!pending ? <LoadState {...leave} /> : !pending.length ? <p className="teacher-home-muted">ไม่มีคำขอลาที่รอตรวจ</p>
          : <ul className="teacher-home-leaveList">{pending.map(request => <li key={request.id} className="teacher-home-leave">
            <div className="teacher-home-leaveHeading"><div><p>{request.student.studentId || "ไม่ระบุรหัส"} · {request.student.fullName || "ไม่ระบุชื่อ"}</p><p className="teacher-home-muted">{request.session.courseCode}{request.session.section && ` · กลุ่ม ${request.session.section}`}</p></div><span className="teacher-home-badge">รอตรวจ</span></div>
            <Link href={`/leave/review#request-${request.id}`} className="teacher-home-button teacher-home-primary">ตรวจใบลา<span className="sr-only"> {request.student.fullName || request.student.studentId}</span></Link>
          </li>)}</ul>}
      </section>
    </div>
    <section aria-labelledby="home-courses">
      <h2 id="home-courses" className="teacher-home-sectionTitle">รายวิชาของฉัน</h2>
      <div className="teacher-home-courses">
        {!courses.data ? <div className="teacher-home-panel"><LoadState {...courses} /></div>
          : !courses.data.length ? <div className="teacher-home-panel"><p className="teacher-home-muted">ยังไม่มีรายวิชา</p><Link className="teacher-home-button" href="/courses">จัดการรายวิชา</Link></div>
          : courses.data.map(course => <article key={course.id} className="teacher-home-panel">
            <div className="teacher-home-courseHeading">
              <div><p className="teacher-home-courseCode">{course.code}{course.section && ` · กลุ่ม ${course.section}`}</p><h3 className="teacher-home-courseName">{course.name}</h3></div>
              <Link className="teacher-home-button teacher-home-detail" href={`/courses/${course.id}/students`}>ดูรายละเอียด<span className="sr-only"> {course.code} {course.section}</span></Link>
            </div>
            <nav className="teacher-home-courseActions" aria-label={`${course.code} กลุ่ม ${course.section || "ไม่ระบุ"}`}>
              <Link className="teacher-home-button" href={`/courses/${course.id}/students`}>นักศึกษา</Link>
              <Link className="teacher-home-button" href={`/courses/${course.id}/schedule`}>ตารางเรียน</Link>
              <Link className="teacher-home-button" href={`/courses/${course.id}/reports`}>รายงาน</Link>
            </nav>
          </article>)}
      </div>
    </section>
  </main>;
}
