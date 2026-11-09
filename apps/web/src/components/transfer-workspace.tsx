"use client";

import Link from "next/link";
import { confirmAction } from "@/components/notifications";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  openTransferDocument,
  TRANSFER_STATUS,
  type TransferCurriculum,
  type TransferRequest,
} from "@/lib/transfers";

const input = "w-full rounded-lg border border-gray-400 bg-white px-3 py-2";
const button = "min-h-11 rounded-lg border px-4 py-2 disabled:opacity-50";
const primary = `${button} bg-purple-700 text-white`;
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "เรียกระบบไม่สำเร็จ";

export function TransferWorkspace({ requestId }: { requestId?: string }) {
  const [docs, setDocs] = useState<TransferCurriculum[]>([]);
  const [requests, setRequests] = useState<TransferRequest[] | null>(null);
  const [tab, setTab] = useState<"requests" | "history">(
    "requests",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<
    Record<string, { decision: string; note: string; targetCode?: string }>
  >({});
  const [targetDoc, setTargetDoc] = useState("");
  const [rechecked, setRechecked] = useState(false);
  const load = useCallback(async () => {
    const [documents, rows] = await Promise.all([
      apiFetch<TransferCurriculum[]>("/transfers/curricula"),
      apiFetch<TransferRequest[]>("/transfers/requests"),
    ]);
    setDocs(documents);
    setRequests(rows);
    const current = rows.find(row => row.id === requestId);
    setDecisions(Object.fromEntries((current?.status === 'pending' ? current.items : []).filter(item => item.autoApprovalSuggested && item.match).map(item => [item.id, { decision: 'approved', note: '', targetCode: item.match!.targetCode }])));
    setRechecked(false);
    if (requestId)
      setTargetDoc(
        rows.find((r) => r.id === requestId)?.curriculumDocumentId ?? "",
      );
  }, [requestId]);
  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch((e) => setError(errorText(e)));
  }, [load]);
  const request = requests?.find((r) => r.id === requestId);
  const doc = docs.find((d) => d.id === request?.curriculumDocumentId);
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
  async function assign() {
    await run(async () => {
      await apiFetch(`/transfers/requests/${requestId}/curriculum`, {
        method: "PATCH",
        body: JSON.stringify({ curriculumDocumentId: targetDoc }),
      });
      setDecisions({});
      await load();
      setSuccess("จับคู่รายวิชากับหลักสูตรแล้ว กรุณาตรวจเอกสารก่อนอนุมัติ");
    });
  }
  async function review(event: React.FormEvent) {
    event.preventDefault();
    if (!(await confirmAction('ยืนยันผลพิจารณาทุกรายวิชา? ระบบจะบันทึกสถาบัน วิชา หน่วยกิต และเกรด เพื่อเสนอผลพิจารณาสำหรับคำขอถัดไป', { title: 'ยืนยันผลเทียบโอน', confirmLabel: 'ยืนยันผลพิจารณา' }))) return;
    await run(async () => {
      await apiFetch(`/transfers/requests/${requestId}/review`, {
        method: "POST",
        body: JSON.stringify({
          confirmedRecommendations: rechecked,
          decisions: request!.items.map((item) => ({
            itemId: item.id,
            ...decisions[item.id],
          })),
        }),
      });
      await load();
      setSuccess("บันทึกผลพิจารณาแล้ว นักศึกษาดูผลได้ในแอป");
    });
  }
  const history = (requests ?? []).flatMap((row) =>
    row.items
      .filter((item) => item.decision === "approved" && item.match)
      .map((item) => ({ row, item })),
  );
  const previouslyApproved =
    request?.items.filter((item) => item.previousApproval) ?? [];
  const otherItems =
    request?.items.filter((item) => !item.previousApproval) ?? [];
  function itemRow(item: TransferRequest["items"][number]) {
    const decision = decisions[item.id] ?? { decision: "", note: "" };
    return (
      <section key={item.id} className="space-y-3 border-t py-5">
        <h3 className="font-semibold">
          {item.sourceCode} · {item.sourceName}
        </h3>
        <p>
          {item.credits} หน่วยกิต · เกรด {item.grade || "ไม่ระบุ"}
        </p>
        {item.previousApproval && (
          <p className="rounded-lg bg-purple-50 p-3 text-purple-900">
            ตรงกับที่เคยอนุมัติ ·{" "}
            {new Date(item.previousApproval.reviewedAt).toLocaleDateString(
              "th-TH",
              { timeZone: "Asia/Bangkok" },
            )}{" "}
            <Link
              className="underline"
              href={`/documents/transfers/${item.previousApproval.requestId}`}
            >
              ดูคำขออ้างอิง
            </Link>{" "}
            — ยังต้องตรวจและอนุมัติคำขอนี้
          </p>
        )}
        <p>
          {item.match
            ? `คู่เทียบเสนอ: ${item.match.targetCode} · ${item.match.targetName} (${item.match.targetCredits} หน่วยกิต)`
            : "ยังไม่พบคู่เทียบอัตโนมัติ เลือกวิชาปลายทางหรือตรวจหลักสูตรเพิ่มเติม"}
        </p>
        {item.decision ? (
          <p>
            ผล: {item.decision === "approved" ? "อนุมัติ" : "ไม่อนุมัติ"}{" "}
            {item.note && `· ${item.note}`}
          </p>
        ) : (
          request?.status === "pending" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span>วิชาปลายทาง</span>
                <select
                  className={input}
                  disabled={busy || !doc}
                  value={decision.targetCode ?? item.match?.targetCode ?? ""}
                  onChange={(e) =>
                    setDecisions((previous) => ({
                      ...previous,
                      [item.id]: { ...decision, targetCode: e.target.value },
                    }))
                  }
                >
                  <option value="">เลือกคู่เทียบ</option>
                  {item.match &&
                    !(doc?.courses ?? []).some(
                      (c) => c.sourceCode === item.match!.targetCode,
                    ) && (
                      <option value={item.match.targetCode}>
                        {item.match.targetCode} · {item.match.targetName}
                      </option>
                    )}
                  {(doc?.courses ?? []).map((course) => (
                    <option
                      key={course.sourceCode}
                      value={course.sourceCode}
                      disabled={item.credits < course.credits}
                    >
                      {course.sourceCode} · {course.sourceName} (
                      {course.credits} หน่วยกิต)
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span>ผลพิจารณา</span>
                <select
                  required
                  className={input}
                  disabled={busy}
                  value={decision.decision}
                  onChange={(e) =>
                    setDecisions((previous) => ({
                      ...previous,
                      [item.id]: { ...decision, decision: e.target.value },
                    }))
                  }
                >
                  <option value="">เลือกผลพิจารณา</option>
                  <option
                    value="approved"
                    disabled={!doc || !(decision.targetCode ?? item.match?.targetCode)}
                  >
                    อนุมัติ
                  </option>
                  <option value="rejected">ไม่อนุมัติ</option>
                </select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span>
                  หมายเหตุ{" "}
                  {decision.decision === "rejected" ? "(จำเป็น)" : "(ถ้ามี)"}
                </span>
                <textarea
                  required={decision.decision === "rejected"}
                  maxLength={2000}
                  className={input}
                  disabled={busy}
                  value={decision.note}
                  onChange={(e) =>
                    setDecisions((previous) => ({
                      ...previous,
                      [item.id]: { ...decision, note: e.target.value },
                    }))
                  }
                />
              </label>
            </div>
          )
        )}
      </section>
    );
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <Link
        href={requestId ? "/documents/transfers" : "/documents"}
        className="text-purple-800 underline"
      >
        กลับ{requestId ? "รายการคำขอ" : "เอกสาร"}
      </Link>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">
          {requestId ? "พิจารณาเทียบโอนรายวิชา" : "เทียบโอนรายวิชา"}
        </h1>
        <p className="tool-note">
          OCR และคู่เทียบเป็นข้อมูลประกอบ
          อาจารย์ตรวจเอกสารและพิจารณาทุกรายวิชาก่อนอนุมัติ
        </p>
      </header>
      {error && (
        <div role="alert" className="space-y-2 text-red-700">
          <p>{error}</p>
          <button
            className={button}
            disabled={busy}
            onClick={() => void run(load)}
          >
            โหลดข้อมูลใหม่
          </button>
        </div>
      )}
      {success && (
        <p role="status" className="rounded-lg bg-purple-50 p-3">
          {success}
        </p>
      )}
      {requests === null ? (
        <p role="status">กำลังโหลด...</p>
      ) : requestId ? (
        !request ? (
          <p>ไม่พบคำขอ</p>
        ) : (
          <>
            <section className="work-surface space-y-3">
              <h2 className="text-xl font-semibold">
                {request.studentName || "ไม่ระบุชื่อ"} ·{" "}
                {request.studentCode || "ไม่ระบุรหัส"}
              </h2>
              <p>
                {request.sourceInstitution} · สาขา{" "}
                {request.sourceMajor || "ไม่ระบุ"}
              </p>
              <p>
                {TRANSFER_STATUS[request.status]} · ยื่น{" "}
                {new Date(request.createdAt).toLocaleString("th-TH", {
                  timeZone: "Asia/Bangkok",
                })}
              </p>
              <button
                className={button}
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    openTransferDocument(
                      `/transfers/requests/${request.id}/documents/request`,
                    ),
                  )
                }
              >
                ดูต้นฉบับ: {request.documentName}
              </button>
              {request.ocrText && (
                <details>
                  <summary className="cursor-pointer py-2">
                    ข้อความที่ OCR อ่านได้
                  </summary>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-sm">
                    {request.ocrText}
                  </pre>
                </details>
              )}
            </section>
            <section className="work-surface space-y-3">
              <h2 className="text-xl font-semibold">หลักสูตรปลายทาง</h2>
              <p>{request.curriculumName}</p>
              {request.status === "pending" && (
                <div className="flex flex-wrap gap-3">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">เลือกหลักสูตรปลายทาง</span>
                    <select
                      className={input}
                      disabled={busy}
                      value={targetDoc}
                      onChange={(e) => setTargetDoc(e.target.value)}
                    >
                      <option value="">เลือกหลักสูตรที่อัปโหลด</option>
                      {docs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.curriculumName} · {d.sourceMajor} · {d.year}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className={button}
                    disabled={busy || !targetDoc}
                    onClick={() => void assign()}
                  >
                    จับคู่รายวิชาใหม่
                  </button>
                </div>
              )}
              {!docs.length && (
                <Link
                  href="/teacher/curricula"
                  className="text-purple-800 underline"
                >
                  ไปเพิ่มหลักสูตรปลายทาง
                </Link>
              )}
            </section>
            <form onSubmit={review} className="space-y-6">
              {previouslyApproved.length > 0 && (
                <section className="work-surface">
                  <h2 className="text-xl font-semibold">
                    ตรงกับที่เคยอนุมัติ ({previouslyApproved.length})
                  </h2>
                  {request.status === 'pending' && <p className="tool-note">รายการที่สถาบัน วิชา หน่วยกิต และเกรดตรงกับประวัติ จะเตรียมผลอนุมัติไว้ให้ กรุณารีเช็คและยืนยันก่อนบันทึกจริง</p>}
                  {previouslyApproved.map(itemRow)}
                  {request.status === 'pending' && request.items.some(item => item.autoApprovalSuggested && decisions[item.id]?.decision === 'approved') && <label className="flex items-start gap-3 py-4"><input type="checkbox" required checked={rechecked} disabled={busy} onChange={event => setRechecked(event.target.checked)} /><span>ตรวจเอกสาร เกรด และวิชาที่ระบบเสนออนุมัติจากประวัติแล้ว ยืนยันให้ใช้ผลพิจารณานี้</span></label>}
                </section>
              )}
              <section className="work-surface">
                <h2 className="text-xl font-semibold">
                  รายวิชาที่ต้องพิจารณา ({otherItems.length})
                </h2>
                {otherItems.length ? (
                  otherItems.map(itemRow)
                ) : (
                  <p className="py-4">
                    รายวิชาทั้งหมดอยู่ในส่วนตรงกับที่เคยอนุมัติ
                  </p>
                )}
              </section>
              {request.status === "pending" && (
                <button className={primary} disabled={busy}>
                  {busy ? "กำลังบันทึก..." : "ยืนยันผลพิจารณาทุกรายวิชา"}
                </button>
              )}
            </form>
          </>
        )
      ) : (
        <>
          <nav aria-label="หมวดเทียบโอน" className="flex flex-wrap gap-2">
            {(
              [
                { key: "requests", label: "คำขอนักศึกษา" },
                { key: "history", label: "ประวัติเคยอนุมัติ" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? primary : button}
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {tab === "requests" && (
            <section className="work-surface">
              <h2 className="text-xl font-semibold mb-4">
                คำขอเทียบโอนรายวิชา
              </h2>
              {!requests.length && (
                <p>ยังไม่มีคำขอ นักศึกษาสามารถอัปโหลดหลักสูตรเดิมจากแอปได้</p>
              )}
              {requests.map((row) => (
                <Link
                  key={row.id}
                  className="tool-link"
                  href={`/documents/transfers/${row.id}`}
                >
                  <span>
                    {row.studentName || "ไม่ระบุชื่อ"} ·{" "}
                    {row.studentCode || "ไม่ระบุรหัส"}
                    <small className="tool-note block mt-1">
                      {row.sourceInstitution} ·{" "}
                      {row.sourceMajor || "ไม่ระบุสาขา"} · {row.items.length}{" "}
                      วิชา · {TRANSFER_STATUS[row.status]}
                    </small>
                  </span>
                  <span aria-hidden="true">&rsaquo;</span>
                </Link>
              ))}
            </section>
          )}
          {tab === "history" && (
            <section className="work-surface space-y-4">
              <h2 className="text-xl font-semibold">รายวิชาที่เคยอนุมัติ</h2>
              <p className="tool-note">
                ใช้สถาบัน สาขา รหัสและชื่อวิชา หลักสูตรปลายทาง
                และเกณฑ์หน่วยกิตประกอบการเสนอคู่เทียบครั้งถัดไป
              </p>
              {!history.length && <p>ยังไม่มีประวัติอนุมัติ</p>}
              {history.map(({ row, item }) => (
                <div
                  key={`${row.id}-${item.id}`}
                  className="space-y-1 border-t py-3"
                >
                  <p className="font-semibold">
                    {row.sourceInstitution} · {row.sourceMajor || "ไม่ระบุสาขา"}
                  </p>
                  <p>
                    {item.sourceCode} · {item.sourceName} →{" "}
                    {item.match!.targetCode} · {item.match!.targetName}
                  </p>
                  <p className="tool-note">
                    วิชาเดิม {item.credits} หน่วยกิต · เกรด {item.grade || 'ไม่ระบุ'} ·
                    {row.curriculumName} · {item.match!.targetCredits} หน่วยกิต
                  </p>
                  <Link
                    className="text-purple-800 underline"
                    href={`/documents/transfers/${row.id}`}
                  >
                    ดูคำขอที่อนุมัติ
                  </Link>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
