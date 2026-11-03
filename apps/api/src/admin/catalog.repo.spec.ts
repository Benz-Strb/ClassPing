import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseCatalogRepo, type CatalogInput } from './catalog.repo.js';

const input: CatalogInput = { name: 'FAQ', content: 'Answer', active: true, code: null, category: null, year: null, url: null };
const rows = [
  { ...input, id: 'indexed', kind: 'knowledge' },
  { ...input, id: 'legacy', kind: 'knowledge' },
  { ...input, id: 'off', kind: 'knowledge', active: false },
];
function setup() {
  const catalog = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: rows.map((row) => ({ ...row })), error: null }) };
  const sources = { select: vi.fn().mockReturnThis(), like: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [{ source_key: 'catalog:indexed' }], error: null }) };
  const db = { from: vi.fn((table: string) => table === 'admin_catalog' ? catalog : sources), rpc: vi.fn().mockResolvedValue({ data: rows[0], error: null }) };
  return { repo: new SupabaseCatalogRepo(db as unknown as SupabaseClient), db, sources };
}
describe('Catalog retrieval repository', () => {
  it('distinguishes existing unindexed entries from enabled and disabled sources', async () => {
    const { repo, sources } = setup();
    const result = await repo.list('knowledge');
    expect(result.map(({ id, ragStatus }) => ({ id, ragStatus }))).toEqual([
      { id: 'indexed', ragStatus: 'synced' }, { id: 'legacy', ragStatus: 'pending' }, { id: 'off', ragStatus: 'inactive' },
    ]);
    expect(sources.like).toHaveBeenCalledWith('source_key', 'catalog:%');
  });
  it('uses one RPC for both catalog and index, and returns its saved row', async () => {
    const { repo, db } = setup();
    expect(await repo.saveKnowledge(null, input, [])).toMatchObject({ id: 'indexed', ragStatus: 'synced' });
    expect(db.rpc).toHaveBeenCalledWith('save_catalog_knowledge', { entry_id: null, entry: input, chunks: [] });
    expect(db.from).not.toHaveBeenCalled();
  });
  it('surfaces an unavailable migration or transaction as a failed save', async () => {
    const { repo, db } = setup();
    db.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
    await expect(repo.saveKnowledge(null, input, [])).rejects.toMatchObject({ code: 'DB_UNAVAILABLE' });
  });
  it('returns not found when the transaction finds no matching entry', async () => {
    const { repo, db } = setup();
    db.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await repo.saveKnowledge('missing', input, [])).toBeNull();
  });
});
