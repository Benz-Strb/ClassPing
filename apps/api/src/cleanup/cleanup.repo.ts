import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chunk } from '../common/chunk.js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

// captures/<sessionId>/... กับ faces/<userId>/... ชื่อโฟลเดอร์คือ id ของเจ้าของ
export type Bucket = 'captures' | 'faces';

export interface StoredFile {
  path: string;
  createdAt: Date;
}

export interface CleanupRepo {
  folders(bucket: Bucket): Promise<string[]>;
  files(bucket: Bucket, folder: string): Promise<StoredFile[]>;
  // id ที่ยังมีเจ้าของอยู่ (คาบหรือผู้ใช้)
  existingOwners(bucket: Bucket, ids: string[]): Promise<Set<string>>;
  // path ไหนใน paths ที่ยังมีแถวในฐานข้อมูลชี้ถึง (ถามทีละไฟล์ ไม่ดึงทั้งโฟลเดอร์ที่อาจเกินลิมิตแถว)
  referenced(bucket: Bucket, paths: string[]): Promise<Set<string>>;
  remove(bucket: Bucket, paths: string[]): Promise<void>;
}

export const CLEANUP_REPO = Symbol('CLEANUP_REPO');

const PAGE = 1000;

const OWNER_TABLE: Record<Bucket, string> = {
  captures: 'sessions',
  faces: 'users',
};

@Injectable()
export class SupabaseCleanupRepo implements CleanupRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async folders(bucket: Bucket): Promise<string[]> {
    // โฟลเดอร์ไม่มี id
    return (await this.list(bucket, '')).filter((e) => e.id === null).map((e) => e.name);
  }

  async files(bucket: Bucket, folder: string): Promise<StoredFile[]> {
    return (
      (await this.list(bucket, folder))
        .filter((e) => e.id !== null)
        // ไม่รู้เวลาอัปโหลด ถือว่าเพิ่งอัปโหลด จะได้ไม่ถูกลบ
        .map((e) => ({
          path: `${folder}/${e.name}`,
          createdAt: e.created_at ? new Date(e.created_at) : new Date(),
        }))
    );
  }

  async existingOwners(bucket: Bucket, ids: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    for (const batch of chunk(ids, 100)) {
      const { data, error } = await this.db.from(OWNER_TABLE[bucket]).select('id').in('id', batch);
      if (error) throw dbError();
      for (const row of data as { id: string }[]) found.add(row.id);
    }
    return found;
  }

  async referenced(bucket: Bucket, paths: string[]): Promise<Set<string>> {
    const tables = bucket === 'captures' ? ['attendance', 'unknown_faces'] : ['face_profiles'];
    const found = new Set<string>();
    for (const table of tables) {
      for (const batch of chunk(paths, 100)) {
        const { data, error } = await this.db
          .from(table)
          .select('image_path')
          .in('image_path', batch);
        if (error) throw dbError();
        for (const row of data as { image_path: string }[]) found.add(row.image_path);
      }
    }
    return found;
  }

  async remove(bucket: Bucket, paths: string[]): Promise<void> {
    for (const batch of chunk(paths, 100)) {
      const { error } = await this.db.storage.from(bucket).remove(batch);
      if (error) throw dbError();
    }
  }

  private async list(bucket: Bucket, prefix: string) {
    const entries: {
      id: string | null;
      name: string;
      created_at: string | null;
    }[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await this.db.storage.from(bucket).list(prefix, {
        limit: PAGE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw dbError();
      entries.push(...data);
      if (data.length < PAGE) return entries;
    }
  }
}
