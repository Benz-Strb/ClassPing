import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient }));
import { proxy } from './proxy';

it('refresh ส่ง cookie ใหม่ให้ทั้ง Server Components และเบราว์เซอร์ โดยไม่ให้ cache session', async () => {
  createServerClient.mockImplementation((_url, _key, options) => ({ auth: {
    getClaims: async () => {
      options.cookies.setAll([
        { name: 'sb-test-auth-token', value: 'refreshed-session', options: { path: '/', sameSite: 'lax' } },
      ], { Pragma: 'no-cache', Expires: '0' });
      return { data: { claims: { sub: 'user-1' } }, error: null };
    },
  } }));
  const request = new NextRequest('http://localhost:3000/me');
  const response = await proxy(request);
  expect(request.cookies.get('sb-test-auth-token')?.value).toBe('refreshed-session');
  expect(response.cookies.get('sb-test-auth-token')?.value).toBe('refreshed-session');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('pragma')).toBe('no-cache');
});

const signedOut = () =>
  createServerClient.mockImplementation(() => ({ auth: { getClaims: async () => ({ data: null, error: null }) } }));

it('ยังไม่ login เปิดหน้าที่ต้อง login ส่งไปหน้า login ทันที', async () => {
  signedOut();
  for (const path of ['/', '/courses', '/admin/courses?x=1']) {
    const response = await proxy(new NextRequest(`http://localhost:3000${path}`));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login');
    expect(response.headers.get('cache-control')).toContain('no-store');
  }
});

it('หน้า login และ auth เปิดได้โดยไม่ต้อง login', async () => {
  signedOut();
  for (const path of ['/login', '/login?error=x', '/auth/callback']) {
    const response = await proxy(new NextRequest(`http://localhost:3000${path}`));
    expect(response.headers.get('location')).toBeNull();
  }
  // ชื่อที่ขึ้นต้นเหมือนกันแต่ไม่ใช่หน้า login ต้องถูกส่งไป login
  expect((await proxy(new NextRequest('http://localhost:3000/loginx'))).status).toBe(307);
});
