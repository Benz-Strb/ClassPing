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

export interface AdminRepo {
  listUsers(): Promise<AdminUser[]>;
  updateUserRole(id: string, role: Role): Promise<AdminUser | null>;
  listRooms(): Promise<RoomView[]>;
  createRoom(name: string): Promise<RoomView>;
  findRoom(id: string): Promise<RoomView | null>;
  listCameras(): Promise<CameraView[]>;
  saveCameraToken(
    roomId: string,
    tokenHash: string,
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

@Injectable()
export class SupabaseAdminRepo implements AdminRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async listUsers(): Promise<AdminUser[]> {
    const { data, error } = await this.db
      .from('users')
      .select('id, email, full_name, role, student_id, face_profiles(id)')
      .order('email');
    if (error) throw dbError();
    return (data as unknown as UserRow[]).map(toUser);
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
  ): Promise<{ id: string; roomId: string }> {
    const result = await this.db
      .from('cameras')
      .upsert(
        { room_id: roomId, kind: 'front', token_hash: tokenHash },
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
