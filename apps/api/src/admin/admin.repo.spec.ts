import type { SupabaseClient } from '@supabase/supabase-js';
import { mergeViews, SupabaseAdminRepo } from './admin.repo.js';
import { SupabaseCatalogRepo } from './catalog.repo.js';

describe('admin database safety boundaries', () => {
  it('maps last-admin rejection from the locking database function to 409', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'LAST_ADMIN' } });
    const from = vi.fn();
    const repo = new SupabaseAdminRepo({ rpc, from } as unknown as SupabaseClient);
    await expect(repo.updateUserRole('user', 'teacher')).rejects.toMatchObject({ status: 409, code: 'LAST_ADMIN' });
    expect(rpc).toHaveBeenCalledWith('admin_change_user_role', { target_id: 'user', next_role: 'teacher' });
    expect(from).not.toHaveBeenCalled();
  });
  it('pages through every user instead of stopping at 1000 rows', async () => {
    const row = (n: number) => ({ id: `u${n}`, email: `e${n}`, full_name: null, role: 'student', student_id: null, face_profiles: [] });
    const all = Array.from({ length: 2300 }, (_, n) => row(n));
    const range = vi.fn(async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }));
    const query = { order: vi.fn(() => query), range };
    const from = vi.fn(() => ({ select: () => query }));
    const repo = new SupabaseAdminRepo({ from } as unknown as SupabaseClient);
    await expect(repo.listUsers()).resolves.toHaveLength(2300);
    expect(range).toHaveBeenCalledTimes(4);
  });
  it('video views: ช่วงเวลาไทย เรียงใหม่สุด แบ่งหน้าเกิน 1000 และบอกว่าเป็นผู้สอนหรือไม่', async () => {
    const row = (n: number, userId: string) => ({
      created_at: `2026-11-05T0${n % 10}:00:00Z`, kind: 'live', user_id: userId,
      users: { full_name: null, email: `${userId}@x` },
      sessions: {
        starts_at: 'a', ends_at: 'b', kind: 'exam', title: 'กลางภาค',
        courses: { code: 'CS1', name: 'x', teacher_id: 't1' }, rooms: { name: 'R1' },
        session_proctors: [{ user_id: 'p1' }],
      },
    });
    const all = Array.from({ length: 1500 }, (_, n) => row(n, ['t1', 'p1', 'other'][n % 3]));
    const range = vi.fn(async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }));
    const query: Record<string, unknown> = { range };
    for (const m of ['gte', 'lt', 'order']) query[m] = vi.fn(() => query);
    const from = vi.fn(() => ({ select: () => query }));
    const repo = new SupabaseAdminRepo({ from } as unknown as SupabaseClient);
    const result = await repo.listVideoViews('2026-11-05T00:00:00+07:00', '2026-11-06T00:00:00+07:00');
    expect(from).toHaveBeenCalledWith('video_views');
    expect(query.gte).toHaveBeenCalledWith('created_at', '2026-11-05T00:00:00+07:00');
    expect(query.lt).toHaveBeenCalledWith('created_at', '2026-11-06T00:00:00+07:00');
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result).toHaveLength(1500);
    expect(range).toHaveBeenCalledTimes(3);
    expect(result.slice(0, 3).map((r) => r.isTeacherOfCourse)).toEqual([true, true, false]);
    expect(result[0]).toMatchObject({ courseCode: 'CS1', roomName: 'R1', sessionKind: 'exam', sessionTitle: 'กลางภาค' });
  });
  it('video views: ดูต่อเนื่องคนเดียวกันคาบเดียวกันรวมเป็นแถวเดียว ห่างเกิน 5 นาทีหรือคนละแบบแยกแถว', () => {
    const view = (at: string, userId = 'u1', kind = 'live', sessionId = 's1') => ({
      viewedAt: at, until: at, kind, userId, sessionId,
    });
    const rows = [
      view('2026-11-06T10:42:40Z'),
      view('2026-11-06T10:42:34Z'),
      view('2026-11-06T10:40:00Z'),
      view('2026-11-06T10:30:00Z'),
      view('2026-11-06T10:29:00Z', 'u1', 'playback'),
      view('2026-11-06T10:28:00Z', 'u2'),
    ];
    expect(mergeViews(rows).map((r) => [r.viewedAt, r.until, r.kind, r.userId])).toEqual([
      ['2026-11-06T10:40:00Z', '2026-11-06T10:42:40Z', 'live', 'u1'],
      ['2026-11-06T10:30:00Z', '2026-11-06T10:30:00Z', 'live', 'u1'],
      ['2026-11-06T10:29:00Z', '2026-11-06T10:29:00Z', 'playback', 'u1'],
      ['2026-11-06T10:28:00Z', '2026-11-06T10:28:00Z', 'live', 'u2'],
    ]);
  });

  it('inserts the whole catalog import in one statement and reports duplicate conflicts', async () => {
    const select = vi.fn().mockResolvedValue({ error: { code: '23505' } });
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const repo = new SupabaseCatalogRepo({ from } as unknown as SupabaseClient);
    const row = { code: 'CS', name: 'CS', year: 2569, category: null, url: null, content: '', active: true };
    await expect(repo.insert('curricula', [row, { ...row, code: 'IT' }])).rejects.toMatchObject({ status: 409, code: 'CATALOG_EXISTS' });
    expect(from).toHaveBeenCalledWith('admin_catalog');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith([{ ...row, kind: 'curricula' }, { ...row, code: 'IT', kind: 'curricula' }]);
  });
});
