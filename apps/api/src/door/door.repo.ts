import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export type TripStatus = 'confirmed' | 'pending' | 'unknown';

export interface NewTrip {
  sessionId: string;
  userId: string | null;
  status: TripStatus;
  outAt: Date;
  confidence: number | null;
  imagePath: string | null;
}

export interface DoorRepo {
  // ชน unique index (คนนี้มีรอบที่ยังไม่กลับอยู่แล้ว) = false
  insertTrip(trip: NewTrip): Promise<boolean>;
  // คนที่มีรอบที่ยังไม่กลับในคาบ (confirmed และ pending)
  openTripUserIds(sessionId: string): Promise<string[]>;
  // ปิดเฉพาะรอบที่ยังไม่กลับ ออกก่อนเวลากลับ และอาจารย์ยังไม่แตะ
  closeTrip(sessionId: string, userId: string, backAt: Date, by: 'front'): Promise<boolean>;
  unknownTripsBefore(before: Date): Promise<{ id: string; imagePath: string | null }[]>;
  deleteTrips(ids: string[]): Promise<void>;
}

export const DOOR_REPO = Symbol('DOOR_REPO');

const UNIQUE_VIOLATION = '23505';
const BATCH = 50;

@Injectable()
export class SupabaseDoorRepo implements DoorRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async insertTrip(trip: NewTrip): Promise<boolean> {
    const { error } = await this.db.from('door_trips').insert({
      session_id: trip.sessionId,
      student_id: trip.userId,
      status: trip.status,
      out_at: trip.outAt.toISOString(),
      confidence: trip.confidence,
      image_path: trip.imagePath,
    });
    if (error?.code === UNIQUE_VIOLATION) return false;
    if (error) throw dbError();
    return true;
  }

  async openTripUserIds(sessionId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('door_trips')
      .select('student_id')
      .eq('session_id', sessionId)
      .is('back_at', null)
      .not('student_id', 'is', null);
    if (error) throw dbError();
    return (data as { student_id: string }[]).map((r) => r.student_id);
  }

  async closeTrip(sessionId: string, userId: string, backAt: Date, by: 'front'): Promise<boolean> {
    const { data, error } = await this.db
      .from('door_trips')
      .update({ back_at: backAt.toISOString(), back_by: by })
      .eq('session_id', sessionId)
      .eq('student_id', userId)
      .is('back_at', null)
      .is('updated_by', null)
      .lt('out_at', backAt.toISOString())
      .select('id');
    if (error) throw dbError();
    return data.length > 0;
  }

  async unknownTripsBefore(before: Date): Promise<{ id: string; imagePath: string | null }[]> {
    const { data, error } = await this.db
      .from('door_trips')
      .select('id, image_path')
      .eq('status', 'unknown')
      .lt('out_at', before.toISOString())
      .limit(1000);
    if (error) throw dbError();
    return (data as { id: string; image_path: string | null }[]).map((r) => ({
      id: r.id,
      imagePath: r.image_path,
    }));
  }

  async deleteTrips(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += BATCH) {
      const { error } = await this.db
        .from('door_trips')
        .delete()
        .in('id', ids.slice(i, i + BATCH));
      if (error) throw dbError();
    }
  }
}
