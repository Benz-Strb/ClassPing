import { z } from 'zod';
import type { AttendanceStatus } from '../attendance/decide.js';

export const attendanceFilterSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    kind: z.enum(['all', 'class', 'exam']).default('all'),
    startDate: z.iso.date({ error: 'วันที่เริ่มต้นต้องเป็นรูปแบบ YYYY-MM-DD' }).optional(),
    endDate: z.iso.date({ error: 'วันที่สิ้นสุดต้องเป็นรูปแบบ YYYY-MM-DD' }).optional(),
    studentCode: z.string().trim().min(1).optional(),
  })
  .refine((filter) => !filter.startDate || !filter.endDate || filter.startDate <= filter.endDate, {
    error: 'วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด',
    path: ['endDate'],
  });

export type AttendanceFilterDto = z.infer<typeof attendanceFilterSchema>;

export interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  leave: number;
  pending: number;
  total: number;
}

export interface AttendanceSummary {
  totalSessions: number;
  totalStudents: number;
  counts: AttendanceCounts;
  attendanceRate: number; // ร้อยละการเข้าเรียน (present + late + leave) / total * 100
}

export interface StudentSessionStatus {
  sessionId: string;
  onDate: string;
  startsAt: string;
  endsAt: string;
  kind: 'class' | 'exam';
  title: string | null;
  status: AttendanceStatus | 'unrecorded';
}

export interface StudentAttendanceReport {
  studentCode: string;
  fullName: string | null;
  userId: string | null;
  counts: AttendanceCounts;
  totalSessions: number;
  attendanceRate: number;
  sessions: StudentSessionStatus[];
}

export interface SessionSummaryReport {
  sessionId: string;
  onDate: string;
  startsAt: string;
  endsAt: string;
  kind: 'class' | 'exam';
  title: string | null;
  roomName: string;
  counts: AttendanceCounts;
}

export interface CourseInfo {
  id: string;
  code: string;
  name: string;
  section: string | null;
}

export interface AttendanceReportResponse {
  course: CourseInfo;
  filter: AttendanceFilterDto;
  summary: AttendanceSummary;
  sessions: SessionSummaryReport[];
  students: StudentAttendanceReport[];
}
