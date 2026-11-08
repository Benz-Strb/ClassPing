import { expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseSchedulesRepo } from './schedules.repo.js';

it('คาบจริงที่ยกเลิกแล้วไม่นับเป็นคาบค้างที่ชน', async () => {
  const calls: unknown[][] = [];
  const query = {
    eq: (...args: unknown[]) => (calls.push(['eq', ...args]), query),
    is: (...args: unknown[]) => (calls.push(['is', ...args]), query),
    gte: () => query,
    lte: async () => ({ data: [], error: null }),
  };
  const db = { from: () => ({ select: () => query }) };

  await new SupabaseSchedulesRepo(db as unknown as SupabaseClient).listClassSessionsOn('2026-10-26');

  expect(calls).toContainEqual(['eq', 'kind', 'class']);
  expect(calls).toContainEqual(['is', 'cancelled_at', null]);
});
