import { expect, it, vi } from 'vitest';

const { connection, cookies, createServerClient } = vi.hoisted(() => ({
  connection: vi.fn(), cookies: vi.fn(), createServerClient: vi.fn(),
}));
vi.mock('next/server', () => ({ connection }));
vi.mock('next/headers', () => ({ cookies }));
vi.mock('@supabase/ssr', () => ({ createServerClient }));
import { createServerSupabase } from './supabase-server';

it('รอ request ก่อนเริ่ม Supabase ซึ่งอ่านเวลาเพื่อตรวจอายุ session', async () => {
  let release!: () => void;
  connection.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
  cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
  const result = createServerSupabase();
  expect(cookies).not.toHaveBeenCalled();
  expect(createServerClient).not.toHaveBeenCalled();
  release();
  await result;
  expect(cookies).toHaveBeenCalledOnce();
  expect(createServerClient).toHaveBeenCalledOnce();
});
