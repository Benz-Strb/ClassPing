"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { AdminUser, Course, Room } from "@/lib/types";

const tools = [
  { href: "/admin/users", title: "ผู้ใช้และสิทธิ์", description: "เปลี่ยนบทบาทและรีเซ็ตใบหน้า", icon: "user" },
  { href: "/admin/courses", title: "รายวิชาและตารางเรียน", description: "จัดกลุ่มเรียนและมอบหมายผู้สอน", icon: "courses" },
  { href: "/admin/cameras", title: "กล้องประจำห้อง", description: "ตรวจสอบการเชื่อมต่อและออก token", icon: "camera" },
  { href: "/admin/leave-statuses", title: "สถานะการลา", description: "ติดตามผลการพิจารณาคำขอลา", icon: "leave" },
] as const;

const totals = [
  { key: "users", label: "ผู้ใช้ในระบบ" },
  { key: "courses", label: "รายวิชา" },
  { key: "rooms", label: "ห้องเรียน" },
] as const;

interface Summary {
  users: number;
  courses: number;
  rooms: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<AdminUser[]>("/admin/users"),
      apiFetch<Course[]>("/courses"),
      apiFetch<Room[]>("/admin/rooms"),
    ])
      .then(([users, courses, rooms]) =>
        setSummary({
          users: users.length,
          courses: courses.length,
          rooms: rooms.length,
        }),
      )
      .catch(async (value: unknown) =>
        setError(await handleApiError(value, router)),
      );
  }, [router]);

  return (
    <section aria-labelledby="dashboard-title" className="admin-dashboard">
      <div className="admin-dashboard-overview">
        <h2 id="dashboard-title">ภาพรวมระบบ</h2>
        <dl className="admin-dashboard-totals" aria-busy={!summary && !error}>
          {totals.map(({ key, label }) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{summary ? summary[key].toLocaleString("th-TH") : "—"}</dd>
            </div>
          ))}
        </dl>
        {!summary && !error && <p className="admin-dashboard-loading" role="status">กำลังโหลดข้อมูล...</p>}
      </div>
      {error && (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      )}
      <section aria-labelledby="admin-tools-title" className="admin-dashboard-tools">
        <h3 id="admin-tools-title">จัดการระบบ</h3>
        <ul className="admin-dashboard-directory">
          {tools.map(({ href, title, description, icon }) => (
            <li key={href}>
              <Link href={href} className="admin-dashboard-tool">
                <span aria-hidden="true" className="admin-dashboard-icon-tile">
                  <span style={{ maskImage: `url(/icons/${icon}.svg)` }} />
                </span>
                <span className="admin-dashboard-tool-copy">
                  <strong>{title}</strong>
                  <span>{description}</span>
                </span>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
