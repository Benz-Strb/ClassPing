import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseDoorRepo, type NewTrip } from './door.repo.js';

// ของปลอมที่จดทุกการเรียก แล้วคืนผลที่กำหนดตอน await
function recordingDb(
  result: { data?: unknown; error?: unknown } = {},
  // ถ้ามี ใช้ตอบทีละหน้าแทน result.data
  pages?: unknown[][],
) {
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
    'gte',
    'lte',
    'order',
    'range',
    'in',
    'limit',
  ]) {
    q[name] = (...args: unknown[]) => (calls.push([name, args]), q);
  }
  let page = 0;
  q.then = (resolve: (v: unknown) => void) =>
    resolve({
      data: pages ? (pages[page++] ?? []) : (result.data ?? []),
      error: result.error ?? null,
    });
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

describe('SupabaseDoorRepo.demotePendingTrip', () => {
  it('เปลี่ยนเฉพาะรอบ pending ที่ยังไม่กลับเป็น unknown และถอดชื่อออก', async () => {
    const { db, calls } = recordingDb({ data: [{ id: 't1' }] });
    await expect(new SupabaseDoorRepo(db).demotePendingTrip('s1', 'u1')).resolves.toBe('t1');
    expect(calls).toContainEqual(['update', [{ status: 'unknown', student_id: null }]]);
    expect(calls).toContainEqual(['eq', ['session_id', 's1']]);
    expect(calls).toContainEqual(['eq', ['student_id', 'u1']]);
    expect(calls).toContainEqual(['eq', ['status', 'pending']]);
    expect(calls).toContainEqual(['is', ['back_at', null]]);
  });

  it('ไม่มีรอบ pending คืน null', async () => {
    const { db } = recordingDb({ data: [] });
    await expect(new SupabaseDoorRepo(db).demotePendingTrip('s1', 'u1')).resolves.toBeNull();
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

describe('SupabaseDoorRepo.listTrips', () => {
  it('อ่านเฉพาะคาบที่ขอ แล้วแปลงเวลาเป็น Date', async () => {
    const { db, calls } = recordingDb({
      data: [
        {
          id: 't1',
          student_id: 'u1',
          status: 'confirmed',
          out_at: '2026-10-23T03:05:00Z',
          back_at: '2026-10-23T03:15:00Z',
          back_by: 'front',
          confidence: 0.8,
          image_path: 'a.jpg',
        },
        {
          id: 't2',
          student_id: null,
          status: 'unknown',
          out_at: '2026-10-23T03:06:00Z',
          back_at: null,
          back_by: null,
          confidence: null,
          image_path: null,
        },
      ],
    });
    const trips = await new SupabaseDoorRepo(db).listTrips('s1');
    expect(calls).toContainEqual(['eq', ['session_id', 's1']]);
    expect(trips).toEqual([
      {
        id: 't1',
        userId: 'u1',
        status: 'confirmed',
        outAt: new Date('2026-10-23T03:05:00Z'),
        backAt: new Date('2026-10-23T03:15:00Z'),
        backBy: 'front',
        confidence: 0.8,
        imagePath: 'a.jpg',
      },
      {
        id: 't2',
        userId: null,
        status: 'unknown',
        outAt: new Date('2026-10-23T03:06:00Z'),
        backAt: null,
        backBy: null,
        confidence: null,
        imagePath: null,
      },
    ]);
  });
});

describe('SupabaseDoorRepo.setBack', () => {
  const backAt = new Date('2026-10-23T03:20:00Z');

  it('ตั้งเวลากลับโดยอาจารย์ เฉพาะรอบ confirmed ของคาบนี้', async () => {
    const { db, calls } = recordingDb({ data: [{ id: 't1' }] });
    await expect(new SupabaseDoorRepo(db).setBack('s1', 't1', backAt, 'teacher1')).resolves.toBe(
      true,
    );
    expect(calls).toContainEqual([
      'update',
      [{ back_at: backAt.toISOString(), back_by: 'teacher', updated_by: 'teacher1' }],
    ]);
    expect(calls).toContainEqual(['eq', ['session_id', 's1']]);
    expect(calls).toContainEqual(['eq', ['id', 't1']]);
    expect(calls).toContainEqual(['eq', ['status', 'confirmed']]);
  });

  it('ไม่มีแถวที่เข้าเงื่อนไข คืน false', async () => {
    const { db } = recordingDb({ data: [] });
    await expect(new SupabaseDoorRepo(db).setBack('s1', 't1', backAt, 'x')).resolves.toBe(false);
  });
});

describe('SupabaseDoorRepo.deleteTrip', () => {
  it('ลบเฉพาะรอบนี้ในคาบนี้ คืน true เมื่อมีแถวถูกลบ', async () => {
    const { db, calls } = recordingDb({ data: [{ id: 't1' }] });
    await expect(new SupabaseDoorRepo(db).deleteTrip('s1', 't1')).resolves.toBe(true);
    expect(calls).toContainEqual(['delete', []]);
    expect(calls).toContainEqual(['eq', ['session_id', 's1']]);
    expect(calls).toContainEqual(['eq', ['id', 't1']]);
  });

  it('ไม่มีแถว คืน false', async () => {
    const { db } = recordingDb({ data: [] });
    await expect(new SupabaseDoorRepo(db).deleteTrip('s1', 't1')).resolves.toBe(false);
  });
});

describe('SupabaseDoorRepo.identify', () => {
  it('ระบุตัวเฉพาะรอบ pending หรือ unknown ของคาบนี้ และไม่แตะ updated_by', async () => {
    const { db, calls } = recordingDb({ data: [{ id: 't1' }] });
    await expect(new SupabaseDoorRepo(db).identify('s1', 't1', 'u2', 'keep')).resolves.toBe(true);
    expect(calls).toContainEqual(['update', [{ student_id: 'u2', status: 'confirmed' }]]);
    expect(calls).toContainEqual(['eq', ['session_id', 's1']]);
    expect(calls).toContainEqual(['eq', ['id', 't1']]);
    expect(calls).toContainEqual(['in', ['status', ['pending', 'unknown']]]);
  });

  it('clear ล้างเวลากลับกับคนที่ให้เวลา', async () => {
    const { db, calls } = recordingDb({ data: [{ id: 't1' }] });
    await new SupabaseDoorRepo(db).identify('s1', 't1', 'u2', 'clear');
    expect(calls).toContainEqual([
      'update',
      [{ student_id: 'u2', status: 'confirmed', back_at: null, back_by: null }],
    ]);
  });

  it('ส่ง backAt มาด้วย ตั้งเวลากลับ back_by teacher และ updated_by ในคำสั่งเดียว', async () => {
    const { db, calls } = recordingDb({ data: [{ id: 't1' }] });
    const at = new Date('2026-10-23T03:30:00Z');
    await new SupabaseDoorRepo(db).identify('s1', 't1', 'u2', { at, by: 'teacher1' });
    expect(calls).toContainEqual([
      'update',
      [
        {
          student_id: 'u2',
          status: 'confirmed',
          back_at: at.toISOString(),
          back_by: 'teacher',
          updated_by: 'teacher1',
        },
      ],
    ]);
  });

  it('ชน unique index (23505) เป็น 409 TRIP_OPEN', async () => {
    const { db } = recordingDb({ error: { code: '23505' } });
    await expect(new SupabaseDoorRepo(db).identify('s1', 't1', 'u2', 'keep')).rejects.toMatchObject(
      {
        status: 409,
        code: 'TRIP_OPEN',
      },
    );
  });

  it('ไม่มีแถวที่เข้าเงื่อนไข คืน false', async () => {
    const { db } = recordingDb({ data: [] });
    await expect(new SupabaseDoorRepo(db).identify('s1', 't1', 'u2', 'keep')).resolves.toBe(false);
  });
});

describe('SupabaseDoorRepo.courseTrips', () => {
  it('อ่านเฉพาะรอบ confirmed ของวิชาในช่วงวัน และข้ามแถวที่ไม่มีรหัส', async () => {
    const { db, calls } = recordingDb({}, [
      [
        {
          session_id: 's1',
          out_at: '2026-10-23T03:05:00Z',
          back_at: null,
          student: { student_id: '66000001' },
          sessions: {
            on_date: '2026-10-23',
            kind: 'exam',
            starts_at: '2026-10-23T02:00:00Z',
            ends_at: '2026-10-23T05:00:00Z',
            late_after_min: 5,
            absent_after_min: 30,
            out_of_room_limit_min: 10,
          },
        },
        {
          session_id: 's1',
          out_at: '2026-10-23T03:06:00Z',
          back_at: null,
          student: { student_id: null },
          sessions: {
            on_date: '2026-10-23',
            kind: 'exam',
            ends_at: '2026-10-23T05:00:00Z',
            late_after_min: null,
            absent_after_min: null,
            out_of_room_limit_min: null,
          },
        },
      ],
      [],
    ]);
    const rows = await new SupabaseDoorRepo(db).courseTrips('c1', '2026-10-01', '2026-10-31');
    expect(calls).toContainEqual(['eq', ['status', 'confirmed']]);
    expect(calls).toContainEqual(['eq', ['sessions.course_id', 'c1']]);
    expect(calls).toContainEqual(['gte', ['sessions.on_date', '2026-10-01']]);
    expect(calls).toContainEqual(['lte', ['sessions.on_date', '2026-10-31']]);
    expect(rows).toEqual([
      {
        sessionId: 's1',
        onDate: '2026-10-23',
        kind: 'exam',
        startsAt: new Date('2026-10-23T02:00:00Z'),
        endsAt: new Date('2026-10-23T05:00:00Z'),
        lateAfterMin: 5,
        absentAfterMin: 30,
        outOfRoomLimitMin: 10,
        studentCode: '66000001',
        outAt: new Date('2026-10-23T03:05:00Z'),
        backAt: null,
      },
    ]);
  });
});

describe('SupabaseDoorRepo.courseTrips หลายหน้า', () => {
  const row = (id: number) => ({
    id: `t${id}`,
    session_id: 's1',
    out_at: '2026-10-23T03:05:00Z',
    back_at: '2026-10-23T03:10:00Z',
    student: { student_id: '66000001' },
    sessions: {
      on_date: '2026-10-23',
      kind: 'class',
      starts_at: '2026-10-23T02:00:00Z',
      ends_at: '2026-10-23T05:00:00Z',
      late_after_min: null,
      absent_after_min: null,
      out_of_room_limit_min: null,
    },
  });

  it('ไล่ทีละ 1000 แถวเรียงตาม id จนหน้าว่าง ไม่ตัดแถวทิ้ง', async () => {
    const first = Array.from({ length: 1000 }, (_, i) => row(i));
    const second = [row(1000), row(1001)];
    const { db, calls } = recordingDb({}, [first, second, []]);
    const rows = await new SupabaseDoorRepo(db).courseTrips('c1', '2026-10-01', '2026-10-31');
    expect(rows).toHaveLength(1002);
    expect(calls.filter(([n]) => n === 'range').map(([, a]) => a)).toEqual([
      [0, 999],
      [1000, 1999],
      [1002, 2001],
    ]);
    expect(calls).toContainEqual(['order', ['id']]);
  });
});
