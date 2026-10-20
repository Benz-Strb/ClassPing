"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Course } from "@/lib/types";

const TABS = [
  { path: "students", label: "นักศึกษา" },
  { path: "schedule", label: "ตารางเรียน" },
  { path: "rules", label: "เกณฑ์" },
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
    <header className="space-y-3">
      <Link href="/courses" className="text-sm text-blue-600 underline">
        วิชาทั้งหมด
      </Link>
      {error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <h1 className="text-xl font-semibold">
          {course ? `${course.code} ${course.name}` : "กำลังโหลด..."}
          {course?.section && (
            <span className="font-normal text-gray-500"> · กลุ่ม {course.section}</span>
          )}
        </h1>
      )}
      <nav className="flex gap-4 border-b">
        {TABS.map((tab) => {
          const href = `/courses/${id}/${tab.path}`;
          const active = pathname === href;
          return (
            <Link
              key={tab.path}
              href={href}
              className={`-mb-px border-b-2 pb-2 ${
                active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
