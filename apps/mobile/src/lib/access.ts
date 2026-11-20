import type { FaceStatus, Me } from './types';

export const ROLE_LABEL: Record<Me['role'], string> = {
  student: 'นักศึกษา',
  teacher: 'อาจารย์',
  admin: 'ผู้ดูแลระบบ',
};

export type Screen =
  | 'consent'
  | 'identity'
  | 'enroll'
  // หน้าใช้งานของนักศึกษา
  | 'student'
  // ไม่ใช่นักศึกษา หรือไม่มีรหัสนักศึกษา ให้ใช้เว็บ
  | 'webOnly';

export interface AccessState {
  me: Pick<Me, 'role' | 'studentId' | 'pdpaConsentAt'>;
  face: Pick<FaceStatus, 'complete' | 'verified'> | null;
  // ไม่ยินยอมในรอบนี้ (ไม่ได้เก็บฝั่งเซิร์ฟเวอร์ เปิดแอปใหม่จะถามอีก)
  consentDeclined: boolean;
  // นักศึกษาที่ยินยอมแล้วต้องลงทะเบียนใบหน้าให้ครบ
  enrolling: boolean;
  hasCard: boolean;
}

// ลงทะเบียนใบหน้าได้เฉพาะนักศึกษา และแอดมินที่มีรหัสนักศึกษา
export function canEnrollFace(me: Pick<Me, 'role' | 'studentId'>) {
  return !!me.studentId && (me.role === 'student' || me.role === 'admin');
}

export function decideScreen(s: AccessState): Screen {
  const { me } = s;
  if (!canEnrollFace(me)) return 'webOnly';
  const rest: Screen = me.role === 'student' ? 'student' : 'webOnly';
  if (!me.pdpaConsentAt) return s.consentDeclined ? rest : 'consent';
  if (s.face && !s.face.complete && (me.role === 'student' || s.enrolling)) {
    return !s.face.verified && !s.hasCard ? 'identity' : 'enroll';
  }
  return rest;
}

// ข้อความบนหน้าที่ไม่ใช่หน้านักศึกษา
export function webOnlyMessage(me: Pick<Me, 'role' | 'studentId'>) {
  return me.studentId && me.role !== 'student'
    ? 'แอปนี้ใช้สำหรับนักศึกษา ใช้งานผ่านเว็บ'
    : 'บัญชีนี้ใช้งานบนเว็บ';
}
