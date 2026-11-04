import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseDoorRepo, type NewTrip } from './door.repo.js';

// ของปลอมที่จดทุกการเรียก แล้วคืนผลที่กำหนดตอน await
function recordingDb(result: { data?: unknown; error?: unknown } = {}) {
  const calls: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const name of [
    'insert',
    'update',
    'delete',
    'select',
    'eq',
    'is',
    'not',
    'lt',
    'in',
    'limit',
  ]) {
    q[name] = (...args: unknown[]) => (calls.push([name, args]), q);
  }
  q.then = (resolve: (v: unknown) => void) =>
    resolve({ data: result.data ?? [], error: result.error ?? null });
  return { db: { from: () => q } as unknown as SupabaseClient, calls };
}

const trip: NewTrip = {
  sessionId: 's1',
  userId: 'u1',
  status: 'confirmed',
  outAt: new Date('2026-10-23T03:05:00Z'),
  confidence: 0.8,
  imagePath: 's1/door/u1.jpg',
};

describe('SupabaseDoorRepo.insertTrip', () => {
  it('เขียนแถวตาม trip และคืน true', async () => {
    const { db, calls } = recordingDb();
    await expect(new SupabaseDoorRepo(db).insertTrip(trip)).resolves.toBe(true);
    expect(calls[0]).toEqual([
      'insert',
      [
        {
          session_id: 's1',
          student_id: 'u1',
          status: 'confirmed',
          out_at: '2026-10-23T03:05:00.000Z',
          confidence: 0.8,
          image_path: 's1/door/u1.jpg',
        },
      ],
    ]);
  });

  it('ชน unique index (23505) คืน false', async () => {
    const { db } = recordingDb({ error: { code: '23505' } });
    await expect(new SupabaseDoorRepo(db).insertTrip(trip)).resolves.toBe(false);
  });

  it('error อื่นโยน 503', async () => {
    const { db } = recordingDb({ error: { code: '08006' } });
    await expect(new SupabaseDoorRepo(db).insertTrip(trip)).rejects.toMatchObject({ status: 503 });
  });
});

describe('SupabaseDoorRepo.closeTrip', () => {
  const backAt = new Date('2026-10-23T03:20:00Z');

  it('ปิดเฉพาะรอบที่ยังไม่กลับ ออกก่อนเวลากลับ และอาจารย์ยังไม่แตะ', async () => {
    const { db, calls } = recordingDb({ data: [{ id: 't1' }] });
    await expect(new SupabaseDoorRepo(db).closeTrip('s1', 'u1', backAt, 'front')).resolves.toBe(
      true,
    );
    expect(calls).toContainEqual(['update', [{ back_at: backAt.toISOString(), back_by: 'front' }]]);
    expect(calls).toContainEqual(['eq', ['session_id', 's1']]);
    expect(calls).toContainEqual(['eq', ['student_id', 'u1']]);
    expect(calls).toContainEqual(['is', ['back_at', null]]);
    expect(calls).toContainEqual(['is', ['updated_by', null]]);
    expect(calls).toContainEqual(['lt', ['out_at', backAt.toISOString()]]);
  });

  it('ไม่มีแถวที่เข้าเงื่อนไข คืน false', async () => {
    const { db } = recordingDb({ data: [] });
    await expect(new SupabaseDoorRepo(db).closeTrip('s1', 'u1', backAt, 'front')).resolves.toBe(
      false,
    );
  });
});

describe('SupabaseDoorRepo.unknownTripsBefore', () => {
  it('เลือกเฉพาะ status unknown ที่ออกก่อนเวลาที่ให้ รอบที่รู้ว่าใครไม่ถูกเลือก', async () => {
    const { db, calls } = recordingDb({
      data: [
        { id: 't1', image_path: 'a.jpg' },
        { id: 't2', image_path: null },
      ],
    });
    const before = new Date('2026-10-16T12:00:00Z');
    await expect(new SupabaseDoorRepo(db).unknownTripsBefore(before)).resolves.toEqual([
      { id: 't1', imagePath: 'a.jpg' },
      { id: 't2', imagePath: null },
    ]);
    expect(calls).toContainEqual(['eq', ['status', 'unknown']]);
    expect(calls).toContainEqual(['lt', ['out_at', before.toISOString()]]);
  });
});

describe('SupabaseDoorRepo.deleteTrips', () => {
  it('ลบตาม id เป็นก้อนละ 50', async () => {
    const { db, calls } = recordingDb();
    const ids = Array.from({ length: 120 }, (_, i) => `t${i}`);
    await new SupabaseDoorRepo(db).deleteTrips(ids);
    const batches = calls.filter(([n]) => n === 'in').map(([, a]) => (a[1] as string[]).length);
    expect(batches).toEqual([50, 50, 20]);
  });
});
