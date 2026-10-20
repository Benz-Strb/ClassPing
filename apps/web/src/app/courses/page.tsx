"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Course } from "@/lib/types";

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", name: "", section: "" });
  const [saving, setSaving] = useState(false);

  // เพิ่มค่าเพื่อโหลดรายการใหม่หลังสร้างวิชา
  const [version, setVersion] = useState(0);

  useEffect(() => {
    apiFetch<Course[]>("/courses")
      .then(setCourses)
      .catch(async (e: unknown) => setError(await handleApiError(e, router)));
  }, [router, version]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch<Course>("/courses", { method: "POST", body: JSON.stringify(form) });
      setForm({ code: "", name: "", section: "" });
      setVersion((v) => v + 1);
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">วิชาของฉัน</h1>
        <Link href="/me" className="text-sm text-blue-600 underline">
          บัญชีของฉัน
        </Link>
      </header>

      {error && <p className="text-red-600">{error}</p>}

      {courses === null ? (
        <p>กำลังโหลด...</p>
      ) : courses.length === 0 ? (
        <p className="text-gray-600">ยังไม่มีวิชา สร้างวิชาแรกด้านล่าง</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {courses.map((course) => (
            <li key={course.id}>
              <Link
                href={`/courses/${course.id}/students`}
                className="block px-4 py-3 hover:bg-gray-50"
              >
                <span className="font-medium">{course.code}</span> {course.name}
                {course.section && (
                  <span className="text-gray-500"> · กลุ่ม {course.section}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">สร้างวิชา</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
          <input
            required
            placeholder="รหัสวิชา เช่น CS101"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="rounded-lg border px-3 py-2"
          />
          <input
            required
            placeholder="ชื่อวิชา"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-lg border px-3 py-2"
          />
          <input
            placeholder="กลุ่มเรียน (ไม่ใส่ก็ได้)"
            value={form.section}
            onChange={(e) => setForm({ ...form, section: e.target.value })}
            className="rounded-lg border px-3 py-2"
          />
        </div>
        <button
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "กำลังสร้าง..." : "สร้างวิชา"}
        </button>
      </form>
    </main>
  );
}
