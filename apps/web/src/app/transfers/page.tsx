"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { TransferRequestCard } from "@/components/transfer-request-card";
import {
  buttonClass,
  inputClass,
  openTransferDocument,
  type TransferCurriculum,
  type TransferRequest,
} from "@/lib/transfers";
const emptyCourse = () => ({
  sourceCode: "",
  sourceName: "",
  credits: "3",
  grade: "",
});

export default function TransfersPage() {
  const router = useRouter();
  const [curricula, setCurricula] = useState<TransferCurriculum[]>([]);
  const [requests, setRequests] = useState<TransferRequest[] | null>(null);
  const [documentId, setDocumentId] = useState("");
  const [institution, setInstitution] = useState("");
  const [courses, setCourses] = useState([emptyCourse()]);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([
      apiFetch<TransferCurriculum[]>("/transfers/curricula"),
      apiFetch<TransferRequest[]>("/transfers/requests"),
    ])
      .then(([docs, rows]) => {
        setCurricula(docs);
        setRequests(rows);
      })
      .catch(async (e) => setError(await handleApiError(e, router)));
  }, [router]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!file || file.size > 10 * 1024 * 1024 || file.size === 0) {
      setError("แนบ PDF/JPG/PNG ไม่เกิน 10 MB");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("document", file);
      form.set(
        "payload",
        JSON.stringify({
          curriculumDocumentId: documentId,
          sourceInstitution: institution,
          courses: courses.map((c) => ({ ...c, credits: Number(c.credits) })),
        }),
      );
      await apiFetch("/transfers/requests", { method: "POST", body: form });
      setFile(null);
      setFileKey((v) => v + 1);
      setCourses([emptyCourse()]);
      setRequests(await apiFetch<TransferRequest[]>("/transfers/requests"));
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">ขอเทียบโอนรายวิชา</h1>
      <p>
        แนบเอกสาร → เทียบหลักสูตรและชุดจับคู่ → รอแอดมินตรวจอนุมัติ
        ผลจับคู่เป็นข้อเสนอประกอบการพิจารณา
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {requests === null ? (
        <p role="status">กำลังโหลด...</p>
      ) : (
        <>
          {curricula.length === 0 ? (
            <p>
              ยังไม่มีหลักสูตรพร้อมเอกสารสำหรับยื่นเทียบโอน กรุณาติดต่อผู้ดูแล
            </p>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-4 rounded border bg-white p-4"
            >
              <label className="block">
                หลักสูตรปลายทาง
                <select
                  required
                  className={inputClass}
                  value={documentId}
                  onChange={(e) => {
                    setDocumentId(e.target.value);
                    setInstitution("");
                  }}
                >
                  <option value="">เลือกหลักสูตร</option>
                  {curricula.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.curriculumName} · ปี {c.year}
                    </option>
                  ))}
                </select>
              </label>
              {documentId && (
                <button
                  type="button"
                  disabled={busy}
                  className="text-blue-700 underline"
                  onClick={async () => {
                    try {
                      await openTransferDocument(
                        `/transfers/curricula/${documentId}/document`,
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "เปิดเอกสารไม่สำเร็จ",
                      );
                    }
                  }}
                >
                  ดูเอกสารหลักสูตรก่อนยื่น
                </button>
              )}
              <label className="block">
                สถาบันเดิมที่มีชุดจับคู่
                <select
                  required
                  className={inputClass}
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                >
                  <option value="">เลือกสถาบันเดิม</option>
                  {(
                    curricula.find((c) => c.id === documentId)
                      ?.sourceInstitutions ?? []
                  ).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {documentId &&
                !curricula.find((c) => c.id === documentId)?.sourceInstitutions
                  .length && (
                  <p>หลักสูตรนี้ยังไม่มีชุดจับคู่ กรุณาติดต่อผู้ดูแล</p>
                )}
              {courses.map((course, index) => (
                <fieldset
                  key={index}
                  className="grid gap-2 rounded border p-3 sm:grid-cols-2"
                >
                  <legend>รายวิชาเดิมที่ {index + 1}</legend>
                  {(
                    ["sourceCode", "sourceName", "credits", "grade"] as const
                  ).map((field) => (
                    <label key={field}>
                      {
                        {
                          sourceCode: "รหัสวิชา",
                          sourceName: "ชื่อวิชา",
                          credits: "หน่วยกิต",
                          grade: "เกรดตามเอกสาร",
                        }[field]
                      }
                      <input
                        required={field !== "grade"}
                        type={field === "credits" ? "number" : "text"}
                        min={field === "credits" ? 0.5 : undefined}
                        max={field === "credits" ? 30 : undefined}
                        step={field === "credits" ? 0.5 : undefined}
                        maxLength={
                          field === "sourceCode"
                            ? 60
                            : field === "grade"
                              ? 20
                              : 200
                        }
                        className={inputClass}
                        value={course[field]}
                        onChange={(e) =>
                          setCourses(
                            courses.map((c, i) =>
                              i === index
                                ? { ...c, [field]: e.target.value }
                                : c,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                  {courses.length > 1 && (
                    <button
                      type="button"
                      className="text-red-700"
                      onClick={() =>
                        setCourses(courses.filter((_, i) => i !== index))
                      }
                    >
                      ลบรายวิชาที่ {index + 1}
                    </button>
                  )}
                </fieldset>
              ))}
              <button
                type="button"
                disabled={courses.length >= 50 || busy}
                className="rounded border px-3 py-2"
                onClick={() => setCourses([...courses, emptyCourse()])}
              >
                เพิ่มรายวิชา
              </button>
              <label className="block">
                เอกสารผลการเรียน/รายละเอียดรายวิชาเดิม (รวมเป็นไฟล์เดียว ไม่เกิน
                10 MB)
                <input
                  key={fileKey}
                  required
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="block w-full"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <p className="text-sm text-gray-600">
                กรอกข้อมูลตามเอกสาร
                ระบบใช้ชื่อสถาบันและรหัสวิชาตรงกับชุดจับคู่ที่ผู้ดูแลกำหนด
                หากไม่พบคู่เทียบให้ติดต่อผู้ดูแลก่อนยื่นใหม่
              </p>
              <button disabled={busy} className={buttonClass}>
                {busy ? "กำลังส่ง..." : "ส่งคำขอและดูผลจับคู่"}
              </button>
            </form>
          )}
          <h2 className="text-xl font-semibold">คำขอของฉัน</h2>
          {requests.length === 0 && <p>ยังไม่มีคำขอ</p>}
          {requests.map((request) => (
            <TransferRequestCard key={request.id} request={request} />
          ))}
        </>
      )}
    </main>
  );
}
