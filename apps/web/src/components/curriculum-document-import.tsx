"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { CurriculumDraftForm } from "./curriculum-draft-form";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const actionClass = "min-h-11 rounded-lg action-filled px-4 py-2 text-sm";

export function CurriculumDocumentImport({ endpoint, onSaved }: { endpoint: string; onSaved: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function readDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setStatus("");
    setError(null);
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError("ไฟล์ต้องมีขนาดไม่เกิน 10 MB");
      return;
    }

    const body = new FormData();
    body.append("document", file);
    setBusy(true);
    try {
      const { content } = await apiFetch<{ content: string }>(`${endpoint}/document/preview`, { method: "POST", body });
      setDraft(content);
      setStatus("อ่านเอกสารแล้ว ตรวจร่างก่อนบันทึก");
    } catch (value) {
      setError(await handleApiError(value, router));
    } finally {
      setBusy(false);
    }
  }

  return <section aria-labelledby="curriculum-document-title" className="work-surface space-y-4">
    <form onSubmit={readDocument} className="grid items-start gap-5 xl:grid-cols-2">
      <div>
        <h3 id="curriculum-document-title" className="text-lg font-semibold">อ่านเอกสารด้วย OCR</h3>
        <p className="mt-2 text-sm text-gray-700">เลือกเอกสารหนึ่งไฟล์ต่อหลักสูตร แล้วตรวจข้อความที่อ่านได้ก่อนบันทึก</p>
        <p id="curriculum-document-formats" className="mt-2 text-sm text-gray-600">รองรับ PDF, JPG และ PNG สูงสุด 10 MB โดย PDF มีได้ไม่เกิน 10 หน้า</p>
      </div>
      <div className="min-w-0 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <label htmlFor="curriculum-document" className="block text-sm font-medium">ไฟล์เอกสารหลักสูตร</label>
        <input id="curriculum-document" ref={input} type="file" required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" aria-describedby="curriculum-document-formats" disabled={busy || draft !== null} className="block w-full min-w-0 text-sm file:me-3 file:min-h-11 file:rounded-lg file:border file:border-blue-200 file:bg-white file:px-3 file:font-medium file:text-blue-700" onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setDraft(null);
          setError(null);
          setStatus("");
        }} />
        <button disabled={!file || busy || draft !== null} className={actionClass}>{busy ? "กำลังอ่านข้อความ…" : "อ่านข้อความ"}</button>
      </div>
    </form>
    {error && <p role="alert">{error}</p>}
    {status && <p role="status" className="text-sm">{status}</p>}
    {draft !== null && <CurriculumDraftForm endpoint={endpoint} draft={{ content: draft }} contentLabel="ข้อความจาก OCR"
      onCancel={() => { setDraft(null); setStatus(""); }}
      onSaved={() => {
        setDraft(null);
        setFile(null);
        if (input.current) input.current.value = "";
        setStatus("บันทึกหลักสูตรแล้ว");
        onSaved();
      }}
    />}
  </section>;
}
