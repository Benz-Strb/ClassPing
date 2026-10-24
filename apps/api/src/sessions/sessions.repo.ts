import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

// scheduleId = null ถ้าตารางถูกลบไปแล้ว
export interface NewSessionRow {
  scheduleId: string | null;
  courseId: string;
  roomId: string;
  onDate: string;
  startsAt: Date;
  endsAt: Date;
}

export interface SessionRow extends NewSessionRow {
  id: string;
  kind: 'class' | 'exam';
  title: string | null;
  roomName: string;
}

export interface SessionsRepo {
  // classOnly = เฉพาะคาบที่มาจากตารางเรียน (sync ห้ามแตะคาบสอบ)
  listByCourse(
    courseId: string,
    from: string,
    to: string,
    opts?: { classOnly?: boolean },
  ): Promise<SessionRow[]>;
  courseIdsInRange(from: string, to: string): Promise<string[]>;
  insert(sessions: NewSessionRow[]): Promise<void>;
  update(id: string, patch: Pick<SessionRow, 'roomId' | 'startsAt' | 'endsAt'>): Promise<void>;
  remove(ids: string[]): Promise<void>;
}

export const SESSIONS_REPO = Symbol('SESSIONS_REPO');

interface Row {
  id: string;
  kind: 'class' | 'exam';
  title: string | null;
  schedule_id: string | null;
  course_id: string;
  room_id: string;
  on_date: string;
  starts_at: string;
  ends_at: string;
  rooms: { name: string } | null;
}

const toSession = (row: Row): SessionRow => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  scheduleId: row.schedule_id,
  courseId: row.course_id,
  roomId: row.room_id,
  onDate: row.on_date,
  startsAt: new Date(row.starts_at),
  endsAt: new Date(row.ends_at),
  roomName: row.rooms?.name ?? '',
});

@Injectable()
export class SupabaseSessionsRepo implements SessionsRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async listByCourse(
    courseId: string,
    from: string,
    to: string,
    opts: { classOnly?: boolean } = {},
  ): Promise<SessionRow[]> {
    let query = this.db
      .from('sessions')
      .select(
        'id, kind, title, schedule_id, course_id, room_id, on_date, starts_at, ends_at, rooms(name)',
      )
      .eq('course_id', courseId)
      .gte('on_date', from)
      .lte('on_date', to);
    if (opts.classOnly) query = query.eq('kind', 'class');
    const { data, error } = await query.order('starts_at');
    if (error) throw dbError();
    return (data as unknown as Row[]).map(toSession);
  }

  async courseIdsInRange(from: string, to: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('sessions')
      .select('course_id')
      .gte('on_date', from)
      .lte('on_date', to);
    if (error) throw dbError();
    return [...new Set((data as { course_id: string }[]).map((r) => r.course_id))];
  }

  async insert(sessions: NewSessionRow[]): Promise<void> {
    if (!sessions.length) return;
    const { error } = await this.db.from('sessions').insert(
      sessions.map((s) => ({
        schedule_id: s.scheduleId,
        course_id: s.courseId,
        room_id: s.roomId,
        on_date: s.onDate,
        starts_at: s.startsAt.toISOString(),
        ends_at: s.endsAt.toISOString(),
      })),
    );
    if (error) throw dbError();
  }

  async update(
    id: string,
    patch: Pick<SessionRow, 'roomId' | 'startsAt' | 'endsAt'>,
  ): Promise<void> {
    const { error } = await this.db
      .from('sessions')
      .update({
        room_id: patch.roomId,
        starts_at: patch.startsAt.toISOString(),
        ends_at: patch.endsAt.toISOString(),
      })
      .eq('id', id);
    if (error) throw dbError();
  }

  async remove(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const { error } = await this.db.from('sessions').delete().in('id', ids);
    if (error) throw dbError();
  }
}
