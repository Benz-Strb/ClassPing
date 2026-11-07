"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Course, Me } from "@/lib/types";
import { TodayAgenda } from "@/components/today-agenda";

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", name: "", section: "" });
  const [saving, setSaving] = useState(false);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    Promise.all([apiFetch<Course[]>("/courses"), apiFetch<Me>("/me")])
      .then(([rows, me]) => {
        if (me.role === "admin") router.replace("/admin/courses");
        else setCourses(rows);
      })
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
    <main className="space-y-8">
      <header className="workspace-heading">
        <div><h1>ตารางและงานของวันนี้</h1><p>รายวิชา กลุ่มเรียน และรายละเอียดการเข้าเรียน</p></div>
        <Link href="/live" className="ml-auto mr-4 text-sm text-blue-600 underline">
          กล้อง
        </Link>
        <Link href="/me" className="text-sm text-blue-600 underline">
          บัญชีของฉัน
        </Link>
      </header>

      {error && <p role="alert" className="surface-feedback text-red-600">{error}</p>}
      <div className="workspace-columns">
      <div className="workspace-primary">
      <TodayAgenda />
      <section className="work-surface" aria-labelledby="my-courses-title">
      <div className="surface-heading"><h2 id="my-courses-title">รายวิชาของฉัน</h2><span className="tool-note">{courses ? `${courses.length} รายวิชา` : ""}</span></div>
      {courses === null ? (
        <p role="status" className="surface-feedback text-gray-600">กำลังโหลดรายวิชา...</p>
      ) : courses.length === 0 ? (
        <p className="surface-feedback text-gray-600">ยังไม่มีวิชา</p>
      ) : (
        <ul className="course-grid">
          {courses.map((course) => (
            <li key={course.id} className="course-card">
              <Link
                href={`/courses/${course.id}/students`}
                className="course-entry"
              >
                <span className="course-code">{course.code}</span><span className="course-detail"><h2>{course.name}</h2>{course.section && <small>กลุ่ม {course.section}</small>}</span>
                <span className="course-open" aria-hidden="true">&rsaquo;</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      </section>
      </div>
      <aside className="workspace-tools" aria-label="เครื่องมือรายวิชา">
      <section className="work-surface"><h2 className="mb-4">งานที่ต้องตรวจ</h2><Link href="/leave/review" className="tool-link">ตรวจคำขอลา<span aria-hidden="true">&rsaquo;</span></Link><Link href="/live" className="tool-link">คาบเรียนและกล้อง<span aria-hidden="true">&rsaquo;</span></Link><p className="tool-note mt-4">ผลรอตรวจต้องได้รับการยืนยันก่อนนับเป็นผลเข้าเรียน</p></section>
      <form onSubmit={create} className="space-y-4 rounded-xl border p-6">
        <h2 className="font-medium">สร้างวิชา</h2>
        <div className="grid gap-4">
          <label className="form-field"><span>รหัสวิชา</span>
          <input
            required
            aria-label="รหัสวิชา"
            placeholder="รหัสวิชา เช่น CS101"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="rounded-lg border px-3 py-2"
          /></label>
          <label className="form-field"><span>ชื่อวิชา</span>
          <input
            required
            aria-label="ชื่อวิชา"
            placeholder="ชื่อวิชา"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-lg border px-3 py-2"
          /></label>
          <label className="form-field"><span>กลุ่มเรียน</span>
          <input
            aria-label="กลุ่มเรียน"
            placeholder="กลุ่มเรียน"
            value={form.section}
            onChange={(e) => setForm({ ...form, section: e.target.value })}
            className="rounded-lg border px-3 py-2"
          /></label>
        </div>
        <button
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "กำลังสร้าง..." : "สร้างวิชา"}
        </button>
      </form>
      </aside>
      </div>
    </main>
  );
}
