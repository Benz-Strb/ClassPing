"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Course } from "@/lib/types";

const TABS = [
  { path: "checkin", label: "เช็คชื่อ" },
  { path: "students", label: "นักศึกษา" },
  { path: "schedule", label: "ตารางเรียน" },
  { path: "exams", label: "สอบ" },
  { path: "rules", label: "เกณฑ์" },
  { path: "reports", label: "รายงาน" },
];

export function CourseHeader() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Course>(`/courses/${id}`)
      .then(setCourse)
      .catch(async (e: unknown) => setError(await handleApiError(e, router)));
  }, [id, router]);

  return (
    <header className="course-heading space-y-4">
      <Link href="/courses" className="back-link">
        วิชาทั้งหมด
      </Link>
      {error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <h1 className="text-2xl sm:text-3xl font-semibold">
          {course ? `${course.code} ${course.name}` : "กำลังโหลด..."}
          {course?.section && (
            <span className="font-normal text-gray-500"> · กลุ่ม {course.section}</span>
          )}
        </h1>
      )}
      <nav aria-label="เมนูรายวิชา" className="course-tabs">
        {TABS.map((tab) => {
          const href = `/courses/${id}/${tab.path}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={tab.path}
              href={href}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
