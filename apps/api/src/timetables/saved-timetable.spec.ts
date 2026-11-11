import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { timetableExpiry } from './saved-timetable.js';
import { TimetablesRepo } from './timetables.repo.js';

describe('saved timetable retention', () => {
  it.each([
    ['2026-11-10T07:00:00.000Z', '2027-04-10T07:00:00.000Z'],
    ['2026-09-30T07:00:00.000Z', '2027-02-28T07:00:00.000Z'],
    ['2023-09-30T07:00:00.000Z', '2024-02-29T07:00:00.000Z'],
  ])('expires five calendar months after %s', (start, end) => {
    expect(timetableExpiry(new Date(start))).toBe(end);
  });

  function database() {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(), maybeSingle: vi.fn(),
      upsert: vi.fn().mockReturnThis(), single: vi.fn(),
    };
    const db = { from: vi.fn().mockReturnValue(query) };
    return { query, db, repo: new TimetablesRepo(db as unknown as SupabaseClient) };
  }

  it('filters by owner and expiry and returns no expired record', async () => {
    const { query, db, repo } = database();
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await repo.saved('current-user')).toBeNull();
    expect(db.from).toHaveBeenCalledWith('saved_timetables');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'current-user');
    expect(query.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });

  it('updates the same user record and returns persisted server values', async () => {
    const { query, repo } = database();
    const saved = { identity: { studentId: '650001', fullName: 'สมชาย ใจดี' }, ownershipProof: 'proof', rows: [], savedAt: '2026-11-10T07:00:00Z', expiresAt: '2027-04-10T07:00:00Z' };
    query.single.mockResolvedValue({ data: { identity: saved.identity, ownership_proof: saved.ownershipProof, rows: [], saved_at: saved.savedAt, expires_at: saved.expiresAt }, error: null });
    expect(await repo.save('current-user', saved)).toEqual(saved);
    expect(query.upsert).toHaveBeenCalledWith({ identity: saved.identity, ownership_proof: saved.ownershipProof, user_id: 'current-user', rows: [], saved_at: saved.savedAt, expires_at: saved.expiresAt }, { onConflict: 'user_id' });
  });
});
