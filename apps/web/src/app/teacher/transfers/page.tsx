"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { CatalogEntry } from "@/lib/admin";
import { TransferRequestCard } from "@/components/transfer-request-card";
import {
  buttonClass,
  inputClass,
  openTransferDocument,
  type TransferCurriculum,
  type TransferMapping,
  type TransferRequest,
} from "@/lib/transfers";
const blank = {
  sourceInstitution: "",
  sourceCode: "",
  sourceName: "",
  minCredits: "3",
  targetCode: "",
  targetName: "",
  targetCredits: "3",
};

export default function TeacherTransfersPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [docs, setDocs] = useState<TransferCurriculum[]>([]);
  const [mappings, setMappings] = useState<TransferMapping[]>([]);
  const [requests, setRequests] = useState<TransferRequest[] | null>(null);
  const [curriculumId, setCurriculumId] = useState("");
  const [fields, setFields] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const [c, d, m, r] = await Promise.all([
      apiFetch<CatalogEntry[]>("/teacher/curricula"),
      apiFetch<TransferCurriculum[]>("/transfers/curricula"),
      apiFetch<TransferMapping[]>("/transfers/mappings"),
      apiFetch<TransferRequest[]>("/transfers/requests"),
    ]);
    setCatalog(c.filter((entry) => entry.active));
    setDocs(d);
    setMappings(m);
    setRequests(r);
  }
  useEffect(() => {
    Promise.all([
      apiFetch<CatalogEntry[]>("/teacher/curricula"),
      apiFetch<TransferCurriculum[]>("/transfers/curricula"),
      apiFetch<TransferMapping[]>("/transfers/mappings"),
      apiFetch<TransferRequest[]>("/transfers/requests"),
    ])
      .then(([c, d, m, r]) => {
        setCatalog(c.filter((entry) => entry.active));
        setDocs(d);
        setMappings(m);
        setRequests(r);
      })
      .catch(async (e) => setError(await handleApiError(e, router)));
  }, [router]);
  async function mutate(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">เทียบโอนรายวิชา</h2>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <section className="space-y-3 rounded border bg-white p-4">
        <h3 className="font-semibold">หลักสูตรและชุดจับคู่</h3>
        <p>
          เลือกหลักสูตรจาก{" "}
          <Link href="/teacher/curricula" className="text-blue-700 underline">
            หน้าจัดการหลักสูตร
          </Link>{" "}
          แล้วแนบเอกสารหลักสูตร ก่อนให้นักศึกษายื่นคำขอ
        </p>
        <label className="block">
          หลักสูตร
          <select
            className={inputClass}
            value={curriculumId}
            onChange={(e) => setCurriculumId(e.target.value)}
          >
            <option value="">เลือกหลักสูตร</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name} · {c.year}
              </option>
            ))}
          </select>
        </label>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file || !curriculumId) return;
            if (!file.size || file.size > 10 * 1024 * 1024) {
              setError("ไฟล์ต้องไม่เกิน 10 MB");
              return;
            }
            const form = new FormData();
            form.set("document", file);
            void mutate(async () => {
              await apiFetch(`/transfers/curricula/${curriculumId}/document`, {
                method: "POST",
                body: form,
              });
              setFile(null);
              setFileKey((v) => v + 1);
            });
          }}
        >
          <label className="block">
            เอกสารหลักสูตร PDF/JPG/PNG ไม่เกิน 10 MB
            <input
              key={fileKey}
              required
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="block w-full"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button disabled={busy || !curriculumId} className={buttonClass}>
            อัปโหลดหลักสูตรเวอร์ชันใหม่
          </button>
        </form>
        {docs
          .filter((d) => d.curriculumId === curriculumId)
          .map((doc) => (
            <p key={doc.id}>
              เอกสารล่าสุด:{" "}
              <button
                type="button"
                className="text-blue-700 underline"
                onClick={() =>
                  void mutate(() =>
                    openTransferDocument(
                      `/transfers/curricula/${doc.id}/document`,
                    ),
                  )
                }
              >
                {doc.fileName}
              </button>
            </p>
          ))}
        <form
          className="grid gap-3 border-t pt-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate(async () => {
              await apiFetch("/transfers/mappings", {
                method: "POST",
                body: JSON.stringify({
                  ...fields,
                  curriculumId,
                  minCredits: Number(fields.minCredits),
                  targetCredits: Number(fields.targetCredits),
                  active: true,
                }),
              });
              setFields(blank);
            });
          }}
        >
          <h4 className="font-medium sm:col-span-2">
            เพิ่ม/ปรับคู่เทียบ (สถาบันและรหัสเดิมซ้ำจะปรับคู่เดิม)
          </h4>
          {(Object.keys(blank) as (keyof typeof blank)[]).map((key) => (
            <label key={key}>
              {
                {
                  sourceInstitution: "สถาบันเดิม",
                  sourceCode: "รหัสวิชาเดิม",
                  sourceName: "ชื่อวิชาเดิม",
                  minCredits: "หน่วยกิตเดิมขั้นต่ำ",
                  targetCode: "รหัสวิชาในหลักสูตร",
                  targetName: "ชื่อวิชาในหลักสูตร",
                  targetCredits: "หน่วยกิตที่จะเทียบโอน",
                }[key]
              }
              <input
                required
                className={inputClass}
                type={key.endsWith("Credits") ? "number" : "text"}
                min={0.5}
                max={30}
                step={0.5}
                maxLength={key.endsWith("Code") ? 60 : 200}
                value={fields[key]}
                onChange={(e) =>
                  setFields({ ...fields, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <p className="text-sm text-gray-600 sm:col-span-2">
            ตรวจคู่เทียบกับเอกสารหลักสูตรก่อนบันทึก
            เกณฑ์เกรดพิจารณาจากเอกสารแต่ละคำขอ
            การแก้ชุดจับคู่ไม่เปลี่ยนคำขอที่ยื่นแล้ว
          </p>
          <button disabled={busy || !curriculumId} className={buttonClass}>
            บันทึกชุดจับคู่
          </button>
        </form>
        {mappings
          .filter((m) => m.curriculumId === curriculumId)
          .map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t py-2"
            >
              <p>
                {m.sourceInstitution}: {m.sourceCode} ({m.sourceName}, ขั้นต่ำ{" "}
                {m.minCredits}) → {m.targetCode} · {m.targetName} (
                {m.targetCredits} หน่วยกิต)
              </p>
              <button
                disabled={busy}
                className="rounded border px-3 py-1"
                onClick={() =>
                  void mutate(() =>
                    apiFetch(`/transfers/mappings/${m.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ active: !m.active }),
                    }),
                  )
                }
              >
                {m.active ? "ปิดใช้งานคู่เทียบ" : "เปิดใช้งานคู่เทียบ"}
              </button>
            </div>
          ))}
      </section>
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">คำขอทั้งหมด</h3>
        {requests === null ? (
          <p role="status">กำลังโหลด...</p>
        ) : requests.length === 0 ? (
          <p>ยังไม่มีคำขอ</p>
        ) : (
          requests.map((r) => (
            <TransferRequestCard
              key={r.id}
              request={r}
              reviewer
              onReviewed={load}
            />
          ))
        )}
      </section>
    </div>
  );
}
