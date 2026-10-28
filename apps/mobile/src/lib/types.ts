// ชนิดข้อมูลตามที่ API ส่งกลับมา

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: "student" | "teacher" | "admin";
  studentId: string | null;
  pdpaConsentAt: string | null;
  identityVerifiedAt: string | null;
}

export type Pose = "front" | "left" | "right" | "up" | "down";

export interface FaceStatus {
  done: Pose[];
  // ยืนยันบัตรแล้วและครบทุกท่า
  complete: boolean;
  verified: boolean;
}

export interface LeaveSession {
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
}

export interface LeaveRequest {
  id: string;
  sessionId: string;
  session: LeaveSession;
  student: { id: string; studentId: string | null; fullName: string | null };
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  ocrText: string;
  ocrStatus: "pending" | "completed" | "failed";
  createdAt: string;
  attachments: { fileName: string; mime: string; size: number }[];
}
