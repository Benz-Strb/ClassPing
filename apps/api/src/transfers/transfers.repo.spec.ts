import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseTransfersRepo } from './transfers.repo.js';

describe('SupabaseTransfersRepo', () => {
  it.each(['transfer_requests', 'transfer_curriculum_documents'])(
    'ห้ามลบไฟล์ที่บันทึกสำเร็จใน %s แม้ client เห็น error',
    async (referencedTable) => {
      const remove = vi.fn().mockResolvedValue({ error: null });
      const db = {
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: table === referencedTable ? { id: 'saved' } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
        storage: { from: () => ({ remove }) },
      };
      await new SupabaseTransfersRepo(db as unknown as SupabaseClient).remove(
        'private/doc.pdf',
      );
      expect(remove).not.toHaveBeenCalled();
    },
  );
  it('เมื่อยืนยันไม่ได้ว่าไฟล์กำพร้า ต้องเก็บไฟล์ไว้', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: null,
                error: { code: 'NETWORK' },
              }),
            }),
          }),
        }),
      }),
      storage: { from: () => ({ remove }) },
    };
    await expect(
      new SupabaseTransfersRepo(db as unknown as SupabaseClient).remove(
        'private/doc.pdf',
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(remove).not.toHaveBeenCalled();
  });
  it('ลบได้เมื่อไม่พบการอ้างอิงในคำขอหรือหลักสูตร', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
      storage: { from: () => ({ remove }) },
    };
    await new SupabaseTransfersRepo(db as unknown as SupabaseClient).remove(
      'private/doc.pdf',
    );
    expect(remove).toHaveBeenCalledWith(['private/doc.pdf']);
  });
  it('การอนุมัติซ้ำจาก DB ต้องส่ง 409 กลับไปให้แก้ไขได้โดยไม่เขียนซ้ำ', async () => {
    const db = {
      rpc: async () => ({ error: { code: '23505', message: 'duplicate key' } }),
    };
    await expect(
      new SupabaseTransfersRepo(db as unknown as SupabaseClient).review(
        'request',
        'admin',
        [],
      ),
    ).rejects.toMatchObject({ status: 409, code: 'TRANSFER_ALREADY_GRANTED' });
  });
});
