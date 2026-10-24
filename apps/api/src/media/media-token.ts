import { createHmac, timingSafeEqual } from 'node:crypto';

// token สั้น ๆ ที่ API ออกให้: read = ดูสด, clip = ดูย้อนหลัง/ดาวน์โหลด, publish = กล้องส่งวิดีโอ
export interface MediaTokenPayload {
  sub: string;
  path: string;
  act: 'read' | 'clip' | 'publish';
  sid: string;
  exp: number;
}

const sign = (secret: string, body: string) =>
  createHmac('sha256', secret).update(body).digest('base64url');

export function signMediaToken(secret: string, payload: MediaTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(secret, body)}`;
}

export function verifyMediaToken(
  secret: string,
  token: string,
  now: Date,
): MediaTokenPayload | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as MediaTokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp <= now.getTime()) return null;
    return payload;
  } catch {
    return null;
  }
}
