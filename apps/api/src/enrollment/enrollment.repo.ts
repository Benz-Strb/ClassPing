import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';
import type { Pose } from './pose-check.js';

export interface FaceRow {
  pose: Pose;
  // path ใน bucket faces
  imagePath: string;
  embedding: number[];
  // โมเดลที่สร้าง embedding เวกเตอร์ต่างโมเดลเอามาเทียบกันไม่ได้
  model: string;
}

export interface EnrollmentRepo {
  listByUser(userId: string): Promise<FaceRow[]>;
  savePose(userId: string, row: FaceRow): Promise<void>;
  // keep = ท่าที่ไม่ลบ คืน path ของรูปในแถวที่ลบ
  deleteByUser(userId: string, keep?: Pose): Promise<string[]>;
  uploadImage(path: string, bytes: Buffer, mime: string): Promise<void>;
  removeImages(paths: string[]): Promise<void>;
  // ทุกไฟล์ใต้ faces/<userId>/ รวมไฟล์ที่ไม่มีแถวชี้ถึงแล้ว
  listImages(userId: string): Promise<string[]>;
  userExists(userId: string): Promise<boolean>;
}

export const ENROLLMENT_REPO = Symbol('ENROLLMENT_REPO');

const BUCKET = 'faces';

@Injectable()
export class SupabaseEnrollmentRepo implements EnrollmentRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async listByUser(userId: string): Promise<FaceRow[]> {
    const { data, error } = await this.db
      .from('face_profiles')
      .select('pose, image_path, embedding, model')
      .eq('user_id', userId);
    if (error) throw dbError();
    // pgvector ส่งกลับมาเป็นข้อความ "[0.1,0.2,...]"
    return (
      data as { pose: Pose; image_path: string; embedding: string | number[]; model: string }[]
    ).map((r) => ({
      pose: r.pose,
      imagePath: r.image_path,
      embedding:
        typeof r.embedding === 'string' ? (JSON.parse(r.embedding) as number[]) : r.embedding,
      model: r.model,
    }));
  }

  async savePose(userId: string, row: FaceRow): Promise<void> {
    const { error } = await this.db.from('face_profiles').upsert(
      {
        user_id: userId,
        pose: row.pose,
        embedding: JSON.stringify(row.embedding),
        image_path: row.imagePath,
        model: row.model,
      },
      { onConflict: 'user_id,pose' },
    );
    if (error) throw dbError();
  }

  async deleteByUser(userId: string, keep?: Pose): Promise<string[]> {
    let query = this.db.from('face_profiles').delete().eq('user_id', userId);
    if (keep) query = query.neq('pose', keep);
    const { data, error } = await query.select('image_path');
    if (error) throw dbError();
    return (data as { image_path: string }[]).map((r) => r.image_path);
  }

  async uploadImage(path: string, bytes: Buffer, mime: string): Promise<void> {
    const { error } = await this.db.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw dbError();
  }

  async removeImages(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const { error } = await this.db.storage.from(BUCKET).remove(paths);
    if (error) throw dbError();
  }

  async listImages(userId: string): Promise<string[]> {
    const { data, error } = await this.db.storage.from(BUCKET).list(userId, { limit: 1000 });
    if (error) throw dbError();
    return data.map((f) => `${userId}/${f.name}`);
  }

  async userExists(userId: string): Promise<boolean> {
    const { data, error } = await this.db.from('users').select('id').eq('id', userId).maybeSingle();
    if (error) throw dbError();
    return data !== null;
  }
}
