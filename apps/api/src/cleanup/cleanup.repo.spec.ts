import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseCleanupRepo } from './cleanup.repo.js';

const SID = '11111111-1111-4111-8111-111111111111';

type Entry = { id: string | null; name: string; created_at: string | null };
const file = (name: string): Entry => ({
  id: `id-${name}`,
  name,
  created_at: '2026-10-23T10:00:00Z',
});
const folder = (name: string): Entry => ({ id: null, name, created_at: null });

// storage.list จดทุก prefix ที่ถูกถาม ส่วน from().select().in() จดชื่อตารางที่ถูกถาม
function recordingDb(tree: Record<string, Entry[]>, rows: Record<string, unknown[]> = {}) {
  const listed: string[] = [];
  const tables: string[] = [];
  const db = {
    storage: {
      from: () => ({
        list: async (prefix: string, opts: { limit: number; offset: number }) => {
          listed.push(prefix);
          return {
            data: (tree[prefix] ?? []).slice(opts.offset, opts.offset + opts.limit),
            error: null,
          };
        },
      }),
    },
    from: (table: string) => {
      tables.push(table);
      const q = {
        select: () => q,
        in: async () => ({ data: rows[table] ?? [], error: null }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, listed, tables };
}

describe('SupabaseCleanupRepo.files', () => {
  it('ลงไปในโฟลเดอร์ย่อย door และคืน path เต็ม', async () => {
    const { db, listed } = recordingDb({
      [SID]: [file('a.jpg'), folder('door')],
      [`${SID}/door`]: [file('x.jpg')],
    });
    const files = await new SupabaseCleanupRepo(db).files('captures', SID);
    expect(files.map((f) => f.path)).toEqual([`${SID}/a.jpg`, `${SID}/door/x.jpg`]);
    expect(listed).toEqual([SID, `${SID}/door`]);
  });

  it('โฟลเดอร์ย่อยที่มีเกิน 1000 ไฟล์ อ่านต่อทุกหน้า', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => file(`f${i}.jpg`));
    const { db } = recordingDb({ [SID]: [folder('door')], [`${SID}/door`]: many });
    const files = await new SupabaseCleanupRepo(db).files('captures', SID);
    expect(files).toHaveLength(1001);
  });
});

describe('SupabaseCleanupRepo.referenced', () => {
  it('captures ถามตาราง door_trips ด้วย และข้ามแถวที่ image_path เป็น null', async () => {
    const { db, tables } = recordingDb(
      {},
      { door_trips: [{ image_path: `${SID}/door/x.jpg` }, { image_path: null }] },
    );
    const found = await new SupabaseCleanupRepo(db).referenced('captures', [`${SID}/door/x.jpg`]);
    expect(tables).toEqual(['attendance', 'unknown_faces', 'door_trips']);
    expect([...found]).toEqual([`${SID}/door/x.jpg`]);
  });

  it('faces ไม่ถาม door_trips', async () => {
    const { db, tables } = recordingDb({});
    await new SupabaseCleanupRepo(db).referenced('faces', ['u/x.jpg']);
    expect(tables).toEqual(['face_profiles']);
  });
});
