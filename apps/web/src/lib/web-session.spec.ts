import { beforeEach, expect, it, vi } from 'vitest';

const { getSession, fetchMock } = vi.hoisted(() => ({ getSession: vi.fn(), fetchMock: vi.fn() }));
vi.mock('./supabase-server', () => ({ createServerSupabase: async () => ({ auth: { getSession } }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { getWebUser, requireWebUser } from './web-session';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  getSession.mockResolvedValue({ data: { session: { access_token: 'test-token', user: { role: 'admin' } } } });
});

it('ไม่มี session เปิดหน้า public ได้ แต่หน้าป้องกันพาไป login', async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  expect(await getWebUser()).toBeNull();
  await expect(requireWebUser()).rejects.toThrow('REDIRECT:/login');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('ใช้บทบาทจาก API ที่ยืนยัน token แล้ว ไม่เชื่อข้อมูลผู้ใช้ใน cookie', async () => {
  const user = { id: 'teacher-1', role: 'teacher', email: 'teacher@dpu.ac.th' };
  fetchMock.mockResolvedValue(Response.json({ data: user }));
  expect(await requireWebUser()).toEqual(user);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/me$/), {
    headers: { Authorization: 'Bearer test-token' }, cache: 'no-store',
  });
});

it('token ไม่ถูกต้องต้อง login ใหม่', async () => {
  fetchMock.mockResolvedValue(Response.json({ error: {} }, { status: 401 }));
  await expect(requireWebUser()).rejects.toThrow('REDIRECT:/login');
});

it('นักศึกษาเข้าเว็บไม่ได้ แม้ cookie อ้างว่าเป็น admin', async () => {
  fetchMock.mockResolvedValue(Response.json({ data: { id: 'student-1', role: 'student' } }));
  await expect(requireWebUser()).rejects.toThrow('REDIRECT:/login?error=');
});

it('API ปฏิเสธ Google identity ส่งกลับหน้า login พร้อมข้อความ', async () => {
  fetchMock.mockResolvedValue(Response.json({ error: { message: 'Google only' } }, { status: 403 }));
  await expect(requireWebUser()).rejects.toThrow('REDIRECT:/login?error=Google%20only');
});

it('API ล่มแสดงข้อผิดพลาด ไม่ตีความเป็น logout', async () => {
  fetchMock.mockResolvedValue(Response.json({}, { status: 503 }));
  await expect(requireWebUser()).rejects.toThrow('ตรวจสอบสิทธิ์ไม่สำเร็จ');
});
