import { expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAttendanceAdminRepo } from './attendance-admin.repo.js';

function fakeDb(rows: unknown[] = []) {
  const writes: Record<string, unknown>[] = [];
  const q: Record<string, unknown> = {};
  q.upsert = (row: Record<string, unknown>) => (writes.push(row), q);
  q.update = (row: Record<string, unknown>) => (writes.push(row), q);
  for (const name of ['eq', 'select']) q[name] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  const db = { from: () => q };
  return { db: db as unknown as SupabaseClient, writes };
}

it('setStatus ล้าง review_reason', async () => {
  const { db, writes } = fakeDb();
  await new SupabaseAttendanceAdminRepo(db).setStatus('s1', 'u1', 'present', 't1');
  expect(writes[0]).toMatchObject({ status: 'present', review_reason: null });
});

it('moveRow ล้าง review_reason', async () => {
  const { db, writes } = fakeDb();
  await new SupabaseAttendanceAdminRepo(db).moveRow('s1', 'u1', 'u2', 'present', 't1');
  expect(writes[0]).toMatchObject({ student_id: 'u2', review_reason: null });
});

it('listBySession คืน reviewReason', async () => {
  const { db } = fakeDb([
    {
      student_id: 'u1',
      status: 'pending',
      first_seen_at: null,
      confidence: null,
      image_path: null,
      updated_by: null,
      review_reason: 'spoof',
      editor: null,
    },
  ]);
  const rows = await new SupabaseAttendanceAdminRepo(db).listBySession('s1');
  expect(rows[0]).toMatchObject({ reviewReason: 'spoof' });
});
