import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { exchange } = vi.hoisted(() => ({ exchange: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({ createServerSupabase: async () => ({ auth: { exchangeCodeForSession: exchange } }) }));
import { GET } from './route';

beforeEach(() => vi.resetAllMocks());

it('แลก OAuth code ฝั่ง server และกลับหน้าแรก', async () => {
  exchange.mockResolvedValue({ error: null });
  const response = await GET(new NextRequest('http://localhost:3000/auth/callback?code=test-code'));
  expect(exchange).toHaveBeenCalledWith('test-code');
  expect(response.headers.get('location')).toBe('http://localhost:3000/');
  expect(response.headers.get('cache-control')).toContain('no-store');
});

it.each(['', '?error=access_denied'])('ไม่มี code หรือ OAuth ถูกปฏิเสธกลับ login: %s', async (query) => {
  const response = await GET(new NextRequest(`http://localhost:3000/auth/callback${query}`));
  expect(response.headers.get('location')).toContain('/login?error=');
  expect(exchange).not.toHaveBeenCalled();
});

it('code หมดอายุหรือแลกซ้ำกลับ login', async () => {
  exchange.mockResolvedValue({ error: new Error('expired') });
  const response = await GET(new NextRequest('http://localhost:3000/auth/callback?code=expired'));
  expect(response.headers.get('location')).toContain('/login?error=');
});
