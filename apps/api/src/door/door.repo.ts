import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../common/app-error.js';
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

export interface StoredTrip {
  id: string;
  userId: string | null;
  status: TripStatus;
  outAt: Date;
  backAt: Date | null;
  backBy: 'front' | 'teacher' | null;
  confidence: number | null;
  imagePath: string | null;
}

// รอบที่รู้ว่าใคร พร้อมข้อมูลคาบที่ใช้คิดเกณฑ์
export interface CourseTrip {
  sessionId: string;
  onDate: string;
  kind: 'class' | 'exam';
  endsAt: Date;
  lateAfterMin: number | null;
  absentAfterMin: number | null;
  outOfRoomLimitMin: number | null;
  studentCode: string;
  outAt: Date;
  backAt: Date | null;
}

export type BackChange = 'keep' | 'clear' | { at: Date; by: string };

export interface DoorRepo {
  // ชน unique index (คนนี้มีรอบที่ยังไม่กลับอยู่แล้ว) = false
  insertTrip(trip: NewTrip): Promise<boolean>;
  // คนที่มีรอบที่ยังไม่กลับในคาบ (confirmed และ pending)
  openTripUserIds(sessionId: string): Promise<string[]>;
  // ปิดเฉพาะรอบที่ยังไม่กลับ ออกก่อนเวลากลับ และอาจารย์ยังไม่แตะ
  closeTrip(sessionId: string, userId: string, backAt: Date, by: 'front'): Promise<boolean>;
  unknownTripsBefore(before: Date): Promise<{ id: string; imagePath: string | null }[]>;
  deleteTrips(ids: string[]): Promise<void>;
  listTrips(sessionId: string): Promise<StoredTrip[]>;
  // อาจารย์ตั้งเวลากลับ (เฉพาะรอบ confirmed) false = ไม่มีรอบที่เข้าเงื่อนไข
  setBack(sessionId: string, tripId: string, backAt: Date, teacherId: string): Promise<boolean>;
  deleteTrip(sessionId: string, tripId: string): Promise<boolean>;
  // pending/unknown -> confirmed ให้คนนี้ ไม่ตั้ง updated_by เพื่อให้กล้องหน้าห้องปิดรอบต่อได้
  // back: keep = เวลากลับเดิม · clear = ล้าง · {at, by} = อาจารย์กรอก (ตั้ง back_by teacher และ updated_by)
  // ชน unique index = 409 TRIP_OPEN
  identify(sessionId: string, tripId: string, userId: string, back: BackChange): Promise<boolean>;
  courseTrips(courseId: string, from: string, to: string): Promise<CourseTrip[]>;
}

export const DOOR_REPO = Symbol('DOOR_REPO');

const UNIQUE_VIOLATION = '23505';
const BATCH = 50;
const PAGE = 1000;

interface TripRow {
  id: string;
  student_id: string | null;
  status: TripStatus;
  out_at: string;
  back_at: string | null;
  back_by: 'front' | 'teacher' | null;
  confidence: number | null;
  image_path: string | null;
}

interface CourseRow {
  session_id: string;
  out_at: string;
  back_at: string | null;
  student: { student_id: string | null } | null;
  sessions: {
    on_date: string;
    kind: 'class' | 'exam';
    ends_at: string;
    late_after_min: number | null;
    absent_after_min: number | null;
    out_of_room_limit_min: number | null;
  };
}

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

  async listTrips(sessionId: string): Promise<StoredTrip[]> {
    const { data, error } = await this.db
      .from('door_trips')
      .select('id, student_id, status, out_at, back_at, back_by, confidence, image_path')
      .eq('session_id', sessionId);
    if (error) throw dbError();
    return (data as TripRow[]).map((r) => ({
      id: r.id,
      userId: r.student_id,
      status: r.status,
      outAt: new Date(r.out_at),
      backAt: r.back_at ? new Date(r.back_at) : null,
      backBy: r.back_by,
      confidence: r.confidence,
      imagePath: r.image_path,
    }));
  }

  async setBack(
    sessionId: string,
    tripId: string,
    backAt: Date,
    teacherId: string,
  ): Promise<boolean> {
    const { data, error } = await this.db
      .from('door_trips')
      .update({ back_at: backAt.toISOString(), back_by: 'teacher', updated_by: teacherId })
      .eq('session_id', sessionId)
      .eq('id', tripId)
      .eq('status', 'confirmed')
      .select('id');
    if (error) throw dbError();
    return data.length > 0;
  }

  async deleteTrip(sessionId: string, tripId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('door_trips')
      .delete()
      .eq('session_id', sessionId)
      .eq('id', tripId)
      .select('id');
    if (error) throw dbError();
    return data.length > 0;
  }

  async identify(
    sessionId: string,
    tripId: string,
    userId: string,
    back: BackChange,
  ): Promise<boolean> {
    const { data, error } = await this.db
      .from('door_trips')
      .update({
        student_id: userId,
        status: 'confirmed',
        ...(back === 'clear' ? { back_at: null, back_by: null } : {}),
        ...(typeof back === 'object'
          ? { back_at: back.at.toISOString(), back_by: 'teacher', updated_by: back.by }
          : {}),
      })
      .eq('session_id', sessionId)
      .eq('id', tripId)
      .in('status', ['pending', 'unknown'])
      .select('id');
    if (error?.code === UNIQUE_VIOLATION) {
      throw new AppError(409, 'TRIP_OPEN', 'นักศึกษาคนนี้มีรอบที่ยังไม่กลับอยู่แล้ว');
    }
    if (error) throw dbError();
    return data.length > 0;
  }

  async courseTrips(courseId: string, from: string, to: string): Promise<CourseTrip[]> {
    // Supabase ตอบไม่เกิน 1000 แถวต่อครั้ง ต้องไล่ทีละหน้า
    const data: CourseRow[] = [];
    while (true) {
      const { data: page, error } = await this.db
        .from('door_trips')
        .select(
          'id, session_id, out_at, back_at, ' +
            'student:users!door_trips_student_id_fkey(student_id), ' +
            'sessions!inner(on_date, kind, ends_at, late_after_min, absent_after_min, out_of_room_limit_min)',
        )
        .eq('status', 'confirmed')
        .eq('sessions.course_id', courseId)
        .gte('sessions.on_date', from)
        .lte('sessions.on_date', to)
        .order('id')
        .range(data.length, data.length + PAGE - 1);
      if (error) throw dbError();
      const rows = page as unknown as CourseRow[];
      data.push(...rows);
      if (!rows.length) break;
    }
    return data.flatMap((r) =>
      r.student?.student_id
        ? [
            {
              sessionId: r.session_id,
              onDate: r.sessions.on_date,
              kind: r.sessions.kind,
              endsAt: new Date(r.sessions.ends_at),
              lateAfterMin: r.sessions.late_after_min,
              absentAfterMin: r.sessions.absent_after_min,
              outOfRoomLimitMin: r.sessions.out_of_room_limit_min,
              studentCode: r.student.student_id,
              outAt: new Date(r.out_at),
              backAt: r.back_at ? new Date(r.back_at) : null,
            },
          ]
        : [],
    );
  }
}
