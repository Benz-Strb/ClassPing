import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../common/app-error.js';
import type { AppUser } from '../users/users.service.js';

export interface TimetableIdentity { studentId: string; fullName: string }
const nameKey = (value: string) => value.normalize('NFKC').trim()
  .replace(/^(?:นาย|นางสาว|นาง|น\.ส\.|mr\.?|mrs\.?|ms\.?)\s*/iu, '')
  .replace(/\s+/g, '').toLowerCase();

export { readTimetableIdentity } from './timetable-draft.js';
import { normalizeCode, normalizeSection } from './timetable-draft.js';

// รายวิชาที่ OCR อ่านได้จากเอกสาร (รหัส + กลุ่ม) เซ็นไว้ในหลักฐาน
// ตอนเพิ่มชื่อเข้ารายวิชาจะรับเฉพาะวิชาในเอกสารนี้ แก้แถวเพิ่มวิชาอื่นเองไม่ได้
export interface DocumentCourse { code: string; section: string }

export function documentCourses(rows: { courseCode: string; section: string | null }[]): DocumentCourse[] {
  const seen = new Map<string, DocumentCourse>();
  for (const row of rows) {
    const code = normalizeCode(row.courseCode);
    if (!code) continue;
    const course = { code, section: normalizeSection(row.section ?? '') };
    seen.set(`${course.code}|${course.section}`, course);
  }
  return [...seen.values()];
}

// เอกสารไม่ระบุกลุ่มของวิชานี้ = รับได้ทุกกลุ่มของรหัสนั้น
export function inDocument(courses: DocumentCourse[], code: string, section: string | null): boolean {
  const c = normalizeCode(code);
  const s = normalizeSection(section ?? '');
  return courses.some((d) => normalizeCode(d.code) === c && (!d.section || normalizeSection(d.section) === s));
}

export function checkTimetableIdentity(user: AppUser, identity: TimetableIdentity | null): asserts identity is TimetableIdentity {
  if (!identity) throw new AppError(400, 'TIMETABLE_IDENTITY_MISSING', 'ไม่พบเลขนักศึกษาและชื่อในช่องเลขทะเบียน กรุณาอัปโหลดเอกสารที่เห็นส่วนหัวครบ');
  if (!user.fullName?.trim()) throw new AppError(400, 'PROFILE_NAME_REQUIRED', 'กรุณาตรวจสอบชื่อในบัญชีก่อนอัปโหลดตารางเรียน');
  if (identity.studentId !== user.studentId)
    throw new AppError(403, 'TIMETABLE_OWNER_MISMATCH', 'เลขนักศึกษาในเอกสารไม่ตรงกับบัญชี กรุณาใช้ตารางเรียนของคุณเอง');
  if (nameKey(identity.fullName) !== nameKey(user.fullName))
    throw new AppError(403, 'TIMETABLE_NAME_MISMATCH', `เลขนักศึกษาตรงกัน แต่ชื่อในบัญชีคือ “${user.fullName}” และชื่อในเอกสารคือ “${identity.fullName}” กรุณาตรวจสอบชื่อในบัญชีให้ตรงกับเอกสาร`);
}

export function signTimetableIdentity(userId: string, identity: TimetableIdentity, expiresAt: string, secret: string, courses: DocumentCourse[] = []): string {
  const payload = Buffer.from(JSON.stringify({ userId, identity, expiresAt, courses })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(`timetable:${payload}`).digest('base64url')}`;
}

export function verifyTimetableIdentity(user: AppUser, proof: string, secret: string): TimetableIdentity {
  return readTimetableProof(user, proof, secret).identity;
}

// หลักฐานรุ่นเก่าไม่มีรายวิชา ได้ courses เป็นรายการว่าง ต้องอัปโหลดใหม่ก่อนเพิ่มชื่อเข้าวิชา
export function readTimetableProof(user: AppUser, proof: string, secret: string): { identity: TimetableIdentity; courses: DocumentCourse[] } {
  try {
    const [payload, signature, extra] = proof.split('.');
    const expected = createHmac('sha256', secret).update(`timetable:${payload}`).digest();
    const actual = Buffer.from(signature ?? '', 'base64url');
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.userId !== user.id || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now() ||
      typeof data.identity?.studentId !== 'string' || typeof data.identity?.fullName !== 'string') throw new Error();
    checkTimetableIdentity(user, data.identity);
    const courses: DocumentCourse[] = Array.isArray(data.courses)
      ? data.courses.filter((c: unknown): c is DocumentCourse =>
        typeof (c as DocumentCourse)?.code === 'string' && typeof (c as DocumentCourse)?.section === 'string')
      : [];
    return { identity: data.identity, courses };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(403, 'TIMETABLE_VERIFICATION_REQUIRED', 'กรุณาอัปโหลดตารางเรียนเพื่อตรวจสอบชื่อและเลขนักศึกษาอีกครั้ง');
  }
}
