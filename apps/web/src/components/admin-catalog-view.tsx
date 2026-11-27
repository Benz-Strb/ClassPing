"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { readCatalogSpreadsheet } from "@/lib/catalog-spreadsheet";
import { readAdminText, type CatalogEntry, type CatalogKind } from "@/lib/admin";

import { CurriculumContent } from "@/components/curriculum-study-plan";
import { CurriculumDraftForm, type CurriculumDraft } from "@/components/curriculum-draft-form";
import { CurriculumDocumentImport } from "@/components/curriculum-document-import";

const TITLES = { curricula: "หลักสูตร", reference: "ข้อมูลกลาง" };

export function AdminCatalogView({ kind, endpoint = `/admin/catalog/${kind}` }: { kind: CatalogKind; endpoint?: string }) {
  const router = useRouter();
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CurriculumDraft | null>(null);
  const [status, setStatus] = useState("");
  const [version, setVersion] = useState(0);
  const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch<CatalogEntry[]>(endpoint)
      .then((rows) => { if (!cancelled) setEntries(rows); })
      .catch(async (value: unknown) => { const message = await handleApiError(value, router); if (!cancelled) setError(message); });
    return () => { cancelled = true; };
  }, [endpoint, router, version]);

  const isTeacherCurricula = kind === "curricula" && endpoint === "/teacher/curricula";

  async function importSpreadsheet(event: React.FormEvent) {
    event.preventDefault(); if (!spreadsheetFile || busy || draft) return;
    setBusy(true); setImportError(null); setStatus("");
    try {
      const resultFile = isTeacherCurricula && /\.xlsx$/i.test(spreadsheetFile.name)
        ? await readCatalogSpreadsheet(spreadsheetFile)
        : { csv: await readAdminText(spreadsheetFile) };
      if (resultFile.draft) {
        setDraft(resultFile.draft);
        setStatus("อ่านรายงานแล้ว กรุณาระบุรหัสหลักสูตรและตรวจร่างก่อนบันทึก");
        return;
      }
      const result = await apiFetch<{ imported: number }>(`${endpoint}/import`, { method: "POST", body: JSON.stringify({ csv: resultFile.csv }) });
      setStatus(`นำเข้า ${result.imported} รายการแล้ว`); setSpreadsheetFile(null);
      if (importInput.current) importInput.current.value = "";
      setVersion((current) => current + 1);
    } catch (value) { setImportError(value instanceof Error && !(value instanceof ApiError) ? value.message : await handleApiError(value, router)); }
    finally { setBusy(false); }
  }

  return <section aria-labelledby="catalog-title" className="space-y-6 p-1">
    <div>
      <h2 id="catalog-title" className="font-semibold">จัดการ{TITLES[kind]}</h2>
      <p className="mt-1 text-sm text-gray-600">{isTeacherCurricula ? "อ่านเอกสารด้วย OCR หรือนำเข้าหลายรายการจาก CSV และ XLSX" : "นำเข้าข้อมูลจากไฟล์ CSV"}</p>
    </div>
    {error && <p className="text-red-700" role="alert">{error}</p>}

    {isTeacherCurricula && <CurriculumDocumentImport endpoint={endpoint} onSaved={() => setVersion((current) => current + 1)} />}

    <section aria-labelledby="catalog-import-title" className="work-surface space-y-4">
      <form onSubmit={importSpreadsheet}>
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <div>
            <h3 id="catalog-import-title" className="text-lg font-semibold">{isTeacherCurricula ? "นำเข้าจาก CSV หรือ XLSX" : "นำเข้าจากไฟล์ CSV"}</h3>
            <ol className="mt-3 list-decimal space-y-2 ps-5 text-sm text-gray-700">
              <li><a download href={`/admin-${kind}-template.csv`} className="font-medium text-blue-700 underline">ดาวน์โหลดไฟล์ตัวอย่าง</a> แล้วเปิดใน Excel หรือ Google Sheets</li>
              <li>แทนที่แถวตัวอย่างด้วยข้อมูลของคุณ เก็บหัวตารางเดิม แล้วบันทึกเป็น {isTeacherCurricula ? "CSV UTF-8 หรือ Excel (.xlsx)" : "CSV UTF-8"}</li>
              <li>เลือกไฟล์ที่บันทึก แล้วกด <strong>{isTeacherCurricula ? "นำเข้าไฟล์" : "นำเข้า CSV"}</strong></li>
            </ol>
            <p id="catalog-import-limits" className="mt-3 text-sm text-gray-600">สูงสุด 200 KB และ 500 รายการ หากมีรหัสซ้ำ ระบบจะไม่นำเข้าทั้งไฟล์{isTeacherCurricula && " XLSX อ่านจากชีตแรกและรองรับรายงานแผนการศึกษาประจำภาคเรียน"}</p>
          </div>

          <div className="min-w-0 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <label htmlFor="catalog-import-file" className="block text-sm font-medium">{isTeacherCurricula ? "ไฟล์ CSV หรือ XLSX" : "ไฟล์ CSV"}</label>
            <input id="catalog-import-file" ref={importInput} required disabled={busy || draft !== null || entries === null} type="file" accept={isTeacherCurricula ? ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ".csv,text/csv"} aria-describedby="catalog-import-limits" onChange={(event) => { setSpreadsheetFile(event.target.files?.[0] ?? null); setImportError(null); setStatus(""); }} className="block w-full min-w-0 text-sm file:me-3 file:min-h-11 file:rounded-lg file:border file:border-blue-200 file:bg-white file:px-3 file:font-medium file:text-blue-700 enabled:file:cursor-pointer disabled:opacity-60" />
            <button disabled={busy || draft !== null || !spreadsheetFile || entries === null} className="min-h-11 rounded-lg border border-transparent action-filled px-4 py-2 text-sm">{busy ? "กำลังดำเนินการ..." : isTeacherCurricula ? "นำเข้าไฟล์" : "นำเข้า CSV"}</button>
            {importError && <p role="alert">{importError}</p>}
            <p role="status" className="text-sm" hidden={!status}>{status}</p>
          </div>
        </div>
      </form>
      {draft && <CurriculumDraftForm draft={draft} endpoint={endpoint} contentLabel="รายวิชาจากแผนการศึกษา" showStudyPlan
        onCancel={() => { setDraft(null); setStatus(""); }}
        onSaved={() => {
          setDraft(null);
          setSpreadsheetFile(null);
          if (importInput.current) importInput.current.value = "";
          setStatus("บันทึกหลักสูตรแล้ว");
          setVersion((current) => current + 1);
        }}
      />}
    </section>

    <section aria-labelledby="catalog-list-title" className="min-w-0 space-y-4">
      <h3 id="catalog-list-title" className="text-lg font-semibold">รายการ{TITLES[kind]}</h3>
      {entries === null ? !error && <p role="status">กำลังโหลดข้อมูล...</p> : !entries.length ? <p className="surface-feedback">ยังไม่มีรายการ</p> :
        <ul className="grid gap-3 md:grid-cols-2">{entries.map((row) => <li key={row.id} className="space-y-2 rounded-xl border border-[var(--cp-border)] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="min-w-0 font-medium [overflow-wrap:anywhere]">{row.code && `${row.code} · `}{row.name}</h4><span className={`rounded px-2 py-1 text-xs ${row.active ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-600"}`}>{row.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span></div>
          {row.year && <p className="text-sm text-gray-600">ปีหลักสูตร {row.year}</p>}
          {row.category && <p className="text-sm text-gray-600">หมวด {row.category}</p>}
          {row.content && <CurriculumContent content={row.content} />}
        </li>)}</ul>}
    </section>
  </section>;
}
