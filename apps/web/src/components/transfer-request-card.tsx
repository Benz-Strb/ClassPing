"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  buttonClass,
  inputClass,
  openTransferDocument,
  TRANSFER_STATUS,
  type TransferRequest,
} from "@/lib/transfers";

export function TransferRequestCard({
  request,
  reviewer = false,
  onReviewed,
}: {
  request: TransferRequest;
  reviewer?: boolean;
  onReviewed?: () => Promise<void>;
}) {
  const [decisions, setDecisions] = useState<
    Record<string, { decision: string; note: string }>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function document(kind: string) {
    setBusy(true);
    setError("");
    try {
      await openTransferDocument(
        `/transfers/requests/${request.id}/documents/${kind}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปิดเอกสารไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function review(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/transfers/requests/${request.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          decisions: request.items.map((item) => ({
            itemId: item.id,
            ...decisions[item.id],
          })),
        }),
      });
      await onReviewed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกผลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="space-y-3 rounded-lg border bg-white p-4">
      <header>
        <h3 className="font-semibold">{request.curriculumName}</h3>
        <p>{TRANSFER_STATUS[request.status]}</p>
        {reviewer && (
          <p>
            {request.studentCode ?? "ไม่มีรหัส"} ·{" "}
            {request.studentName ?? "ไม่ระบุชื่อ"}
          </p>
        )}
        <p className="text-sm text-gray-600">
          {request.sourceInstitution} · ยื่น{" "}
          {new Date(request.createdAt).toLocaleString("th-TH", {
            timeZone: "Asia/Bangkok",
          })}
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => document("request")}
          className="text-blue-700 underline"
        >
          ดูเอกสารนักศึกษา: {request.documentName}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => document("curriculum")}
          className="text-blue-700 underline"
        >
          ดูหลักสูตรที่ใช้พิจารณา
        </button>
      </div>
      <form onSubmit={review} className="space-y-3">
        {request.items.map((item) => (
          <section key={item.id} className="space-y-2 rounded border p-3">
            <p className="font-medium">
              {item.sourceCode} · {item.sourceName}
            </p>
            <p className="text-sm">
              {item.credits} หน่วยกิต · เกรด {item.grade || "ไม่ระบุ"}
            </p>
            {item.match ? (
              <p>
                คู่เทียบ: {item.match.targetCode} · {item.match.targetName} (
                {item.match.targetCredits} หน่วยกิต) —
                รออาจารย์ตรวจเอกสารและเกณฑ์เกรด
              </p>
            ) : (
              <p className="text-amber-800">
                ยังไม่มีคู่เทียบที่เข้าเกณฑ์
                ต้องตรวจชุดจับคู่/หน่วยกิตก่อนยื่นคำขอใหม่
              </p>
            )}
            {item.decision && (
              <p>
                ผล: {item.decision === "approved" ? "อนุมัติ" : "ปฏิเสธ"}{" "}
                {item.note && `— ${item.note}`}
              </p>
            )}
            {reviewer && request.status === "pending" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <label>
                  ผลพิจารณา {item.sourceCode}
                  <select
                    required
                    className={inputClass}
                    value={decisions[item.id]?.decision ?? ""}
                    onChange={(e) =>
                      setDecisions({
                        ...decisions,
                        [item.id]: {
                          note: decisions[item.id]?.note ?? "",
                          decision: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="">เลือกผลพิจารณา</option>
                    {item.match && <option value="approved">อนุมัติ</option>}
                    <option value="rejected">ปฏิเสธ</option>
                  </select>
                </label>
                <label>
                  เหตุผล {item.sourceCode}
                  <input
                    required={decisions[item.id]?.decision === "rejected"}
                    maxLength={2000}
                    className={inputClass}
                    value={decisions[item.id]?.note ?? ""}
                    onChange={(e) =>
                      setDecisions({
                        ...decisions,
                        [item.id]: {
                          decision: decisions[item.id]?.decision ?? "",
                          note: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
            )}
          </section>
        ))}
        {reviewer && request.status === "pending" && (
          <>
            <p className="text-sm text-gray-600">
              ตรวจเอกสารต้นฉบับ เกรด และนโยบายมหาวิทยาลัยก่อนบันทึก
              ผลที่บันทึกแล้วแก้ไขไม่ได้จากหน้านี้
            </p>
            <button disabled={busy} className={buttonClass}>
              บันทึกผลพิจารณาทุกรายวิชา
            </button>
          </>
        )}
      </form>
      {request.reviewedAt && (
        <p className="text-sm">
          พิจารณาเมื่อ{" "}
          {new Date(request.reviewedAt).toLocaleString("th-TH", {
            timeZone: "Asia/Bangkok",
          })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </article>
  );
}
