import { describe, expect, it } from 'vitest';
import { getMobileAuthRedirectUri } from './auth-redirect';

const createExpoUrl = (path: string) => `exp://192.168.1.10:8081/--/${path}`;

describe('getMobileAuthRedirectUri', () => {
  it('ใช้ deep link ของ ClassPing ใน Development Build', () => {
    expect(getMobileAuthRedirectUri(null, createExpoUrl)).toBe('classping://auth/callback');
  });

  it('ใช้ลิงก์ exp:// เมื่อเปิดใน Expo Go', () => {
    expect(getMobileAuthRedirectUri('expo', createExpoUrl)).toBe(
      'exp://192.168.1.10:8081/--/auth/callback',
    );
  });
});
