"use client";

import Link from "next/link";
import { DeleteCourseButton } from "@/components/delete-course-button";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { AdminUser, Course } from "@/lib/types";

const EMPTY = { code: "", name: "", section: "", teacherId: "" };
export default function AdminCoursesPage() {
  const router = useRouter();
  const [data, setData] = useState<{ courses: Course[]; users: AdminUser[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch<Course[]>("/courses"), apiFetch<AdminUser[]>("/admin/users")])
      .then(([courses, users]) => { if (!cancelled) setData({ courses, users }); })
      .catch(async (value: unknown) => { const message = await handleApiError(value, router); if (!cancelled) setError(message); });
    return () => { cancelled = true; };
  }, [router]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null); setStatus("");
    try {
      const course = await apiFetch<Course>(editing ? `/courses/${editing}` : "/courses", { method: editing ? "PATCH" : "POST", body: JSON.stringify(form) });
      setData((current) => current && ({ ...current, courses: [...current.courses.filter((item) => item.id !== course.id), course].sort((a, b) => a.code.localeCompare(b.code)) }));
      setStatus(editing ? "แก้ไขรายวิชาแล้ว" : "เพิ่มรายวิชาแล้ว");
      setEditing(null); setForm(EMPTY);
    } catch (value) { setError(await handleApiError(value, router)); }
    finally { setSaving(false); }
  }
  return <section className="space-y-4" aria-labelledby="admin-courses-title">
    <div><h2 id="admin-courses-title" className="text-xl font-semibold">รายวิชาและผู้สอน</h2><p className="text-sm text-gray-600">จัดการกลุ่มเรียน มอบหมายอาจารย์ และแก้ตารางเรียนแทนอาจารย์</p></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {status && <p role="status" className="text-green-800">{status}</p>}
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <div>{!data ? !error && <p role="status">กำลังโหลดรายวิชา...</p> : !data.courses.length ? <p>ยังไม่มีรายวิชา</p> :
        <ul className="divide-y rounded-lg border bg-white">{data.courses.map((course) => {
          const teacher = data.users.find((user) => user.id === course.teacherId);
          return <li key={course.id} className="space-y-2 p-4">
            <h3 className="font-medium">{course.code} · {course.name}</h3>
            <p className="text-sm text-gray-600">กลุ่ม {course.section || "—"} · ผู้สอน {teacher?.fullName || teacher?.email || "ไม่พบบัญชีผู้สอน"}{teacher && teacher.role !== "teacher" && " (บทบาทบัญชีไม่ใช่อาจารย์ กรุณามอบหมายใหม่)"}</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <button disabled={saving} className="text-blue-700 underline disabled:opacity-50" onClick={() => { setEditing(course.id); setForm({ code: course.code, name: course.name, section: course.section ?? "", teacherId: teacher?.role === "teacher" ? teacher.id : "" }); setStatus(""); codeInput.current?.focus(); }}>แก้ไขรายวิชา</button>
              <Link href={`/courses/${course.id}/schedule`} className="text-blue-700 underline">ตารางเรียน</Link>
              <Link href={`/courses/${course.id}/students`} className="text-blue-700 underline">นักศึกษา</Link>
              <DeleteCourseButton course={course} disabled={saving} onError={setError} onDeleted={() => { setData(value => value ? { ...value, courses: value.courses.filter(item => item.id !== course.id) } : null); if (editing === course.id) { setEditing(null); setForm(EMPTY); } setStatus(`ลบวิชา ${course.code} แล้ว`); }} />
            </div>
          </li>;
        })}</ul>}
      </div>
      <form onSubmit={save} className="space-y-3 rounded-lg border bg-white p-4">
        <h3 className="font-medium">{editing ? "แก้ไขรายวิชา" : "เพิ่มรายวิชา"}</h3>
        <fieldset disabled={saving || !data} className="space-y-3 disabled:opacity-60">
          <label className="block text-sm">รหัสวิชา<input ref={codeInput} required maxLength={30} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="mt-1 w-full rounded border p-2" /></label>
          <label className="block text-sm">ชื่อวิชา<input required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded border p-2" /></label>
          <label className="block text-sm">กลุ่มเรียน<input maxLength={30} value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })} className="mt-1 w-full rounded border p-2" /></label>
          <label className="block text-sm">อาจารย์ผู้สอน<select required value={form.teacherId} onChange={(event) => setForm({ ...form, teacherId: event.target.value })} className="mt-1 w-full rounded border bg-white p-2">
            <option value="">เลือกอาจารย์</option>{data?.users.filter((user) => user.role === "teacher").map((user) => <option key={user.id} value={user.id}>{user.fullName || user.email}</option>)}
          </select></label>
          {data && !data.users.some((user) => user.role === "teacher") && <p className="text-sm text-amber-800">ยังไม่มีบัญชีอาจารย์ กรุณาตรวจบทบาทที่หน้าผู้ใช้ก่อน</p>}
          <div className="flex gap-3"><button className="rounded bg-blue-700 px-4 py-2 text-white">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm(EMPTY); }} className="rounded border px-3 py-2">ยกเลิก</button>}</div>
        </fieldset>
      </form>
    </div>
  </section>;
}
