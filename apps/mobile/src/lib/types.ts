// ชนิดข้อมูลตามที่ API ส่งกลับมา

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl?: string | null;
  role: "student" | "teacher" | "admin";
  studentId: string | null;
  pdpaConsentAt: string | null;
  identityVerifiedAt: string | null;
  // อ่านจากบัตรนักศึกษาตอนยืนยันตัวตน
  faculty?: string | null;
  major?: string | null;
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
  cancelled: boolean;
}

export interface LeaveRequest {
  id: string;
  sessionId: string;
  session: LeaveSession;
  student: { id: string; studentId: string | null; fullName: string | null };
  reason: string;
  documentDetails?: import('./leave').DocumentDetails;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  ocrText: string;
  ocrStatus: "pending" | "completed" | "failed";
  createdAt: string;
  attachments: { fileName: string; mime: string; size: number }[];
}

export interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  leave: number;
  pending: number;
  total: number;
}

export interface StudentAttendanceSummary {
  summary: {
    counts: AttendanceCounts;
    attendanceRate: number;
  };
  courses: {
    course: {
      id: string;
      code: string;
      name: string;
      section: string | null;
    };
    counts: AttendanceCounts;
    attendanceRate: number;
  }[];
}

export interface StudentStudies {
  from: string;
  to: string;
  courses: { id: string; code: string; name: string; section: string | null }[];
  sessions: {
    id: string;
    courseId: string;
    kind: 'class' | 'exam';
    title: string | null;
    onDate: string;
    startsAt: string;
    endsAt: string;
    roomName: string | null;
  }[];
}
