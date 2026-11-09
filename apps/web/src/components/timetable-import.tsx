"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { WEEKDAYS } from "@/lib/time";
import type { Course, Room } from "@/lib/types";

interface Row {
  courseCode: string; courseName: string; section: string; teacherName: string;
  weekday: number | null; startTime: string; endTime: string; roomName: string;
}
interface Result { index: number; status: string; message: string }
const blank = (): Row => ({ courseCode: '', courseName: '', section: '', teacherName: '', weekday: null, startTime: '', endTime: '', roomName: '' });

export function TimetableImport({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState<'read' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    apiFetch<Room[]>('/rooms').then(value => { if (active) setRooms(value); })
      .catch(async cause => { const message = await handleApiError(cause, router); if (active) setError(message); });
    return () => { active = false; };
  }, [open, router]);
  function update(index: number, patch: Partial<Row>) {
    setRows(value => value.map((row, i) => i === index ? { ...row, ...patch } : row));
    setResults([]);
  }
  async function read() {
    if (!file || !courseId) return;
    if (file.size > 10 * 1024 * 1024) { setError('ไฟล์ต้องไม่เกิน 10 MB'); return; }
    setError(null); setBusy('read'); setResults([]);
    try {
      const body = new FormData(); body.append('document', file);
      const draft = await apiFetch<{ rows: Row[]; warnings: string[]; ocrText: string }>(`/courses/${courseId}/timetable/preview`, { method: 'POST', body });
      setRows(draft.rows); setWarnings(draft.warnings); setOcrText(draft.ocrText);
    } catch (cause) { setError(await handleApiError(cause, router)); }
    finally { setBusy(null); }
  }
  async function save() {
    if (!courseId) return;
    setBusy('save'); setError(null);
    try {
      const response = await apiFetch<{ results: Result[] }>(`/courses/${courseId}/timetable/import`, { method: 'POST', body: JSON.stringify({ rows }) });
      setResults(response.results);
    } catch (cause) { setError(await handleApiError(cause, router)); }
    finally { setBusy(null); }
  }
  if (!open) return <button type="button" className="rounded-lg border px-4 py-2" onClick={() => setOpen(true)}>อัปโหลดตารางเรียน</button>;
  return <section className="work-surface space-y-4" aria-label="นำเข้าตารางเรียน">
    <div className="surface-heading"><h2>อัปโหลดตารางเรียน</h2><button type="button" disabled={!!busy} className="rounded-lg border px-4 py-2" onClick={() => setOpen(false)}>ปิด</button></div>
    <p className="tool-note">เลือก PDF, JPG หรือ PNG ไม่เกิน 10 MB อ่านข้อมูลแล้วตรวจแก้ก่อนบันทึก เฉพาะรหัสวิชาและกลุ่มที่ตรงกับวิชานี้</p>
    <label className="form-field"><span>นำเข้าตารางให้รายวิชา</span><select value={courseId} disabled={!!busy} onChange={event => { setCourseId(event.target.value); setRows([]); setResults([]); setWarnings([]); setOcrText(''); setError(null); }}><option value="">เลือกรายวิชา</option>{courses.map(course => <option key={course.id} value={course.id}>{course.code} · {course.name}{course.section ? ` · กลุ่ม ${course.section}` : ''}</option>)}</select></label>
    {!courses.length && <p className="tool-note">กรุณาสร้างรายวิชาก่อนนำเข้าตารางเรียน</p>}
    <label className="form-field"><span>ไฟล์ตารางเรียน</span><input type="file" accept="application/pdf,image/jpeg,image/png" disabled={!!busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setRows([]); setResults([]); setOcrText(''); setWarnings([]); setError(null); }} /></label>
    <button type="button" disabled={!file || !courseId || !!busy} className="rounded-lg border px-4 py-2" onClick={() => void read()}>{busy === 'read' ? 'กำลังอ่านตาราง…' : 'อ่านข้อมูลจากไฟล์'}</button>
    {error && <p role="alert" className="surface-feedback">{error}</p>}
    {busy && <p role="status" className="tool-note">{busy === 'read' ? 'กำลังอ่านข้อความ กรุณารอสักครู่' : 'กำลังบันทึกตาราง'}</p>}
    {warnings.map(warning => <p className="tool-note" key={warning}>{warning}</p>)}
    {ocrText && <details><summary className="cursor-pointer">ข้อความที่อ่านได้</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap text-sm">{ocrText}</pre></details>}
    {rows.length > 0 && <div className="overflow-x-auto"><table>
      <caption className="text-left font-medium">ตรวจข้อมูลก่อนบันทึก</caption>
      <thead><tr>{['รหัสวิชา', 'กลุ่ม', 'วัน', 'เริ่ม', 'สิ้นสุด', 'ห้อง', 'ผลบันทึก', ''].map((label, i) => <th key={i} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>
        <td><input className="w-28" aria-label={`รหัสวิชา แถว ${index + 1}`} disabled={!!busy} value={row.courseCode} onChange={e => update(index, { courseCode: e.target.value })} /></td>
        <td><input className="w-20" aria-label={`กลุ่ม แถว ${index + 1}`} disabled={!!busy} value={row.section} onChange={e => update(index, { section: e.target.value })} /></td>
        <td><select aria-label={`วัน แถว ${index + 1}`} disabled={!!busy} value={row.weekday ?? ''} onChange={e => update(index, { weekday: e.target.value === '' ? null : Number(e.target.value) })}><option value="">เลือกวัน</option>{WEEKDAYS.map((day, n) => <option key={day} value={n}>{day}</option>)}</select></td>
        {(['startTime', 'endTime'] as const).map((key, i) => <td key={key}><input type="time" aria-label={`${i ? 'เวลาจบ' : 'เวลาเริ่ม'} แถว ${index + 1}`} disabled={!!busy} value={row[key]} onChange={e => update(index, { [key]: e.target.value })} /></td>)}
        <td><select aria-label={`ห้อง แถว ${index + 1}`} disabled={!!busy} value={row.roomName} onChange={e => update(index, { roomName: e.target.value })}><option value="">เลือกห้อง</option>{row.roomName && !rooms.some(room => room.name === row.roomName) && <option value={row.roomName}>{row.roomName} (ตรวจสอบห้อง)</option>}{rooms.map(room => <option key={room.id} value={room.name}>{room.name}</option>)}</select></td>
        <td><p role="status" className="tool-note">{results.find(result => result.index === index)?.message}</p></td>
        <td><button type="button" disabled={!!busy} aria-label={`ลบแถว ${index + 1}`} onClick={() => { setRows(value => value.filter((_, i) => i !== index)); setResults([]); }} className="rounded-lg border px-3 py-2">ลบ</button></td>
      </tr>)}</tbody>
    </table></div>}
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={!!busy || rows.length >= 100} className="rounded-lg border px-4 py-2" onClick={() => { setRows(value => [...value, blank()]); setResults([]); }}>เพิ่มแถว</button>
      <button type="button" disabled={!!busy || !courseId || !rows.length || results.length > 0 && results.every(result => result.status !== 'failed')} className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => void save()}>ยืนยันและบันทึกตาราง</button>
    </div>
  </section>;
}
