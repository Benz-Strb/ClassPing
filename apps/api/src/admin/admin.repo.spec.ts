import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAdminRepo } from './admin.repo.js';
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
