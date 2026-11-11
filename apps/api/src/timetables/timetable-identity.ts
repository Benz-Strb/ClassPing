import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../common/app-error.js';
import type { AppUser } from '../users/users.service.js';

export interface TimetableIdentity { studentId: string; fullName: string }
const nameKey = (value: string) => value.normalize('NFKC').trim()
  .replace(/^(?:นาย|นางสาว|นาง|น\.ส\.|mr\.?|mrs\.?|ms\.?)\s*/iu, '')
  .replace(/\s+/g, '').toLowerCase();

export { readTimetableIdentity } from './timetable-draft.js';

export function checkTimetableIdentity(user: AppUser, identity: TimetableIdentity | null): asserts identity is TimetableIdentity {
  if (!identity) throw new AppError(400, 'TIMETABLE_IDENTITY_MISSING', 'ไม่พบเลขนักศึกษาและชื่อในช่องเลขทะเบียน กรุณาอัปโหลดเอกสารที่เห็นส่วนหัวครบ');
  if (!user.fullName?.trim()) throw new AppError(400, 'PROFILE_NAME_REQUIRED', 'กรุณาตรวจสอบชื่อในบัญชีก่อนอัปโหลดตารางเรียน');
  if (identity.studentId !== user.studentId)
    throw new AppError(403, 'TIMETABLE_OWNER_MISMATCH', 'เลขนักศึกษาในเอกสารไม่ตรงกับบัญชี กรุณาใช้ตารางเรียนของคุณเอง');
  if (nameKey(identity.fullName) !== nameKey(user.fullName))
    throw new AppError(403, 'TIMETABLE_NAME_MISMATCH', `เลขนักศึกษาตรงกัน แต่ชื่อในบัญชีคือ “${user.fullName}” และชื่อในเอกสารคือ “${identity.fullName}” กรุณาตรวจสอบชื่อในบัญชีให้ตรงกับเอกสาร`);
}

export function signTimetableIdentity(userId: string, identity: TimetableIdentity, expiresAt: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, identity, expiresAt })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(`timetable:${payload}`).digest('base64url')}`;
}

export function verifyTimetableIdentity(user: AppUser, proof: string, secret: string): TimetableIdentity {
  try {
    const [payload, signature, extra] = proof.split('.');
    const expected = createHmac('sha256', secret).update(`timetable:${payload}`).digest();
    const actual = Buffer.from(signature ?? '', 'base64url');
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.userId !== user.id || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now() ||
      typeof data.identity?.studentId !== 'string' || typeof data.identity?.fullName !== 'string') throw new Error();
    checkTimetableIdentity(user, data.identity);
    return data.identity;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(403, 'TIMETABLE_VERIFICATION_REQUIRED', 'กรุณาอัปโหลดตารางเรียนเพื่อตรวจสอบชื่อและเลขนักศึกษาอีกครั้ง');
  }
}
