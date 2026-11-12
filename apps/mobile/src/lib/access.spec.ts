import { expect, it } from 'vitest';
import { decideScreen, webOnlyMessage, type AccessState } from './access';
import { previewErrorMessage, defaultErrorText } from './errors';

const base = (over: Partial<Omit<AccessState, 'me'>> & { me?: Partial<AccessState['me']> } = {}): AccessState => {
  const { me, ...rest } = over;
  return {
    me: { role: 'student', studentId: '6501', pdpaConsentAt: '2026-01-01', ...me },
    face: { complete: false, verified: false },
    consentDeclined: false,
    enrolling: true,
    hasCard: false,
    ...rest,
  };
};

it('นักศึกษาที่ยังไม่ยินยอมเห็นหน้ายินยอมก่อน', () => {
  expect(decideScreen(base({ me: { pdpaConsentAt: null } }))).toBe('consent');
});

it('ไม่ยินยอมแล้วเข้าแอปได้ ไม่ติดทางตัน', () => {
  expect(decideScreen(base({ me: { pdpaConsentAt: null }, consentDeclined: true }))).toBe('student');
});

it('ยินยอมแล้วแต่ใบหน้ายังไม่ครบ ไปยืนยันบัตร แล้วถ่ายหน้า', () => {
  expect(decideScreen(base())).toBe('identity');
  expect(decideScreen(base({ hasCard: true }))).toBe('enroll');
  expect(decideScreen(base({ face: { complete: false, verified: true } }))).toBe('enroll');
});

it('นักศึกษาที่ยินยอมแล้วต้องยืนยันบัตรและสแกนหน้าครบก่อนเข้าแอป', () => {
  expect(decideScreen(base({ enrolling: false }))).toBe('identity');
  expect(decideScreen(base({ enrolling: false, hasCard: true }))).toBe('enroll');
  expect(decideScreen(base({ enrolling: false, face: { complete: false, verified: true } }))).toBe('enroll');
  expect(decideScreen(base({ face: { complete: true, verified: true } }))).toBe('student');
});

it('อาจารย์และแอดมินที่มีรหัสนักศึกษาไม่เห็นหน้านักศึกษา', () => {
  expect(decideScreen(base({ me: { role: 'teacher' } }))).toBe('webOnly');
  expect(decideScreen(base({ me: { role: 'admin' }, enrolling: false }))).toBe('webOnly');
  expect(decideScreen(base({ me: { role: 'admin', pdpaConsentAt: null }, consentDeclined: true }))).toBe('webOnly');
});

it('แอดมินที่มีรหัสนักศึกษายังลงทะเบียนใบหน้าได้', () => {
  expect(decideScreen(base({ me: { role: 'admin', pdpaConsentAt: null } }))).toBe('consent');
  expect(decideScreen(base({ me: { role: 'admin' } }))).toBe('identity');
});

it('บัญชีไม่มีรหัสนักศึกษาใช้เว็บ', () => {
  expect(decideScreen(base({ me: { studentId: null } }))).toBe('webOnly');
  expect(decideScreen(base({ me: { role: 'admin', studentId: null } }))).toBe('webOnly');
});

it('ข้อความหน้าเว็บ', () => {
  expect(webOnlyMessage({ role: 'admin', studentId: '1' })).toContain('นักศึกษา');
  expect(webOnlyMessage({ role: 'teacher', studentId: null })).toBe('บัญชีนี้ใช้งานบนเว็บ');
});

it('ข้อความ error ตอนอ่านหลักฐานลา', () => {
  const limited = Object.assign(new Error('ส่งคำขอถี่เกินไป รอสักครู่แล้วลองใหม่'), { code: 'RATE_LIMITED' });
  expect(previewErrorMessage(limited)).toBe('ส่งคำขอถี่เกินไป รอสักครู่แล้วลองใหม่');
  expect(previewErrorMessage(new Error('x'))).toContain('ส่งให้อาจารย์ตรวจเอง');
  expect(defaultErrorText(429)).toContain('ถี่เกินไป');
  expect(defaultErrorText(500)).toBe('เรียกระบบไม่สำเร็จ');
});
