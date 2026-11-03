import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch } from './api';
vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: 'localhost:8081' } } }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
afterEach(() => vi.unstubAllGlobals());
it('rejects malformed successful responses with a shared error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => null }));
  await expect(apiFetch('/me')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('preserves API permission errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: { code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์' } }) }));
  await expect(apiFetch('/me')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์' });
});
