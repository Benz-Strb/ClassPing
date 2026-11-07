"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { readAdminText, type CatalogEntry, type CatalogKind } from "@/lib/admin";

const TITLES = { curricula: "หลักสูตร", reference: "ข้อมูลกลาง", knowledge: "แหล่งความรู้มหาวิทยาลัย" };
const EMPTY = { code: "", name: "", year: "2569", category: "", url: "", content: "", active: true };
const inputClass = "mt-1 w-full rounded-md border bg-white px-3 py-2";

export function AdminCatalogView({ kind }: { kind: CatalogKind }) {
  const router = useRouter();
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [version, setVersion] = useState(0);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch<CatalogEntry[]>(`/admin/catalog/${kind}`)
      .then((rows) => { if (!cancelled) setEntries(rows); })
      .catch(async (value: unknown) => { const message = await handleApiError(value, router); if (!cancelled) setError(message); });
    return () => { cancelled = true; };
  }, [kind, router, version]);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setStatus("");
    const body = {
      name: form.name, content: form.content, active: form.active,
      ...(kind !== "knowledge" && { code: form.code }),
      ...(kind === "curricula" && { year: Number(form.year) }),
      ...(kind === "reference" && { category: form.category }),
      ...(kind === "knowledge" && { url: form.url }),
    };
    try {
      const row = await apiFetch<CatalogEntry>(`/admin/catalog/${kind}${editing ? `/${editing}` : ""}`, { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      setEntries((current) => [...(current ?? []).filter((item) => item.id !== row.id), row].sort((a, b) => a.name.localeCompare(b.name, "th")));
      setStatus(kind === "knowledge" ? form.active ? "บันทึกและอัปเดตข้อมูลแชทแล้ว" : "บันทึกและนำออกจากแชทแล้ว" : editing ? "แก้ไขรายการแล้ว" : "เพิ่มรายการแล้ว"); setEditing(null); setForm(EMPTY);
    } catch (value) { setError(await handleApiError(value, router)); }
    finally { setBusy(false); }
  }
  async function importCsv(event: React.FormEvent) {
    event.preventDefault(); if (!csvFile) return;
    setBusy(true); setError(null); setStatus("");
    try {
      const csv = await readAdminText(csvFile);
      const result = await apiFetch<{ imported: number }>(`/admin/catalog/${kind}/import`, { method: "POST", body: JSON.stringify({ csv }) });
      setStatus(`นำเข้า ${result.imported} รายการแล้ว`); setCsvFile(null);
      if (importInput.current) importInput.current.value = "";
      setVersion((current) => current + 1);
    } catch (value) { setError(value instanceof Error && !(value instanceof ApiError) ? value.message : await handleApiError(value, router)); }
    finally { setBusy(false); }
  }
  async function uploadText(file: File) {
    setBusy(true); setError(null); setStatus("");
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("ไฟล์ต้องไม่เกิน 25 MB");
      const body = new FormData();
      body.append("file", file);
      const result = await apiFetch<{ name: string; content: string }>("/admin/catalog/knowledge/extract", { method: "POST", body });
      setForm((current) => ({ ...current, content: result.content, name: current.name || result.name }));
      setStatus(`อ่านไฟล์ ${file.name} แล้ว กรุณาตรวจเนื้อหาและกดบันทึก`);
    } catch (value) { setError(value instanceof Error && !(value instanceof ApiError) ? value.message : await handleApiError(value, router)); }
    finally { setBusy(false); }
  }
  function edit(row: CatalogEntry) {
    setEditing(row.id); setForm({ code: row.code ?? "", name: row.name, year: String(row.year ?? 2569), category: row.category ?? "", url: row.url ?? "", content: row.content, active: row.active });
    setStatus(""); nameInput.current?.focus();
  }
  return <section aria-labelledby="catalog-title" className="space-y-4">
    <div><h2 id="catalog-title" className="text-xl font-semibold">{TITLES[kind]}</h2>
      <p className="text-sm text-gray-600">{kind === "knowledge" ? "รายการที่เปิดใช้งานใช้ตอบคำถามใน DPU Chat สำหรับทุกคน รวมผู้ที่ไม่ได้เข้าสู่ระบบ" : "เพิ่ม แก้ไข และนำเข้าข้อมูลจาก CSV UTF-8"}</p></div>
    {error && <p className="text-red-700" role="alert">{error}</p>}
    {status && <p className="text-green-800" role="status">{status}</p>}
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="admin-catalog-view space-y-4">
        {entries === null ? !error && <p role="status">กำลังโหลดข้อมูล...</p> : !entries.length ? <p className="text-gray-600">ยังไม่มีรายการ</p> :
          <ul className="divide-y rounded-lg border bg-white">{entries.map((row) => <li key={row.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-medium">{row.code && `${row.code} · `}{row.name}</h3><span className={`rounded px-2 py-1 text-xs ${row.active ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-600"}`}>{row.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span></div>
            {row.year && <p className="text-sm text-gray-600">ปีหลักสูตร {row.year}</p>}
            {row.category && <p className="text-sm text-gray-600">หมวด {row.category}</p>}
            {row.url && <a href={row.url} target="_blank" rel="noopener noreferrer" className="block break-all text-sm text-blue-700 underline">{row.url}</a>}
            {row.content && <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-gray-600">{row.content}</p>}
            {kind === "knowledge" && <p className="text-sm text-gray-600">{row.ragStatus === "synced" ? "พร้อมใช้ในแชท" : row.ragStatus === "inactive" ? "ไม่ใช้ในแชท" : "ยังไม่ได้นำไปใช้ในแชท — แก้ไขและบันทึกเพื่อนำเข้า"}</p>}
            <button type="button" disabled={busy} onClick={() => edit(row)} className="text-sm text-blue-700 underline disabled:opacity-50">แก้ไขรายการ</button>
          </li>)}</ul>}
        {kind !== "knowledge" && <form onSubmit={importCsv} className="space-y-3 rounded-lg border bg-gray-50 p-4">
          <h3 className="font-medium">นำเข้ารายการใหม่</h3>
          <p className="text-sm text-gray-600">CSV UTF-8 ไม่เกิน 200 KB และ 500 รายการ ตรวจทั้งไฟล์ก่อนบันทึก รหัสซ้ำจะไม่นำเข้าทั้งชุด</p>
          <a download href={`/admin-${kind}-template.csv`} className="inline-block text-sm text-blue-700 underline">ดาวน์โหลดไฟล์ตัวอย่าง</a>
          <label className="block text-sm">ไฟล์ CSV<input ref={importInput} required disabled={busy || entries === null} type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full" /></label>
          <button disabled={busy || !csvFile || entries === null} className="rounded border bg-white px-4 py-2 disabled:opacity-50">{busy ? "กำลังดำเนินการ..." : "นำเข้า CSV"}</button>
        </form>}
      </div>
      <form onSubmit={save} className="space-y-3 rounded-lg border bg-white p-4">
        <h3 className="font-medium">{editing ? "แก้ไขรายการ" : "เพิ่มรายการ"}</h3>
        <fieldset disabled={busy || entries === null} className="space-y-3 disabled:opacity-60">
          <label className="block text-sm">ชื่อ<input ref={nameInput} required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} /></label>
          {kind !== "knowledge" && <label className="block text-sm">รหัส<input required maxLength={60} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className={inputClass} /></label>}
          {kind === "curricula" && <label className="block text-sm">ปีหลักสูตร (พ.ศ. หรือ ค.ศ.)<input required type="number" min={1900} max={3000} step={1} value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} className={inputClass} /></label>}
          {kind === "reference" && <label className="block text-sm">หมวดข้อมูล<input required maxLength={100} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="เช่น คณะ สาขา ระเบียบ" className={inputClass} /></label>}
          {kind === "knowledge" && <>
            <label className="block text-sm">URL อ้างอิง (ถ้ามี)<input type="url" maxLength={2000} pattern="https?://.*" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} className={inputClass} /></label>
            <label className="block text-sm">นำเข้าเนื้อหาจากไฟล์<input type="file" aria-describedby="knowledge-file-help" accept=".pdf,.docx,.txt,.md,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadText(file); event.target.value = ""; }} className="mt-1 block w-full" /></label>
            <p id="knowledge-file-help" className="text-sm text-gray-600">PDF, Word (.docx), TXT, Markdown หรือ CSV ไม่เกิน 25 MB และ 50,000 ตัวอักษร PDF ไม่เกิน 100 หน้า เอกสารสแกนต้องแปลงด้วย OCR ก่อน เนื้อหาจะมาแทนที่ข้อความในช่องด้านล่าง ตรวจสอบก่อนบันทึก</p>
          </>}
          <label className="block text-sm">{kind === "knowledge" ? "เนื้อหาความรู้" : "รายละเอียด"}<textarea required={kind === "knowledge"} maxLength={50000} rows={8} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} className={inputClass} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />{kind === "knowledge" ? "เปิดใช้ตอบคำถามสาธารณะใน DPU Chat" : "เปิดใช้งาน"}</label>
          <div className="flex gap-3"><button className="rounded bg-blue-700 px-4 py-2 text-white">{busy ? "กำลังดำเนินการ..." : "บันทึก"}</button>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm(EMPTY); }} className="rounded border px-3 py-2">ยกเลิก</button>}</div>
        </fieldset>
      </form>
    </div>
  </section>;
}
