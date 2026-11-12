import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { oauth, signOut, apiFetch } = vi.hoisted(() => ({ oauth: vi.fn(), signOut: vi.fn(), apiFetch: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: { signInWithOAuth: oauth, signOut } } }));
vi.mock('./api', () => ({ apiFetch }));
import { signInWithGooglePopup } from './popup-login';

const attempt = '11111111-1111-4111-8111-111111111111';
const popup = { close: vi.fn(), resizeTo: vi.fn(), moveTo: vi.fn(), focus: vi.fn(), location: { replace: vi.fn() } };
const listeners = new Map<string, (event: unknown) => void>();
let channel: { onmessage: ((event: { data: unknown }) => void) | null; close: ReturnType<typeof vi.fn> };
let open: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  listeners.clear();
  channel = { onmessage: null, close: vi.fn() };
  open = vi.fn(() => popup);
  vi.stubGlobal('crypto', { randomUUID: () => attempt });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('BroadcastChannel', vi.fn(function () { return channel; }));
  vi.stubGlobal('window', {
    open, screen: { availWidth: 1440, availHeight: 900 }, screenX: 0, screenY: 0, outerWidth: 1440, outerHeight: 900,
    location: { origin: 'http://localhost:3000', protocol: 'http:' }, setTimeout: globalThis.setTimeout,
    addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  });
  oauth.mockResolvedValue({ data: { url: 'https://accounts.google.com/test' }, error: null });
  apiFetch.mockResolvedValue({ id: 'teacher-1', role: 'teacher' });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const result = () => ({ type: 'classping:oauth', attempt, error: null });

it('เปิด popup ทันทีใน click แล้วตรวจสิทธิ์ API ก่อนยืนยันสำเร็จ', async () => {
  const promise = signInWithGooglePopup(new AbortController().signal);
  expect(open).toHaveBeenCalledWith('/auth/popup?waiting=1', `classping-google-${attempt}`, expect.stringContaining('popup=yes'));
  expect(open.mock.calls[0][2]).toContain('width=480,height=660');
  expect(popup.resizeTo).toHaveBeenCalledWith(480, 660);
  expect(popup.moveTo).toHaveBeenCalledWith(480, 120);
  expect(popup.focus).toHaveBeenCalled();
  await Promise.resolve();
  expect(popup.location.replace).toHaveBeenCalledWith('https://accounts.google.com/test');
  channel.onmessage?.({ data: result() });
  await expect(promise).resolves.toMatchObject({ role: 'teacher' });
  expect(apiFetch).toHaveBeenCalledWith('/me', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(channel.close).toHaveBeenCalled();
  expect(popup.close).toHaveBeenCalled();
});

it('ไม่ยอมรับ message ต่าง origin, ต่างหน้าต่าง หรือคนละ attempt', async () => {
  const controller = new AbortController();
  const promise = signInWithGooglePopup(controller.signal);
  const rejected = expect(promise).rejects.toThrow('ยกเลิก');
  listeners.get('message')?.({ origin: 'https://evil.example', source: popup, data: result() });
  listeners.get('message')?.({ origin: 'http://localhost:3000', source: {}, data: result() });
  channel.onmessage?.({ data: { ...result(), attempt: 'other' } });
  expect(apiFetch).not.toHaveBeenCalled();
  controller.abort();
  await rejected;
});

it('popup ถูกบล็อกต้องแจ้งผู้ใช้ โดยไม่เปลี่ยนไปล็อกอินเต็มหน้า', async () => {
  open.mockReturnValue(null);
  await expect(signInWithGooglePopup(new AbortController().signal)).rejects.toThrow('อนุญาตป๊อปอัป');
  expect(oauth).not.toHaveBeenCalled();
});

it('นักศึกษาไม่ผ่านและล้าง session ก่อนแสดงข้อผิดพลาด', async () => {
  apiFetch.mockResolvedValue({ role: 'student' });
  const promise = signInWithGooglePopup(new AbortController().signal);
  const rejected = expect(promise).rejects.toThrow('นักศึกษา');
  channel.onmessage?.({ data: result() });
  await rejected;
  expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
});

it('Google ปฏิเสธไม่เรียก API และเปิดให้ลองใหม่', async () => {
  const promise = signInWithGooglePopup(new AbortController().signal);
  const rejected = expect(promise).rejects.toThrow('เลือกบัญชีอีกครั้ง');
  channel.onmessage?.({ data: { ...result(), error: 'oauth' } });
  await rejected;
  expect(apiFetch).not.toHaveBeenCalled();
});

it('หมดเวลาแล้วปิด popup และล้าง listener', async () => {
  const promise = signInWithGooglePopup(new AbortController().signal);
  const rejected = expect(promise).rejects.toThrow('หมดเวลา');
  await vi.advanceTimersByTimeAsync(300_000);
  await rejected;
  expect(listeners.size).toBe(0);
  expect(popup.close).toHaveBeenCalled();
});
