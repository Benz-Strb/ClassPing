import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../auth/role-from-email.js';
import { AppError } from '../common/app-error.js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  studentId: string | null;
  hasFace: boolean;
}

export interface RoomView {
  id: string;
  name: string;
}

export interface CameraView {
  id: string;
  roomId: string;
  roomName: string;
  kind: 'front' | 'door';
  lastSeenAt: string | null;
  hasToken: boolean;
}

export interface VideoViewRow {
  // ช่วงที่ดูต่อเนื่อง ดูสดต่อ token ทุกไม่กี่วินาที จึงรวมเป็นแถวเดียว
  viewedAt: string;
  until: string;
  kind: 'live' | 'playback' | 'download';
  viewerName: string | null;
  viewerEmail: string;
  courseCode: string;
  courseName: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  sessionKind: 'class' | 'exam';
  sessionTitle: string | null;
  isTeacherOfCourse: boolean;
}

export interface AdminRepo {
  listVideoViews(fromAt: string, toAt: string): Promise<VideoViewRow[]>;
  listUsers(): Promise<AdminUser[]>;
  findUser(id: string): Promise<AdminUser | null>;
  updateUserRole(id: string, role: Role): Promise<AdminUser | null>;
  listRooms(): Promise<RoomView[]>;
  createRoom(name: string): Promise<RoomView>;
  findRoom(id: string): Promise<RoomView | null>;
  listCameras(): Promise<CameraView[]>;
  saveCameraToken(
    roomId: string,
    tokenHash: string,
    kind: 'front' | 'door',
  ): Promise<{ id: string; roomId: string }>;
}

export const ADMIN_REPO = Symbol('ADMIN_REPO');

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  student_id: string | null;
  face_profiles: { id: string }[] | null;
}

const toUser = (row: UserRow): AdminUser => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  studentId: row.student_id,
  hasFace: (row.face_profiles?.length ?? 0) > 0,
});

async function allRows<T>(query: {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: unknown[] | null; error: unknown }>;
}): Promise<T[]> {
  const rows: T[] = [];
  while (true) {
    const { data, error } = await query.range(rows.length, rows.length + 999);
    if (error) throw dbError();
    if (!data?.length) return rows;
    rows.push(...(data as T[]));
  }
}

// คนเดียวกัน คาบเดียวกัน การดูแบบเดียวกัน ห่างกันไม่เกินนี้ ถือเป็นการดูครั้งเดียว
const VIEW_GAP_MS = 5 * 60_000;

// rows เรียงใหม่สุดก่อน
export function mergeViews<T extends { viewedAt: string; until: string; kind: string }>(
  rows: (T & { userId: string; sessionId: string })[],
): (T & { userId: string; sessionId: string })[] {
  const merged: (T & { userId: string; sessionId: string })[] = [];
  for (const row of rows) {
    const last = merged.at(-1);
    if (
      last &&
      last.userId === row.userId &&
      last.sessionId === row.sessionId &&
      last.kind === row.kind &&
      Date.parse(last.viewedAt) - Date.parse(row.viewedAt) <= VIEW_GAP_MS
    ) {
      last.viewedAt = row.viewedAt;
    } else {
      merged.push({ ...row });
    }
  }
  return merged;
}

interface VideoViewDbRow {
  created_at: string;
  session_id: string;
  kind: VideoViewRow['kind'];
  user_id: string;
  users: { full_name: string | null; email: string } | null;
  sessions: {
    starts_at: string;
    ends_at: string;
    kind: 'class' | 'exam';
    title: string | null;
    courses: { code: string; name: string; teacher_id: string } | null;
    rooms: { name: string } | null;
    session_proctors: { user_id: string }[] | null;
  } | null;
}

