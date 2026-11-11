import { z } from 'zod';
import { draftRowSchema, type TimetableRow } from './timetable-draft.js';
import type { TimetableIdentity } from './timetable-identity.js';

const reviewedRow = draftRowSchema.extend({
  courseCode: z.string().trim().min(1, 'กรุณาตรวจรหัสวิชา').max(30),
  courseName: z.string().trim().min(1, 'กรุณาตรวจชื่อวิชา').max(200),
  section: z.string().trim().min(1, 'กรุณาตรวจกลุ่มเรียน').max(30),
  teacherName: z.string().trim().min(1, 'กรุณาตรวจอาจารย์ผู้สอน').max(200),
  roomName: z.string().trim().min(1, 'กรุณาตรวจห้องเรียน หรือระบุออนไลน์').max(100),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'กรุณาตรวจเวลาเริ่มเรียน'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'กรุณาตรวจเวลาสิ้นสุดเรียน'),
}).refine(row => row.startTime < row.endTime, 'เวลาสิ้นสุดต้องหลังเวลาเริ่มเรียน');

export const saveTimetableSchema = z.object({ rows: z.array(reviewedRow).min(1).max(100), ownershipProof: z.string().min(1).max(4096) });
export interface SavedTimetable {
  rows: TimetableRow[];
  savedAt: string;
  expiresAt: string;
  identity: TimetableIdentity;
  ownershipProof: string;
}

export function timetableExpiry(savedAt: Date): string {
  const expiry = new Date(savedAt);
  const day = expiry.getUTCDate();
  expiry.setUTCDate(1);
  expiry.setUTCMonth(expiry.getUTCMonth() + 5);
  const lastDay = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth() + 1, 0)).getUTCDate();
  expiry.setUTCDate(Math.min(day, lastDay));
  return expiry.toISOString();
}
