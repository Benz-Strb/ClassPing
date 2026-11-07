import { afterEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAttendanceAdminRepo } from './attendance-admin.repo.js';

function fakeDb(rows: unknown[] = []) {
  const writes: Record<string, unknown>[] = [];
  const filters: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  q.delete = () => q;
  q.upsert = (row: Record<string, unknown>) => (writes.push(row), q);
  q.update = (row: Record<string, unknown>) => (writes.push(row), q);
  for (const name of ['eq', 'in', 'select']) {
    q[name] = (...args: unknown[]) => (filters.push([name, args]), q);
  }
  q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  const db = { from: () => q };
  return { db: db as unknown as SupabaseClient, writes, filters };
}

it('setStatus ล้าง review_reason', async () => {
  const { db, writes } = fakeDb();
  await new SupabaseAttendanceAdminRepo(db).setStatus('s1', 'u1', 'present', 't1');
  expect(writes[0]).toMatchObject({ status: 'present', review_reason: null });
});

it('moveRow ล้าง review_reason', async () => {
  const { db, writes } = fakeDb([{ student_id: 'u2' }]);
  await new SupabaseAttendanceAdminRepo(db).moveRow('s1', 'u1', 'u2', 'present', 't1');
  expect(writes[0]).toMatchObject({ student_id: 'u2', review_reason: null });
});

it('moveRow / deleteRow เขียนเฉพาะแถว pending', async () => {
  const move = fakeDb([{ student_id: 'u2' }]);
  await new SupabaseAttendanceAdminRepo(move.db).moveRow('s1', 'u1', 'u2', 'present', 't1');
  expect(move.filters).toContainEqual(['eq', ['status', 'pending']]);
  const del = fakeDb([{ student_id: 'u1' }]);
  await new SupabaseAttendanceAdminRepo(del.db).deleteRow('s1', 'u1');
  expect(del.filters).toContainEqual(['eq', ['status', 'pending']]);
});

it('moveRow / deleteRow ไม่เจอแถว pending (เปลี่ยนไปแล้ว) ได้ 409 NOT_PENDING', async () => {
  const { db } = fakeDb([]);
  const repo = new SupabaseAttendanceAdminRepo(db);
  await expect(repo.moveRow('s1', 'u1', 'u2', 'present', 't1')).rejects.toMatchObject({
    status: 409,
    code: 'NOT_PENDING',
  });
  await expect(repo.deleteRow('s1', 'u1')).rejects.toMatchObject({
    status: 409,
    code: 'NOT_PENDING',
  });
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

it('usersByIds คืนรหัสและชื่อ และไม่ยิงคำสั่งเมื่อไม่มี id', async () => {
  const { db } = fakeDb([{ id: 'u9', student_id: '66000099', full_name: 'เก้า' }]);
  const repo = new SupabaseAttendanceAdminRepo(db);
  expect(await repo.usersByIds(['u9'])).toEqual([
    { id: 'u9', studentCode: '66000099', fullName: 'เก้า' },
  ]);
  expect(await repo.usersByIds([])).toEqual([]);
});

afterEach(() => vi.useRealTimers());

it('signCaptures ใช้ URL เดิมของรูปเดิมจนครึ่งหนึ่งของอายุ แล้วค่อยเซ็นใหม่', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
  let n = 0;
  const calls: string[][] = [];
  const db = {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          calls.push(paths);
          n += 1;
          return { data: paths.map((path) => ({ path, signedUrl: `${path}?t=${n}` })), error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const repo = new SupabaseAttendanceAdminRepo(db);
  const first = await repo.signCaptures(['a', 'b'], 600);
  vi.advanceTimersByTime(5000);
  const second = await repo.signCaptures(['a', 'b', 'c'], 600);
  expect(second.get('a')).toBe(first.get('a'));
  expect(second.get('b')).toBe(first.get('b'));
  expect(calls[1]).toEqual(['c']);
  vi.advanceTimersByTime(300_000);
  const third = await repo.signCaptures(['a'], 600);
  expect(third.get('a')).not.toBe(first.get('a'));
});
