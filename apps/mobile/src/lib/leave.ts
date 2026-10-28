import { File, Paths } from "expo-file-system";
import { apiFetch } from "./api";
import type { LeaveSession } from "./types";

const LEAVE_TIMEOUT_MS = 120_000;

export const LEAVE_STATUS_LABEL = {
  pending: "รอตรวจ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
} as const;

export const OCR_STATUS_LABEL = {
  pending: "กำลังอ่านข้อความ",
  completed: "อ่านข้อความแล้ว",
  failed: "อ่านข้อความไม่สำเร็จ กรุณารออาจารย์ตรวจหลักฐาน",
} as const;

export function formatLeaveSession(session: LeaveSession) {
  const section = session.section ? ` กลุ่ม ${session.section}` : "";
  const room = session.roomName ? ` · ห้อง ${session.roomName}` : "";
  const startsAt = new Date(session.startsAt).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
  return `${session.courseCode}${section} · ${session.courseName}\n${startsAt}${room}`;
}

export async function submitLeave(
  sessionId: string,
  reason: string,
  evidenceUri: string,
) {
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("reason", reason);
  form.append("evidence", new File(evidenceUri));
  return apiFetch<{
    id: string;
    status: "pending";
    ocrStatus: "completed" | "failed";
  }>("/leave-requests", { method: "POST", body: form }, LEAVE_TIMEOUT_MS);
}

export function discardLeaveEvidence(uri: string | null) {
  if (!uri || !uri.startsWith(Paths.cache.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // ลบสำเนาใน cache ไม่ได้ไม่ควรทำให้คำขอล้มเหลว ระบบปฏิบัติการจะล้างภายหลัง
  }
}
