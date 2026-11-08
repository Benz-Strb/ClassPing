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
  const room = session.roomName ? ` · ${session.roomName.startsWith('ห้อง') ? '' : 'ห้อง '}${session.roomName}` : "";
  const startsAt = new Date(session.startsAt).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
  const cancelled = session.cancelled ? "\nคาบนี้ถูกลบแล้ว" : "";
  return `${session.courseCode}${section} · ${session.courseName}\n${startsAt}${room}${cancelled}`;
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

export async function previewLeave(sessionId: string, evidenceUri: string) {
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("evidence", new File(evidenceUri));
  return apiFetch<{ text: string; reason: string }>(
    "/leave-requests/preview",
    { method: "POST", body: form },
    LEAVE_TIMEOUT_MS,
  );
}

export function extractLeaveReason(text: string): string {
  if (!text) return "";
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const labelRegex =
    /^(?:เหตุผล(?:การลา)?|สาเหตุ|เนื่องจาก|เนื่องด้วย|ขอลาเนื่องจาก|การวินิจฉัย(?:โรค)?|วินิจฉัย(?:โรค)?(?:ว่า)?|อาการ(?:สำคัญ)?(?:ที่พบ)?|โรค|ป่วยเป็น|ป่วยด้วย|มีความจำเป็นต้อง|Diagnosis|Dx|Symptoms|Reason)\s*[:：\-–—.]?\s*(.*)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(labelRegex);
    if (match) {
      let content = match[1]?.trim();
      if (!content && i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (
          !/^(?:ชื่อ|รหัสนักศึกษา|รายวิชา|วันที่|แพทย์|โรงพยาบาล|ลงชื่อ|Date|Doctor|Hospital|Name)/i.test(
            next,
          )
        ) {
          content = next;
        }
      }
      if (content) {
        return content
          .replace(/\s*(?:ClassPing|หน้า\s*\d+|Page\s*\d+).*$/i, "")
          .trim();
      }
    }
  }

  for (const line of lines) {
    const match = line.match(
      /(?:สมควรให้|เห็นควรให้|ให้|แนะนำให้)(?:หยุดพักรักษาตัว|พักรักษาตัว|หยุดเรียน|พักฟื้น|หยุดงาน)\s*(.*)/i,
    );
    if (match) return line;
  }

  const illnessRegex =
    /(?:ไข้|หวัด|เจ็บคอ|ปวดท้อง|ท้องเสีย|อาหารเป็นพิษ|ปวดศีรษะ|ปวดหัว|คลื่นไส้|อาเจียน|อุบัติเหตุ|ผ่าตัด|ติดเชื้อ|กล้ามเนื้อ|กักตัว|โควิด|fever|headache|diarrhea|pharyngitis|gastroenteritis)/i;
  for (const line of lines) {
    if (
      illnessRegex.test(line) &&
      !/^(?:ข้อมูลสมมติ|หลักฐาน|ใบรับรองแพทย์|โรงพยาบาล|คลินิก|มหาวิทยาลัย|Medical)/i.test(
        line,
      )
    ) {
      return line
        .replace(/\s*(?:ClassPing|หน้า\s*\d+|Page\s*\d+).*$/i, "")
        .trim();
    }
  }

  const filtered = lines.filter(
    (l) =>
      !/^(?:ข้อมูลสมมติ|หลักฐาน|มหาวิทยาลัย|โรงพยาบาล|คลินิก|ชื่อ|รหัสนักศึกษา|รายวิชา|วันที่|วันที่ลา|ClassPing|หน้า|Page)/i.test(
        l,
      ),
  );
  const fallback = filtered[0] || lines[0] || "";
  return fallback.slice(0, 1000).trim();
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
