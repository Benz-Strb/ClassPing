import { expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAttendanceRepo, type CameraRecord } from './attendance.repo.js';

const record: CameraRecord = {
  sessionId: 's1',
  userId: 'u1',
  status: 'pending',
  firstSeenAt: new Date('2026-11-01T02:00:00Z'),
  confidence: 0.5,
  imagePath: 's1/u1.jpg',
  reviewReason: 'spoof',
};

function fakeDb(result: unknown = []) {
  const writes: Record<string, unknown>[] = [];
  const q: Record<string, unknown> = {};
  q.upsert = (row: Record<string, unknown>) => (writes.push(row), q);
  q.update = (row: Record<string, unknown>) => (writes.push(row), q);
  for (const name of ['eq', 'is']) q[name] = () => q;
  q.select = () => q;
  q.maybeSingle = async () => ({ data: result, error: null });
  q.then = (resolve: (v: unknown) => void) =>
    resolve({ data: [{ student_id: 'u1' }], error: null });
  const db = { from: () => q };
  return { db: db as unknown as SupabaseClient, writes };
}

it('insertIfAbsent เขียน review_reason ตาม record', async () => {
  const { db, writes } = fakeDb();
  await new SupabaseAttendanceRepo(db).insertIfAbsent(record);
  expect(writes[0]).toMatchObject({ status: 'pending', review_reason: 'spoof' });
});

it('replacePending เขียน review_reason ตาม record และล้างเมื่อเป็น null', async () => {
  const a = fakeDb();
  await new SupabaseAttendanceRepo(a.db).replacePending(record);
  expect(a.writes[0]).toMatchObject({ review_reason: 'spoof' });
  const b = fakeDb();
  await new SupabaseAttendanceRepo(b.db).replacePending({
    ...record,
    status: 'present',
    reviewReason: null,
  });
  expect(b.writes[0]).toMatchObject({ status: 'present', review_reason: null });
});

it('find คืน reviewReason', async () => {
  const { db } = fakeDb({
    status: 'pending',
    updated_by: null,
    image_path: 'x',
    review_reason: 'spoof',
  });
  expect(await new SupabaseAttendanceRepo(db).find('s1', 'u1')).toMatchObject({
    reviewReason: 'spoof',
  });
});
