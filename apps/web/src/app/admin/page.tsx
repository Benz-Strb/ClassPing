"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { AdminUser, Course, Room } from "@/lib/types";

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
    <section aria-labelledby="dashboard-title" className="space-y-4">
      <div>
        <h2 id="dashboard-title" className="text-xl font-semibold">
          ภาพรวมระบบ
        </h2>
        <p className="text-sm text-gray-600">
          ข้อมูลผู้ใช้ วิชา และห้องเรียนทั้งหมด
        </p>
      </div>
      {error && (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      )}
      {!summary ? (
        !error && <p role="status">กำลังโหลดข้อมูล...</p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            ["ผู้ใช้", summary.users],
            ["วิชา", summary.courses],
            ["ห้องเรียน", summary.rooms],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-white p-4">
              <dt className="text-sm text-gray-600">{label}</dt>
              <dd className="mt-1 text-3xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
