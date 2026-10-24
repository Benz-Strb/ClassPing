import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';
import type { WatchableSession } from './video-access.js';

export type ViewKind = 'live' | 'playback' | 'download';

export interface LiveRepo {
  session(id: string): Promise<WatchableSession | null>;
  sessionsOnDate(date: string): Promise<WatchableSession[]>;
  logView(sessionId: string, userId: string, kind: ViewKind): Promise<void>;
}

export const LIVE_REPO = Symbol('LIVE_REPO');

const COLUMNS =
  'id, kind, title, course_id, room_id, starts_at, ends_at, courses(code, name, teacher_id), rooms(name), session_proctors(user_id)';

interface Row {
  id: string;
  kind: 'class' | 'exam';
  title: string | null;
  course_id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  courses: { code: string; name: string; teacher_id: string } | null;
  rooms: { name: string } | null;
  session_proctors: { user_id: string }[];
}

@Injectable()
export class SupabaseLiveRepo implements LiveRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async session(id: string): Promise<WatchableSession | null> {
    const { data, error } = await this.db
      .from('sessions')
      .select(COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError();
    if (!data) return null;
    const [session] = await this.withCameras([data as unknown as Row]);
    return session;
  }

  async sessionsOnDate(date: string): Promise<WatchableSession[]> {
    const { data, error } = await this.db
      .from('sessions')
      .select(COLUMNS)
      .eq('on_date', date)
      .order('starts_at');
    if (error) throw dbError();
    return this.withCameras(data as unknown as Row[]);
  }

  async logView(sessionId: string, userId: string, kind: ViewKind): Promise<void> {
    const { error } = await this.db
      .from('video_views')
      .insert({ session_id: sessionId, user_id: userId, kind });
    if (error) throw dbError();
  }

  private async withCameras(rows: Row[]): Promise<WatchableSession[]> {
    const roomIds = [...new Set(rows.map((r) => r.room_id))];
    const cameras = new Map<string, string>();
    if (roomIds.length) {
      const { data, error } = await this.db
        .from('cameras')
        .select('id, room_id')
        .eq('kind', 'front')
        .in('room_id', roomIds);
      if (error) throw dbError();
      for (const c of data as { id: string; room_id: string }[]) cameras.set(c.room_id, c.id);
    }
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      courseId: r.course_id,
      courseCode: r.courses?.code ?? '',
      courseName: r.courses?.name ?? '',
      teacherId: r.courses?.teacher_id ?? '',
      roomId: r.room_id,
      roomName: r.rooms?.name ?? '',
      startsAt: new Date(r.starts_at),
      endsAt: new Date(r.ends_at),
      proctorIds: r.session_proctors.map((p) => p.user_id),
      cameraId: cameras.get(r.room_id) ?? null,
    }));
  }
}
