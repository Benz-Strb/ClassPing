import { describe, expect, it } from 'vitest';
import { getMobileAuthRedirectUri } from './auth-redirect';

describe('getMobileAuthRedirectUri', () => {
  it('ใช้ deep link ของ ClassPing ใน Development Build', () => {
    expect(getMobileAuthRedirectUri(null)).toBe('classping://auth/callback');
  });

  it('ปฏิเสธ Expo Go แทนการส่งผู้ใช้กลับไปหน้าเว็บ', () => {
    expect(() => getMobileAuthRedirectUri('expo')).toThrow(
      'Google Login ใช้ผ่าน Expo Go ไม่ได้ กรุณาเปิด ClassPing Development Build',
    );
  });
});
