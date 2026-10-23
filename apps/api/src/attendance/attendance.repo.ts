import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chunk } from '../common/chunk.js';
import { dbError } from '../common/db-error.js';
import { DEFAULT_RULES } from '../courses/courses.service.js';
import type { Rules } from '../courses/courses.repo.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';
import type { AttendanceStatus } from './decide.js';

export interface SessionContext {
  courseId: string;
  startsAt: Date;
  endsAt: Date;
  rules: Rules;
}

export interface FaceEmbedding {
  userId: string;
  pose: string;
  embedding: number[];
}

export interface AttendanceRow {
  status: AttendanceStatus;
  // มีค่าเมื่ออาจารย์แก้เอง
  updatedBy: string | null;
  imagePath: string | null;
}

export interface CameraRecord {
  sessionId: string;
  userId: string;
  status: AttendanceStatus;
  firstSeenAt: Date;
  confidence: number;
  imagePath: string | null;
}

export interface AttendanceRepo {
  sessionContext(sessionId: string): Promise<SessionContext | null>;
  faceEmbeddings(userIds: string[], model: string): Promise<FaceEmbedding[]>;
  find(sessionId: string, userId: string): Promise<AttendanceRow | null>;
  // บันทึกผลจากกล้อง (updated_by ว่าง)
  write(record: CameraRecord): Promise<void>;
  insertUnknown(sessionId: string, imagePath: string, seenAt: Date): Promise<void>;
  // ลบแถวหน้าที่ไม่รู้จักที่เก่ากว่า before คืน path ของรูป
  deleteUnknownBefore(before: Date): Promise<string[]>;
  uploadCapture(path: string, bytes: Buffer): Promise<void>;
  removeCaptures(paths: string[]): Promise<void>;
}

export const ATTENDANCE_REPO = Symbol('ATTENDANCE_REPO');

const BUCKET = 'captures';
const BATCH = 50;

@Injectable()
export class SupabaseAttendanceRepo implements AttendanceRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async sessionContext(sessionId: string): Promise<SessionContext | null> {
    const { data, error } = await this.db
      .from('sessions')
      .select('course_id, starts_at, ends_at')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw dbError();
    if (!data) return null;
    const session = data as { course_id: string; starts_at: string; ends_at: string };

    const { data: rules, error: rulesError } = await this.db
      .from('attendance_rules')
      .select('late_after_min, absent_after_min, out_of_room_limit_min')
      .eq('course_id', session.course_id)
      .maybeSingle();
    if (rulesError) throw dbError();
    const r = rules as {
      late_after_min: number;
      absent_after_min: number | null;
      out_of_room_limit_min: number;
    } | null;

    return {
      courseId: session.course_id,
      startsAt: new Date(session.starts_at),
      endsAt: new Date(session.ends_at),
      rules: r
        ? {
            lateAfterMin: r.late_after_min,
            absentAfterMin: r.absent_after_min,
            outOfRoomLimitMin: r.out_of_room_limit_min,
          }
        : DEFAULT_RULES,
    };
  }

  // คนละไม่เกิน 5 แถว ก้อนละ 50 คนจึงไม่เกิน 1000 แถวที่ Supabase คืนได้
  async faceEmbeddings(userIds: string[], model: string): Promise<FaceEmbedding[]> {
    const rows: FaceEmbedding[] = [];
    for (const batch of chunk(userIds, BATCH)) {
      const { data, error } = await this.db
        .from('face_profiles')
        .select('user_id, pose, embedding')
        .in('user_id', batch)
        .eq('model', model);
      if (error) throw dbError();
      for (const r of data as { user_id: string; pose: string; embedding: string | number[] }[]) {
        rows.push({
          userId: r.user_id,
          pose: r.pose,
          // pgvector ส่งกลับมาเป็นข้อความ "[0.1,0.2,...]"
          embedding:
            typeof r.embedding === 'string' ? (JSON.parse(r.embedding) as number[]) : r.embedding,
        });
      }
    }
    return rows;
  }

  async find(sessionId: string, userId: string): Promise<AttendanceRow | null> {
    const { data, error } = await this.db
      .from('attendance')
      .select('status, updated_by, image_path')
      .eq('session_id', sessionId)
      .eq('student_id', userId)
      .maybeSingle();
    if (error) throw dbError();
    if (!data) return null;
    const row = data as { status: AttendanceStatus; updated_by: string | null; image_path: string | null };
    return { status: row.status, updatedBy: row.updated_by, imagePath: row.image_path };
  }

  async write(record: CameraRecord): Promise<void> {
    const { error } = await this.db.from('attendance').upsert(
      {
        session_id: record.sessionId,
        student_id: record.userId,
        status: record.status,
        first_seen_at: record.firstSeenAt.toISOString(),
        confidence: record.confidence,
        image_path: record.imagePath,
        updated_by: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,student_id' },
    );
    if (error) throw dbError();
  }

  async insertUnknown(sessionId: string, imagePath: string, seenAt: Date): Promise<void> {
    const { error } = await this.db
      .from('unknown_faces')
      .insert({ session_id: sessionId, image_path: imagePath, seen_at: seenAt.toISOString() });
    if (error) throw dbError();
  }

  async deleteUnknownBefore(before: Date): Promise<string[]> {
    const { data, error } = await this.db
      .from('unknown_faces')
      .delete()
      .lt('seen_at', before.toISOString())
      .select('image_path');
    if (error) throw dbError();
    return (data as { image_path: string }[]).map((r) => r.image_path);
  }

  async uploadCapture(path: string, bytes: Buffer): Promise<void> {
    const { error } = await this.db.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) throw dbError();
  }

  async removeCaptures(paths: string[]): Promise<void> {
    for (const batch of chunk(paths, 100)) {
      const { error } = await this.db.storage.from(BUCKET).remove(batch);
      if (error) throw dbError();
    }
  }
}
