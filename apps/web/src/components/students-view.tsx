"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { AddStudentsResult, RosterEntry } from "@/lib/types";

export function StudentsView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [codes, setCodes] = useState("");
  const [result, setResult] = useState<AddStudentsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    apiFetch<RosterEntry[]>(`/courses/${id}/students`)
      .then(setRoster)
      .catch(async (e: unknown) => setError(await handleApiError(e, router)));
  }, [id, router, version]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      setResult(
        await apiFetch<AddStudentsResult>(`/courses/${id}/students`, {
          method: "POST",
          body: JSON.stringify({ codes }),
        }),
      );
      setCodes("");
      setVersion((v) => v + 1);
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setSaving(false);
    }
  }

  async function remove(code: string) {
    if (!window.confirm(`เอา ${code} ออกจากวิชาใช่ไหม`)) return;
    setError(null);
    try {
      await apiFetch(`/courses/${id}/students/${code}`, { method: "DELETE" });
      setVersion((v) => v + 1);
    } catch (e) {
      setError(await handleApiError(e, router));
    }
  }

  return (
    <section className="space-y-6">
      <form onSubmit={add} className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">เพิ่มนักศึกษาด้วยรหัส</h2>
        <p className="text-sm text-gray-600">
          ใส่ได้หลายรหัส เว้นวรรคหรือขึ้นบรรทัดใหม่
        </p>
        <textarea
          required
          rows={4}
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
          placeholder={"66112106\n66112126"}
          className="w-full rounded-lg border px-3 py-2 font-mono"
        />
        <button
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "กำลังเพิ่ม..." : "เพิ่ม"}
        </button>
        {result && (
          <div className="space-y-1 text-sm">
            <p className="text-green-700">เพิ่มแล้ว {result.added.length} คน</p>
            {result.alreadyEnrolled.length > 0 && (
              <p className="text-gray-600">มีอยู่แล้ว {result.alreadyEnrolled.length} คน</p>
            )}
            {result.invalid.length > 0 && (
              <p className="text-red-600">ไม่ใช่รหัสนักศึกษา: {result.invalid.join(", ")}</p>
            )}
          </div>
        )}
      </form>

      {error && <p className="text-red-600">{error}</p>}

      {roster === null ? (
        <p>กำลังโหลด...</p>
      ) : roster.length === 0 ? (
        <p className="text-gray-600">ยังไม่มีนักศึกษาในวิชานี้</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2">รหัส</th>
                <th className="px-4 py-2">ชื่อ</th>
                <th className="px-4 py-2">สถานะ</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {roster.map((student) => (
                <tr key={student.studentCode}>
                  <td className="px-4 py-2 font-mono">{student.studentCode}</td>
                  <td className="px-4 py-2">{student.fullName ?? "-"}</td>
                  <td className="px-4 py-2">
                    {!student.hasLoggedIn ? (
                      <Badge tone="gray">ยังไม่เคย login</Badge>
                    ) : !student.faceEnrolled ? (
                      <Badge tone="yellow">ยังไม่ลงทะเบียนหน้า</Badge>
                    ) : (
                      <Badge tone="green">พร้อมเช็คชื่อ</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => remove(student.studentCode)}
                      className="text-red-600 hover:underline"
                    >
                      เอาออก
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-4 py-2 text-sm text-gray-600">ทั้งหมด {roster.length} คน</p>
        </div>
      )}
    </section>
  );
}

const TONES = {
  gray: "bg-gray-100 text-gray-700",
  yellow: "bg-yellow-100 text-yellow-800",
  green: "bg-green-100 text-green-800",
};

function Badge({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${TONES[tone]}`}>{children}</span>;
}
