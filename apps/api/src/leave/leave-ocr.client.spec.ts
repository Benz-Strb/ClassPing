import type { AppConfig } from '../config/config.js';
import { LeaveOcrClient } from './leave-ocr.client.js';

const config = { leaveOcrServiceUrl: 'http://ocr.test', leaveOcrServiceToken: 'o'.repeat(32) } as AppConfig;
const client = () => new LeaveOcrClient(config);
const read = () => client().readLeaveDocument(Buffer.from('image'), 'image/png');
afterEach(() => vi.unstubAllGlobals());

it('uses only the independent OCR endpoint/token and multipart evidence', async () => {
  const fetch = vi.fn(async () => Response.json({ data: { lines: [{ text: 'พัก 2 วัน', score: null }] } }));
  vi.stubGlobal('fetch', fetch);
  await expect(read()).resolves.toEqual({ lines: [{ text: 'พัก 2 วัน', score: null }] });
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('http://ocr.test/leave/ocr');
  expect(new Headers(init.headers).get('X-OCR-Token')).toBe(config.leaveOcrServiceToken);
  expect(new Headers(init.headers).has('X-Face-Token')).toBe(false);
  expect((init.body as FormData).get('image')).toBeInstanceOf(Blob);
});

it.each([401, 429, 500, 503])('returns an OCR-specific error for provider status %i', async status => {
  vi.stubGlobal('fetch', async () => Response.json({ error: { message: 'private provider detail' } }, { status }));
  await expect(read()).rejects.toMatchObject({ code: 'LEAVE_OCR_UNAVAILABLE' });
});

it('handles a stopped worker without mentioning face scanning', async () => {
  vi.stubGlobal('fetch', async () => { throw new TypeError('connection refused'); });
  await expect(read()).rejects.toMatchObject({ code: 'LEAVE_OCR_UNAVAILABLE' });
});

it('rejects malformed success payloads', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ data: { lines: [{ text: 123 }] } }));
  await expect(read()).rejects.toMatchObject({ code: 'LEAVE_OCR_UNAVAILABLE' });
});

it('preserves recoverable document validation errors', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ error: { message: 'PDF ต้องมี 1–10 หน้า' } }, { status: 400 }));
  await expect(read()).rejects.toMatchObject({ code: 'INVALID_EVIDENCE', message: 'PDF ต้องมี 1–10 หน้า' });
});

it('requires OCR configuration without falling back to the face service', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(new LeaveOcrClient({} as AppConfig).readLeaveDocument(Buffer.from('x'), 'image/png')).rejects.toMatchObject({ code: 'LEAVE_OCR_UNAVAILABLE' });
  expect(fetch).not.toHaveBeenCalled();
});
