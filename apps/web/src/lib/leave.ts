export type LeaveStatus = "pending" | "approved" | "rejected";
export type OcrStatus = "pending" | "completed" | "failed";

export type LeaveSession = {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  section: string | null;
  kind: "class" | "exam";
  title: string | null;
  onDate: string;
  startsAt: string;
  endsAt: string;
  roomName: string;
  cancelled: boolean;
};

export type LeaveRequest = {
  id: string;
  sessionId: string;
  session: LeaveSession;
  student: { id: string; studentId: string | null; fullName: string | null };
  reason: string;
  status: LeaveStatus;
  reviewNote: string | null;
  ocrText: string;
  ocrStatus: OcrStatus;
  createdAt: string;
  attachments: { fileName: string; mime: string; size: number }[];
};

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "รอตรวจ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
};

export const OCR_STATUS_LABEL: Record<OcrStatus, string> = {
  pending: "กำลังอ่านข้อความ",
  completed: "อ่านข้อความแล้ว",
  failed: "อ่านข้อความไม่สำเร็จ กรุณาตรวจหลักฐานโดยตรง",
};

const dateTime = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

const sessionDate = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok",
});

const sessionTime = new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Bangkok",
});

export function formatSession(session: LeaveSession) {
  const section = session.section ? ` กลุ่ม ${session.section}` : "";
  const room = session.roomName ? ` · ห้อง ${session.roomName}` : "";
  const startsAt = new Date(session.startsAt);
  const endsAt = new Date(session.endsAt);
  const schedule = `${sessionDate.format(startsAt)} ${sessionTime.format(startsAt)}–${sessionTime.format(endsAt)}`;
  const cancelled = session.cancelled ? " · คาบนี้ถูกลบแล้ว" : "";
  return `${session.courseCode}${section} · ${session.courseName} · ${schedule}${room}${cancelled}`;
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

export function formatSubmittedAt(value: string) {
  return dateTime.format(new Date(value));
}
