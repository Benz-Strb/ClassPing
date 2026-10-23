import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export interface CameraIdentity {
  id: string;
  roomId: string;
  kind: 'front' | 'door';
}

export interface LiveSession {
  id: string;
  courseCode: string;
  courseName: string;
  startsAt: Date;
  endsAt: Date;
}

export interface CameraRepo {
  findByTokenHash(hash: string): Promise<CameraIdentity | null>;
  touch(cameraId: string, at: Date): Promise<void>;
  // คาบของห้องที่เริ่มไม่เกิน opensBy และยังไม่จบ ณ now
  liveSession(roomId: string, opensBy: Date, now: Date): Promise<LiveSession | null>;
}

export const CAMERA_REPO = Symbol('CAMERA_REPO');

interface SessionRow {
  id: string;
  starts_at: string;
  ends_at: string;
  courses: { code: string; name: string } | null;
}

@Injectable()
export class SupabaseCameraRepo implements CameraRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async findByTokenHash(hash: string): Promise<CameraIdentity | null> {
    const { data, error } = await this.db
      .from('cameras')
      .select('id, room_id, kind')
      .eq('token_hash', hash)
      .maybeSingle();
    if (error) throw dbError();
    if (!data) return null;
    const row = data as { id: string; room_id: string; kind: 'front' | 'door' };
    return { id: row.id, roomId: row.room_id, kind: row.kind };
  }

  async touch(cameraId: string, at: Date): Promise<void> {
    const { error } = await this.db
      .from('cameras')
      .update({ last_seen_at: at.toISOString() })
      .eq('id', cameraId);
    if (error) throw dbError();
  }

  async liveSession(roomId: string, opensBy: Date, now: Date): Promise<LiveSession | null> {
    const { data, error } = await this.db
      .from('sessions')
      .select('id, starts_at, ends_at, courses(code, name)')
      .eq('room_id', roomId)
      .lte('starts_at', opensBy.toISOString())
      .gt('ends_at', now.toISOString())
      .order('starts_at')
      .limit(1)
      .maybeSingle();
    if (error) throw dbError();
    if (!data) return null;
    const row = data as unknown as SessionRow;
    return {
      id: row.id,
      courseCode: row.courses?.code ?? '',
      courseName: row.courses?.name ?? '',
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
    };
  }
}