@Injectable()
export class SupabaseAdminRepo implements AdminRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  // fromAt รวม toAt ไม่รวม เรียงใหม่สุดก่อน
  async listVideoViews(fromAt: string, toAt: string): Promise<VideoViewRow[]> {
    const rows = await allRows<VideoViewDbRow>(
      this.db
        .from('video_views')
        .select(
          'created_at, session_id, kind, user_id, users(full_name, email), sessions(starts_at, ends_at, kind, title, courses(code, name, teacher_id), rooms(name), session_proctors(user_id))',
        )
        .gte('created_at', fromAt)
        .lt('created_at', toAt)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    );
    const views = rows.map((row) => {
      const session = row.sessions;
      const teaches =
        session?.courses?.teacher_id === row.user_id ||
        (session?.session_proctors ?? []).some((p) => p.user_id === row.user_id);
      return {
        userId: row.user_id,
        sessionId: row.session_id,
        viewedAt: row.created_at,
        until: row.created_at,
        kind: row.kind,
        viewerName: row.users?.full_name ?? null,
        viewerEmail: row.users?.email ?? '',
        courseCode: session?.courses?.code ?? '',
        courseName: session?.courses?.name ?? '',
        roomName: session?.rooms?.name ?? '',
        startsAt: session?.starts_at ?? '',
        endsAt: session?.ends_at ?? '',
        sessionKind: session?.kind ?? 'class',
        sessionTitle: session?.title ?? null,
        isTeacherOfCourse: teaches,
      };
    });
    return mergeViews(views).map(({ userId: _user, sessionId: _session, ...view }) => view);
  }

  async listUsers(): Promise<AdminUser[]> {
    // เรียงด้วย id ต่อท้ายให้ลำดับคงที่ตอนแบ่งหน้า
    const rows = await allRows<UserRow>(
      this.db
        .from('users')
        .select('id, email, full_name, role, student_id, face_profiles(id)')
        .order('email')
        .order('id'),
    );
    return rows.map(toUser);
  }

  async findUser(id: string): Promise<AdminUser | null> {
    const { data, error } = await this.db
      .from('users')
      .select('id, email, full_name, role, student_id, face_profiles(id)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError();
    return data ? toUser(data as unknown as UserRow) : null;
  }

  async updateUserRole(id: string, role: Role): Promise<AdminUser | null> {
    const changed = await this.db.rpc('admin_change_user_role', {
      target_id: id,
      next_role: role,
    });
    if (changed.error?.message.includes('LAST_ADMIN')) {
      throw new AppError(409, 'LAST_ADMIN', 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน');
    }
    if (changed.error?.message.includes('USER_NOT_FOUND')) return null;
    if (changed.error) throw dbError();

    const { data, error } = await this.db
      .from('users')
      .select('id, email, full_name, role, student_id, face_profiles(id)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError();
    return data ? toUser(data as unknown as UserRow) : null;
  }

  async listRooms(): Promise<RoomView[]> {
    const { data, error } = await this.db
      .from('rooms')
      .select('id, name')
      .order('name');
    if (error) throw dbError();
    return data as RoomView[];
  }

  async createRoom(name: string): Promise<RoomView> {
    const { data, error } = await this.db
      .from('rooms')
      .insert({ name })
      .select('id, name')
      .single();
    if (error?.code === '23505') {
      throw new AppError(409, 'ROOM_EXISTS', 'มีห้องชื่อนี้แล้ว');
    }
    if (error || !data) throw dbError();
    return data as RoomView;
  }

  async findRoom(id: string): Promise<RoomView | null> {
    const { data, error } = await this.db
      .from('rooms')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError();
    return data as RoomView | null;
  }

  async listCameras(): Promise<CameraView[]> {
    const { data, error } = await this.db
      .from('cameras')
      .select('id, room_id, kind, token_hash, last_seen_at, rooms(name)')
      .order('room_id');
    if (error) throw dbError();
    return (data ?? []).map((value) => {
      const row = value as unknown as {
        id: string;
        room_id: string;
        kind: 'front' | 'door';
        token_hash: string | null;
        last_seen_at: string | null;
        rooms: { name: string } | null;
      };
      return {
        id: row.id,
        roomId: row.room_id,
        roomName: row.rooms?.name ?? '',
        kind: row.kind,
        lastSeenAt: row.last_seen_at,
        hasToken: Boolean(row.token_hash),
      };
    });
  }

  async saveCameraToken(
    roomId: string,
    tokenHash: string,
    kind: 'front' | 'door',
  ): Promise<{ id: string; roomId: string }> {
    const result = await this.db
      .from('cameras')
      .upsert(
        { room_id: roomId, kind, token_hash: tokenHash },
        { onConflict: 'room_id,kind' },
      )
      .select('id, room_id')
      .single();
    if (result.error || !result.data) throw dbError();
    return {
      id: result.data.id as string,
      roomId: result.data.room_id as string,
    };
  }
}
