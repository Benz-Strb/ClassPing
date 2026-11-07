import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseCameraRepo } from './camera.repo.js';

// ของปลอมที่จดทุก filter ที่ถูกเรียก แล้วคืนผลที่กำหนดตอน await
function recordingDb(result: { data: unknown; error?: unknown }) {
  const calls: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'lte', 'gt', 'order', 'limit']) {
    q[name] = (...args: unknown[]) => (calls.push([name, args]), q);
  }
  q.maybeSingle = async () => ({ data: result.data, error: result.error ?? null });
  return { db: { from: () => q } as unknown as SupabaseClient, calls };
}

describe('SupabaseCameraRepo.liveSession', () => {
  it('คาบจบแล้ว (ends_at <= now) ไม่นับ: กรอง ends_at > now และ starts_at <= opensBy', async () => {
    const { db, calls } = recordingDb({ data: null });
    const opensBy = new Date('2026-10-22T02:10:00Z');
    const now = new Date('2026-10-22T05:00:00Z');
    await expect(new SupabaseCameraRepo(db).liveSession('r1', opensBy, now)).resolves.toBeNull();
    expect(calls).toContainEqual(['gt', ['ends_at', now.toISOString()]]);
    expect(calls).toContainEqual(['lte', ['starts_at', opensBy.toISOString()]]);
    expect(calls).toContainEqual(['eq', ['room_id', 'r1']]);
  });
});
