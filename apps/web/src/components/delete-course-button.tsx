"use client";

import { confirmAction, notify } from "@/components/notifications";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Course } from "@/lib/types";

export function DeleteCourseButton({ course, disabled = false, onDeleted, onError }: {
  course: Course;
  disabled?: boolean;
  onDeleted: () => void;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    const label = `${course.code} · ${course.name}${course.section ? ` · กลุ่ม ${course.section}` : ''}`;
    if (!(await confirmAction(`ลบวิชา ${label} ใช่ไหม?\nตารางเรียน รายชื่อนักศึกษา และผลเข้าเรียนของวิชานี้จะถูกลบด้วย และกู้คืนไม่ได้`, { title: 'ลบรายวิชานี้?', confirmLabel: 'ลบวิชา', danger: true }))) return;
    setBusy(true);
    onError(null);
    try {
      await apiFetch(`/courses/${course.id}`, { method: 'DELETE' });
      notify(`ลบวิชา ${course.code} แล้ว`);
      onDeleted();
    } catch (cause) {
      onError(await handleApiError(cause, router));
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" disabled={disabled || busy} onClick={() => void remove()} aria-label={`ลบวิชา ${course.code}${course.section ? ` กลุ่ม ${course.section}` : ''}`} className="rounded-lg px-3 py-2 text-sm text-red-700 underline disabled:opacity-50">{busy ? 'กำลังลบ…' : 'ลบวิชา'}</button>;
}
