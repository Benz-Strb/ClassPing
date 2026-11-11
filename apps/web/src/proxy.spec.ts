import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient }));
import { proxy } from './proxy';

it('refresh ส่ง cookie ใหม่ให้ทั้ง Server Components และเบราว์เซอร์ โดยไม่ให้ cache session', async () => {
  createServerClient.mockImplementation((_url, _key, options) => ({ auth: {
    getClaims: async () => options.cookies.setAll([
      { name: 'sb-test-auth-token', value: 'refreshed-session', options: { path: '/', sameSite: 'lax' } },
    ], { Pragma: 'no-cache', Expires: '0' }),
  } }));
  const request = new NextRequest('http://localhost:3000/me');
  const response = await proxy(request);
  expect(request.cookies.get('sb-test-auth-token')?.value).toBe('refreshed-session');
  expect(response.cookies.get('sb-test-auth-token')?.value).toBe('refreshed-session');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('pragma')).toBe('no-cache');
});
