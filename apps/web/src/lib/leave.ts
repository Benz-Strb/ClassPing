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
  return `${session.courseCode}${section} · ${session.courseName} · ${schedule}${room}`;
}

export function formatSubmittedAt(value: string) {
  return dateTime.format(new Date(value));
}
