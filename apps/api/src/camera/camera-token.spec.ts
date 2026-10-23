import { hashToken, newToken } from './camera-token.js';

describe('camera token', () => {
  it('hashToken เป็น sha256 hex และได้ค่าเดิมทุกครั้ง', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('newToken สุ่มใหม่ทุกครั้ง ยาว 43 ตัว base64url', () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
  });
});
