import type { AppUser } from '../users/users.service.js';

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
