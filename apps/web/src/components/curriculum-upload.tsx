"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { openTransferDocument, type TransferCurriculum, type TransferDraft, type ExtractedCourse } from "@/lib/transfers";
import type { CatalogEntry } from "@/lib/admin";
const input = "w-full rounded-lg border border-gray-400 bg-white px-3 py-2";
const button = "min-h-11 rounded-lg border px-4 py-2 disabled:opacity-50";
const primary = `${button} bg-purple-700 text-white`;
const blankCourse = (): ExtractedCourse => ({
  sourceCode: "",
  sourceName: "",
  credits: 3,
  grade: "",
});
const emptyDraft = (): TransferDraft => ({
  sourceInstitution: "",
  sourceMajor: "",
  courses: [blankCourse()],
  ocrText: "",
  warnings: [],
});

const errorText = (error: unknown) => error instanceof Error ? error.message : "เรียกระบบไม่สำเร็จ";
export function CurriculumUpload({ onSaved }: { onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<TransferDraft>(emptyDraft);
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear() + 543);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [docs, setDocs] = useState<TransferCurriculum[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [curriculumId, setCurriculumId] = useState("");
  const reload = useCallback(async () => {
    const [documents, entries] = await Promise.all([apiFetch<TransferCurriculum[]>("/transfers/curricula"), apiFetch<CatalogEntry[]>("/teacher/curricula")]);
    setDocs(documents); setCatalog(entries.filter(entry => entry.active));
  }, []);
  useEffect(() => { void Promise.resolve().then(reload).catch(error => setError(errorText(error))); }, [reload]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function read(selected: File | null) {
    setFile(selected);
    setDraft(emptyDraft());
    setName("");
    if (!selected) return;
    await run(async () => {
      if (selected.size > 10 * 1024 * 1024)
        throw new Error("ไฟล์ต้องไม่เกิน 10 MB");
      setReading(true);
      try {
        const form = new FormData();
        form.set("document", selected);
        const result = await apiFetch<TransferDraft>("/transfers/preview", {
          method: "POST",
          body: form,
        });
        setDraft({
          ...result,
          courses: result.courses.length ? result.courses : [blankCourse()],
        });
        setName(result.sourceMajor || selected.name.replace(/\.[^.]+$/, ""));
      } finally {
        setReading(false);
      }
    });
  }
  async function saveCurriculum(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!file) throw new Error("กรุณาแนบไฟล์หลักสูตร");
      const form = new FormData();
      form.set("document", file);
      if (draft.courses.some(course => !course.studyYear)) throw new Error("กรุณาระบุชั้นปี 1–4 ให้ทุกรายวิชาก่อนบันทึก");
      form.set("payload", JSON.stringify(curriculumId ? draft : { name, year, draft }));
      await apiFetch(curriculumId ? `/transfers/curricula/${curriculumId}/document` : "/transfers/curricula", { method: "POST", body: form });
      await reload();
      onSaved();
      setSuccess("บันทึกหลักสูตรและรายวิชาแล้ว");
      setFile(null);
      setDraft(emptyDraft());
      setName("");
    });
  }

  return <div className="space-y-6">
    {error && <p role="alert">{error}</p>}
    {success && <p role="status" className="surface-feedback">{success}</p>}
    {reading && <p role="status">กำลังอ่านหลักสูตรด้วย OCR...</p>}
              <form
                onSubmit={saveCurriculum}
                className="work-surface space-y-4"
              >
                <h2 className="text-xl font-semibold">อัปโหลดหลักสูตรและอ่านด้วย OCR</h2>
                <label className="form-field"><span>หลักสูตร</span><select className={input} disabled={busy} value={curriculumId} onChange={event => setCurriculumId(event.target.value)}><option value="">สร้างหลักสูตรใหม่จากเอกสาร</option>{catalog.map(entry => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name} · {entry.year}</option>)}</select></label>
                <p className="tool-note">
                  PDF 1–100 หน้า, JPG หรือ PNG ไม่เกิน 10 MB ตรวจแก้ข้อมูล OCR
                  ก่อนบันทึก
                </p>
                <label className="block space-y-2">
                  <span>เอกสารหลักสูตร</span>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={busy}
                    onChange={(e) => void read(e.target.files?.[0] ?? null)}
                  />
                </label>
                {file && (
                  <>
                    {draft.warnings.map((w) => (
                      <p key={w} className="tool-note">
                        {w}
                      </p>
                    ))}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[
                        { label: "ชื่อหลักสูตร", value: name, update: setName },
                        {
                          label: "สถาบัน",
                          value: draft.sourceInstitution,
                          update: (value: string) =>
                            setDraft((d) => ({
                              ...d,
                              sourceInstitution: value,
                            })),
                        },
                        {
                          label: "สาขา",
                          value: draft.sourceMajor,
                          update: (value: string) =>
                            setDraft((d) => ({ ...d, sourceMajor: value })),
                        },
                      ].map((f) => (
                        <label key={f.label} className="space-y-1">
                          <span>{f.label}</span>
                          <input
                            required
                            maxLength={200}
                            className={input}
                            disabled={busy}
                            value={f.value}
                            onChange={(e) => f.update(e.target.value)}
                          />
                        </label>
                      ))}
                      <label className="space-y-1">
                        <span>ปีหลักสูตร</span>
                        <input
                          required
                          type="number"
                          min={1900}
                          max={2700}
                          className={input}
                          disabled={busy}
                          value={year}
                          onChange={(e) => setYear(Number(e.target.value))}
                        />
                      </label>
                    </div>
                    <h3 className="font-semibold">
                      รายวิชาที่อ่านได้ ({draft.courses.length})
                    </h3>
                    {draft.courses.map((course, index) => (
                      <fieldset
                        key={index}
                        className="grid gap-3 border-t py-3 sm:grid-cols-4"
                      >
                        <legend>รายวิชาที่ {index + 1}</legend>
                        <label className="space-y-1"><span>ชั้นปี</span><select required disabled={busy} className={input} value={course.studyYear ?? ''} onChange={event => setDraft(value => ({ ...value, courses: value.courses.map((row, i) => i === index ? { ...row, studyYear: event.target.value ? Number(event.target.value) : null } : row) }))}><option value="">เลือกชั้นปี</option>{[1,2,3,4].map(level => <option key={level} value={level}>ปี {level}</option>)}</select></label>
                        {(["sourceCode", "sourceName", "credits"] as const).map(
                          (key) => (
                            <label
                              key={key}
                              className={`space-y-1 ${key === "sourceName" ? "sm:col-span-2" : ""}`}
                            >
                              <span>
                                {
                                  {
                                    sourceCode: "รหัสวิชา",
                                    sourceName: "ชื่อวิชา",
                                    credits: "หน่วยกิต",
                                  }[key]
                                }
                              </span>
                              <input
                                required
                                className={input}
                                disabled={busy}
                                type={key === "credits" ? "number" : "text"}
                                min={key === "credits" ? 0.5 : undefined}
                                max={key === "credits" ? 30 : undefined}
                                step={key === "credits" ? 0.5 : undefined}
                                value={course[key]}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    courses: d.courses.map((c, i) =>
                                      i === index
                                        ? {
                                            ...c,
                                            [key]:
                                              key === "credits"
                                                ? Number(e.target.value)
                                                : e.target.value,
                                          }
                                        : c,
                                    ),
                                  }))
                                }
                              />
                            </label>
                          ),
                        )}
                        <button
                          type="button"
                          className={button}
                          disabled={busy || draft.courses.length === 1}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              courses: d.courses.filter((_, i) => i !== index),
                            }))
                          }
                        >
                          ลบวิชาที่ {index + 1}
                        </button>
                      </fieldset>
                    ))}
                    <button
                      type="button"
                      disabled={busy || draft.courses.length >= 1000}
                      className={button}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          courses: [...d.courses, blankCourse()],
                        }))
                      }
                    >
                      เพิ่มรายวิชา
                    </button>
                    {draft.ocrText && (
                      <details>
                        <summary className="cursor-pointer py-2">
                          ข้อความ OCR ต้นฉบับ
                        </summary>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-sm">
                          {draft.ocrText}
                        </pre>
                      </details>
                    )}
                    <div>
                      <button disabled={busy} className={primary}>
                        ยืนยันและบันทึกหลักสูตร
                      </button>
                    </div>
                  </>
                )}
              </form>
    <section className="work-surface space-y-4"><h2>หลักสูตรแยกตามชั้นปี</h2>
      {!docs.length && <p className="tool-note">ยังไม่มีเอกสารหลักสูตร</p>}
      {docs.map(doc => <details key={doc.id} className="border-t py-4"><summary className="cursor-pointer font-medium">{doc.curriculumName} · ปีหลักสูตร {doc.year} · {doc.courses?.length ?? 0} วิชา</summary>
        <button type="button" className={button} onClick={() => void run(async () => { await openTransferDocument(`/transfers/curricula/${doc.id}/document`); })}>ดูเอกสารต้นฉบับ</button>
        {[1, 2, 3, 4, null].map(level => { const courses = (doc.courses ?? []).filter(course => (course.studyYear ?? null) === level); return <section key={level ?? 'unknown'} className="space-y-3 py-4"><h3 className="font-medium">{level ? `ชั้นปีที่ ${level}` : 'ยังไม่ระบุชั้นปี'}</h3>{courses.length ? <ul className="divide-y">{courses.map(course => <li key={course.sourceCode} className="py-3">{course.sourceCode} · {course.sourceName}<span className="tool-note block">{course.credits} หน่วยกิต</span></li>)}</ul> : <p className="tool-note">ไม่มีรายวิชา</p>}</section>; })}
      </details>)}
    </section>
  </div>;
}
