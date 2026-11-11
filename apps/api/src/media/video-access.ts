import { AppError } from '../common/app-error.js';
import type { AppUser } from '../users/users.service.js';

export type CameraKind = 'front' | 'door';

// ?camera= จากหน้าเว็บ ไม่ส่งมา = กล้องหน้าห้อง
export function cameraKind(value: unknown): CameraKind {
  if (value === undefined || value === '' || value === 'front') return 'front';
  if (value === 'door') return 'door';
  throw new AppError(400, 'BAD_REQUEST', 'กล้องต้องเป็น front หรือ door');
}

// คาบพร้อมข้อมูลที่ใช้ตัดสินว่าใครดูกล้องได้
export interface WatchableSession {
  id: string;
  kind: 'class' | 'exam';
  title: string | null;
  courseId: string;
  courseCode: string;
  courseName: string;
  teacherId: string;
  roomId: string;
  roomName: string;
  startsAt: Date;
  endsAt: Date;
  proctorIds: string[];
  // กล้องหน้าห้องของห้องนี้ null = ห้องไม่มีกล้อง
  cameraId: string | null;
  // กล้องประตูของห้องนี้ ไม่มี = ห้องไม่มีกล้องประตู
  doorCameraId?: string | null;
  // เวลาที่ถูกลบคาบ หลังจากนี้ภาพในห้องไม่ใช่ของคาบนี้แล้ว
  cancelledAt?: Date | null;
}

// เวลาสุดท้ายที่ห้องเป็นของคาบเหล่านี้ คาบที่ถูกลบกลางทางนับถึงตอนที่ลบ
export function latestUse(rows: { endsAt: Date; cancelledAt: Date | null }[]): Date | null {
  const ends = rows.map((r) =>
    r.cancelledAt && r.cancelledAt < r.endsAt ? r.cancelledAt : r.endsAt,
  );
  return ends.length ? new Date(Math.max(...ends.map((e) => e.getTime()))) : null;
}

const isTeacherOf = (user: AppUser, session: WatchableSession) =>
  user.role === 'teacher' && session.teacherId === user.id;

// อาจารย์ประจำวิชา / อาจารย์คุมสอบ (เฉพาะคาบสอบที่คุม) / แอดมิน
export function canWatch(user: AppUser, session: WatchableSession): boolean {
  if (user.role === 'admin' || isTeacherOf(user, session)) return true;
  return user.role === 'teacher' && session.kind === 'exam' && session.proctorIds.includes(user.id);
}

// ดาวน์โหลดคลิปเก็บไว้ได้เฉพาะอาจารย์ประจำวิชาและแอดมิน
export function canDownload(user: AppUser, session: WatchableSession): boolean {
  return user.role === 'admin' || isTeacherOf(user, session);
}

export const cameraOf = (session: WatchableSession, kind: CameraKind): string | null =>
  kind === 'door' ? (session.doorCameraId ?? null) : session.cameraId;

// กล้องตัวไหนของห้องก็ได้ ใช้หาว่าห้องกำลังเป็นของคาบไหน
export const anyCamera = (session: WatchableSession): string | null =>
  session.cameraId ?? session.doorCameraId ?? null;
