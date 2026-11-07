export type Role = "student" | "teacher" | "admin";

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  studentId: string | null;
}

export interface AdminUser extends Me {
  hasFace: boolean;
}

export interface Room {
  id: string;
  name: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  section: string | null;
  teacherId: string;
}

export interface Rules {
  lateAfterMin: number;
  absentAfterMin: number | null;
  outOfRoomLimitMin: number;
}

export interface RosterEntry {
  studentCode: string;
  fullName: string | null;
  hasLoggedIn: boolean;
  faceEnrolled: boolean;
  // รูปหน้าตรงที่ลงทะเบียนไว้ URL ใช้ได้ 10 นาที
  faceImageUrl: string | null;
}

export interface AddStudentsResult {
  added: string[];
  alreadyEnrolled: string[];
  invalid: string[];
}

// weekday 0 = อาทิตย์
export interface Schedule {
  id: string;
  courseId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  roomId: string;
  roomName: string;
  courseCode: string;
}

export interface Override {
  scheduleId: string;
  onDate: string;
  cancelled: boolean;
  roomId: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface SessionView {
  id: string;
  kind: "class" | "exam";
  // ชื่อคาบสอบ คาบเรียนเป็น null
  title: string | null;
  scheduleId: string | null;
  courseId: string;
  roomId: string;
  roomName: string;
  onDate: string;
  startsAt: string;
  endsAt: string;
  status: "upcoming" | "live" | "ended";
}

export interface Person {
  id: string;
  name: string | null;
  email: string;
}

export interface Exam {
  id: string;
  title: string;
  onDate: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
  room: Room;
  lateAfterMin: number;
  // null = นับขาดตอนหมดคาบ
  absentAfterMin: number | null;
  outOfRoomLimitMin: number;
  proctors: Person[];
  // กล้องเปิดแล้ว แก้ได้แค่คนคุมสอบ
  locked: boolean;
}

export interface LiveSession {
  id: string;
  kind: "class" | "exam";
  title: string | null;
  courseCode: string;
  courseName: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  status: "upcoming" | "live" | "ended";
  // กล้องกำลังเปิดอยู่ ดูสดได้
  cameraOpen: boolean;
  hasCamera: boolean;
  canDownload: boolean;
}

// ใช้ต่อกล้องสด token ใช้ได้แค่ตอนเริ่มต่อ หลุดแล้วขอใหม่
export interface LiveTicket {
  whepUrl: string;
  token: string;
  expiresAt: string;
  session: LiveSession;
}

// กรอบหน้าล่าสุดจากกล้องเช็คชื่อ box เป็นสัดส่วนของภาพ [ซ้าย, บน, ขวา, ล่าง]
export interface LiveFaces {
  at: string | null;
  faces: {
    n: number;
    box: [number, number, number, number];
    kind: "match" | "review" | "unknown";
    name: string | null;
    studentCode: string | null;
  }[];
}

export interface Recording {
  session: {
    kind: "class" | "exam";
    title: string | null;
    courseCode: string;
    courseName: string;
    roomName: string;
    startsAt: string;
    endsAt: string;
  };
  // ไฟล์อัดแยกเป็นช่วง ๆ ตามที่กล้องต่ออยู่ duration เป็นวินาที
  segments: { start: string; duration: number }[];
  expiresOn: string | null;
  canDownload: boolean;
}

export type AttendanceStatus = "present" | "late" | "absent" | "leave" | "pending";

export interface AttendanceRow {
  studentCode: string;
  fullName: string | null;
  faceEnrolled: boolean;
  // null = กล้องยังไม่เห็น
  status: AttendanceStatus | null;
  firstSeenAt: string | null;
  confidence: number | null;
  imageUrl: string | null;
  // ชื่อคนแก้ล่าสุด null = กล้องบันทึก
  updatedBy: string | null;
  // เหตุที่ต้องรอตรวจ
  reviewReason: "spoof" | null;
  outOfRoom: {
    totalSeconds: number;
    minutes: number;
    // ป้ายที่ API ตัดสินแล้ว หน้าเว็บไม่คิดเกณฑ์ซ้ำ
    label: "out" | "out_now" | "gone" | "gone_no_return" | null;
    trips: TripView[];
  };
}

export interface TripView {
  id: string;
  outAt: string;
  backAt: string | null;
  backBy: "front" | "teacher" | null;
  seconds: number;
  imageUrl: string | null;
  // เวลาที่กล้องประตูเห็นเข้าห้องหลังออก ใช้เป็นค่าเริ่มต้นของเวลากลับ
  suggestedBackAt: string | null;
}

export interface SessionAttendance {
  session: SessionView & { outOfRoomLimitMin: number };
  rows: AttendanceRow[];
  unknown: { imageUrl: string; seenAt: string }[];
  // รอบนอกห้องที่กล้องไม่แน่ใจว่าใคร
  tripReviews: {
    id: string;
    guessCode: string;
    guessName: string | null;
    score: number | null;
    outAt: string;
    imageUrl: string | null;
  }[];
  unknownTrips: { id: string; outAt: string; imageUrl: string | null }[];
}
