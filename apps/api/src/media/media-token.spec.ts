import { signMediaToken, verifyMediaToken, type MediaTokenPayload } from './media-token.js';

const SECRET = 's'.repeat(32);
const NOW = new Date('2026-10-24T02:00:00Z');

const payload: MediaTokenPayload = {
  sub: 'u1',
  path: 'cam/c1',
  act: 'read',
  sid: 's1',
  exp: NOW.getTime() + 60_000,
};

describe('media token', () => {
  it('เซ็นแล้วอ่านคืนได้ค่าเดิม', () => {
    expect(verifyMediaToken(SECRET, signMediaToken(SECRET, payload), NOW)).toEqual(payload);
  });

  it('แก้ข้อมูลใน token ได้ null', () => {
    const [body, sig] = signMediaToken(SECRET, payload).split('.');
    const other = Buffer.from(JSON.stringify({ ...payload, path: 'cam/c2' })).toString('base64url');
    expect(verifyMediaToken(SECRET, `${other}.${sig}`, NOW)).toBeNull();
    expect(verifyMediaToken(SECRET, `${body}.${sig}x`, NOW)).toBeNull();
  });

  it('หมดอายุแล้วได้ null', () => {
    const token = signMediaToken(SECRET, payload);
    expect(verifyMediaToken(SECRET, token, new Date(payload.exp))).toBeNull();
  });

  it('secret อื่นหรือรูปแบบผิดได้ null', () => {
    const token = signMediaToken(SECRET, payload);
    expect(verifyMediaToken('x'.repeat(32), token, NOW)).toBeNull();
    expect(verifyMediaToken(SECRET, 'abc', NOW)).toBeNull();
    expect(verifyMediaToken(SECRET, '', NOW)).toBeNull();
    const junk = Buffer.from('not json').toString('base64url');
    expect(verifyMediaToken(SECRET, `${junk}.${token.split('.')[1]}`, NOW)).toBeNull();
  });
});
