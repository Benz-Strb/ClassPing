"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Rules } from "@/lib/types";

interface Form {
  lateAfterMin: string;
  absentAtEnd: boolean;
  absentAfterMin: string;
  outOfRoomLimitMin: string;
}

const toForm = (rules: Rules): Form => ({
  lateAfterMin: String(rules.lateAfterMin),
  absentAtEnd: rules.absentAfterMin === null,
  absentAfterMin: String(rules.absentAfterMin ?? rules.lateAfterMin + 15),
  outOfRoomLimitMin: String(rules.outOfRoomLimitMin),
});

export function RulesView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Rules>(`/courses/${id}/rules`)
      .then((rules) => setForm(toForm(rules)))
      .catch(async (e: unknown) => setError(await handleApiError(e, router)));
  }, [id, router]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const rules = await apiFetch<Rules>(`/courses/${id}/rules`, {
        method: "PUT",
        body: JSON.stringify({
          lateAfterMin: Number(form.lateAfterMin),
          absentAfterMin: form.absentAtEnd ? null : Number(form.absentAfterMin),
          outOfRoomLimitMin: Number(form.outOfRoomLimitMin),
        }),
      });
      setForm(toForm(rules));
      setSaved(true);
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setSaving(false);
    }
  }

  if (!form) return error ? <p className="text-red-600">{error}</p> : <p>กำลังโหลด...</p>;

  return (
    <form onSubmit={save} className="max-w-md space-y-5">
      <p className="text-sm text-gray-600">นับจากเวลาเริ่มคาบ</p>

      <label className="block space-y-1">
        <span className="font-medium">ตัดสาย (นาที)</span>
        <input
          type="number"
          min={0}
          max={240}
          required
          value={form.lateAfterMin}
          onChange={(e) => setForm({ ...form, lateAfterMin: e.target.value })}
          className="w-32 rounded-lg border px-3 py-2"
        />
        <span className="block text-sm text-gray-600">
          มาหลังจากนี้นับว่าสาย
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="font-medium">ตัดขาด</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.absentAtEnd}
            onChange={(e) => setForm({ ...form, absentAtEnd: e.target.checked })}
          />
          นับขาดตอนหมดคาบ
        </label>
        {!form.absentAtEnd && (
          <label className="block space-y-1">
            <span className="text-sm">มาหลังจากนี้นับว่าขาด (นาที)</span>
            <input
              type="number"
              min={1}
              max={240}
              required
              value={form.absentAfterMin}
              onChange={(e) => setForm({ ...form, absentAfterMin: e.target.value })}
              className="block w-32 rounded-lg border px-3 py-2"
            />
          </label>
        )}
      </fieldset>

      <label className="block space-y-1">
        <span className="font-medium">ออกนอกห้องเกิน (นาที)</span>
        <input
          type="number"
          min={1}
          max={240}
          required
          value={form.outOfRoomLimitMin}
          onChange={(e) => setForm({ ...form, outOfRoomLimitMin: e.target.value })}
          className="w-32 rounded-lg border px-3 py-2"
        />
        <span className="block text-sm text-gray-600">
          ออกนอกห้องรวมเกินนี้นับว่าโดด
        </span>
      </label>

      {error && <p className="text-red-600">{error}</p>}
      {saved && <p className="text-green-700">บันทึกแล้ว</p>}
      <button
        disabled={saving}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? "กำลังบันทึก..." : "บันทึกเกณฑ์"}
      </button>
    </form>
  );
}
