"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { CurriculumStudyPlan, readStudyPlan } from "./curriculum-study-plan";

const fieldClass = "mt-1 block w-full rounded-lg border bg-white px-3 py-2";
const actionClass = "min-h-11 rounded-lg action-filled px-4 py-2 text-sm";

export type CurriculumDraft = { content: string; name?: string; year?: number };

export function CurriculumDraftForm({ draft, endpoint, contentLabel, showStudyPlan = false, onSaved, onCancel }: {
  draft: CurriculumDraft;
  endpoint: string;
  contentLabel: string;
  showStudyPlan?: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState(draft.content);
  const terms = showStudyPlan ? readStudyPlan(content) : null;
  const editor = <label className="block text-sm">{contentLabel}
    <textarea name="content" maxLength={50000} rows={8} value={content} onChange={(event) => setContent(event.target.value)} className={fieldClass} />
  </label>;

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const body = {
      code: String(fields.get("code") ?? "").trim(),
      name: String(fields.get("name") ?? "").trim(),
      year: Number(fields.get("year")),
      content: String(fields.get("content") ?? "").trim(),
    };
    setError(null);
    if (!body.code || !body.name || !body.content) {
      setError("กรุณาระบุรหัส ชื่อ และข้อความหลักสูตร");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (value) {
      setError(await handleApiError(value, router));
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={saveDraft} aria-label="ตรวจร่างหลักสูตร" className="border-t border-[var(--cp-border)] pt-4">
    <h4 className="text-base font-semibold">ตรวจร่างหลักสูตร</h4>
    <fieldset disabled={busy} className="mt-3 min-w-0 space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <label className="min-w-0 text-sm">รหัสหลักสูตร<input name="code" required maxLength={60} className={fieldClass} /></label>
        <label className="min-w-0 text-sm">ชื่อหลักสูตร<input name="name" required maxLength={200} defaultValue={draft.name} className={fieldClass} /></label>
        <label className="min-w-0 text-sm">ปีหลักสูตร<input name="year" required type="number" min={1900} max={3000} defaultValue={draft.year} className={fieldClass} /></label>
      </div>
      {terms && <CurriculumStudyPlan terms={terms} />}
      {showStudyPlan ? <details className="rounded-lg border border-[var(--cp-border)] p-3">
        <summary className="cursor-pointer text-sm font-medium text-blue-700">แก้ไขข้อความรายวิชา</summary>
        <div className="mt-3">{editor}</div>
      </details> : editor}
      <button className={actionClass}>{busy ? "กำลังบันทึก…" : "บันทึกหลักสูตร"}</button>
      <button type="button" onClick={onCancel} className="ms-2 min-h-11 rounded-lg border px-4 py-2 text-sm">ยกเลิก</button>
    </fieldset>
    {error && <p role="alert" className="mt-3">{error}</p>}
  </form>;
}
