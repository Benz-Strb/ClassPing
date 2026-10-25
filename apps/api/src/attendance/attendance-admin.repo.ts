import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../common/app-error.js';
import { dbError } from '../common/db-error.js';
import type { Rules } from '../courses/courses.repo.js';
import { DEFAULT_RULES } from '../courses/courses.service.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';
import type { AttendanceStatus, SessionRules } from './decide.js';

export interface SessionInfo extends SessionRules {
  id: string;
  title: string | null;
  courseId: string;
  scheduleId: string | null;
  roomId: string;
  roomName: string;
  onDate: string;
  startsAt: Date;
  endsAt: Date;
}

export interface StoredAttendance {
  userId: string;
  status: AttendanceStatus;
  firstSeenAt: Date | null;
  confidence: number | null;
  imagePath: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
}

export interface UnknownFace {
  imagePath: string;
  seenAt: Date;
}

// ส่วนที่อาจารย์ดูและแก้ผลเช็คชื่อ แยกจากส่วนที่ worker ใช้
export interface AttendanceAdminRepo {
  session(sessionId: string): Promise<SessionInfo | null>;
  rules(courseId: string): Promise<Rules>;
  listBySession(sessionId: string): Promise<StoredAttendance[]>;
  recentUnknown(sessionId: string, limit: number): Promise<UnknownFace[]>;
  signCaptures(paths: string[], seconds: number): Promise<Map<string, string>>;
  // ไม่มีแถวก็เพิ่มใหม่ ค่าอื่นของแถวเดิม (เวลาที่เห็น รูป) คงไว้
  setStatus(sessionId: string, userId: string, status: AttendanceStatus, teacherId: string): Promise<void>;
  moveRow(
    sessionId: string,
    fromUserId: string,
    toUserId: string,
    status: AttendanceStatus,
    teacherId: string,
  ): Promise<void>;
  deleteRow(sessionId: string, userId: string): Promise<void>;
  insertUnknown(sessionId: string, imagePath: string, seenAt: Date): Promise<void>;
}

export const ATTENDANCE_ADMIN_REPO = Symbol('ATTENDANCE_ADMIN_REPO');

const BUCKET = 'captures';

interface Row {
  student_id: string;
  status: AttendanceStatus;
  first_seen_at: string | null;
  confidence: number | null;
  image_path: string | null;
  updated_by: string | null;
  editor: { full_name: string | null; email: string } | null;
}

@Injectable()
export class SupabaseAttendanceAdminRepo implements AttendanceAdminRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async session(sessionId: string): Promise<SessionInfo | null> {
    const { data, error } = await this.db
      .from('sessions')
      .select(
        'id, course_id, schedule_id, room_id, on_date, starts_at, ends_at, kind, title, late_after_min, absent_after_min, rooms(name)',
      )
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw dbError();
    if (!data) return null;
    const row = data as unknown as {
      id: string;
      course_id: string;
      schedule_id: string | null;
      room_id: string;
      on_date: string;
      starts_at: string;
      ends_at: string;
      kind: 'class' | 'exam';
      title: string | null;
      late_after_min: number | null;
      absent_after_min: number | null;
      rooms: { name: string } | null;
    };
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      lateAfterMin: row.late_after_min,
      absentAfterMin: row.absent_after_min,
      courseId: row.course_id,
      scheduleId: row.schedule_id,
      roomId: row.room_id,
      roomName: row.rooms?.name ?? '',
      onDate: row.on_date,
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
    };
  }

  async rules(courseId: string): Promise<Rules> {
    const { data, error } = await this.db
      .from('attendance_rules')
      .select('late_after_min, absent_after_min, out_of_room_limit_min')
      .eq('course_id', courseId)
      .maybeSingle();
    if (error) throw dbError();
    if (!data) return DEFAULT_RULES;
    const r = data as {
      late_after_min: number;
      absent_after_min: number | null;
      out_of_room_limit_min: number;
    };
    return {
      lateAfterMin: r.late_after_min,
      absentAfterMin: r.absent_after_min,
      outOfRoomLimitMin: r.out_of_room_limit_min,
    };
  }

  async listBySession(sessionId: string): Promise<StoredAttendance[]> {
    const { data, error } = await this.db
      .from('attendance')
      .select(
        'student_id, status, first_seen_at, confidence, image_path, updated_by, ' +
          'editor:users!attendance_updated_by_fkey(full_name, email)',
      )
      .eq('session_id', sessionId);
    if (error) throw dbError();
    return (data as unknown as Row[]).map((r) => ({
      userId: r.student_id,
      status: r.status,
      firstSeenAt: r.first_seen_at ? new Date(r.first_seen_at) : null,
      confidence: r.confidence,
      imagePath: r.image_path,
      updatedBy: r.updated_by,
      updatedByName: r.editor ? (r.editor.full_name ?? r.editor.email) : null,
    }));
  }

  async recentUnknown(sessionId: string, limit: number): Promise<UnknownFace[]> {
    const { data, error } = await this.db
      .from('unknown_faces')
      .select('image_path, seen_at')
      .eq('session_id', sessionId)
      .order('seen_at', { ascending: false })
      .limit(limit);
    if (error) throw dbError();
    return (data as { image_path: string; seen_at: string }[]).map((r) => ({
      imagePath: r.image_path,
      seenAt: new Date(r.seen_at),
    }));
  }

  async signCaptures(paths: string[], seconds: number): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    if (!paths.length) return urls;
    const { data, error } = await this.db.storage.from(BUCKET).createSignedUrls(paths, seconds);
    if (error) throw dbError();
    for (const item of data) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
    return urls;
  }

  async setStatus(
    sessionId: string,
    userId: string,
    status: AttendanceStatus,
    teacherId: string,
  ): Promise<void> {
    const { error } = await this.db.from('attendance').upsert(
      {
        session_id: sessionId,
        student_id: userId,
        status,
        updated_by: teacherId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,student_id' },
    );
    if (error) throw dbError();
  }

  async moveRow(
    sessionId: string,
    fromUserId: string,
    toUserId: string,
    status: AttendanceStatus,
    teacherId: string,
  ): Promise<void> {
    // เปลี่ยน student_id ในแถวเดิม รูปกับเวลาที่เห็นย้ายตามไปด้วยในคำสั่งเดียว
    const { error } = await this.db
      .from('attendance')
      .update({
        student_id: toUserId,
        status,
        updated_by: teacherId,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId)
      .eq('student_id', fromUserId);
    // กล้องเพิ่งบันทึกคนใหม่คนนี้พอดี
    if (error?.code === '23505') {
      throw new AppError(409, 'ALREADY_RECORDED', 'นักศึกษาคนนี้มีผลเช็คชื่อในคาบนี้แล้ว');
    }
    if (error) throw dbError();
  }

  async deleteRow(sessionId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from('attendance')
      .delete()
      .eq('session_id', sessionId)
      .eq('student_id', userId);
    if (error) throw dbError();
  }

  async insertUnknown(sessionId: string, imagePath: string, seenAt: Date): Promise<void> {
    const { error } = await this.db
      .from('unknown_faces')
      .insert({ session_id: sessionId, image_path: imagePath, seen_at: seenAt.toISOString() });
    if (error) throw dbError();
  }
}
