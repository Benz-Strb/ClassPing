export type Role = "student" | "teacher" | "admin";

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  studentId: string | null;
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
  scheduleId: string | null;
  courseId: string;
  roomId: string;
  roomName: string;
  onDate: string;
  startsAt: string;
  endsAt: string;
  status: "upcoming" | "live" | "ended";
}
