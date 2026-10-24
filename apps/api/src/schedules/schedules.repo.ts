import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export interface NewSchedule {
  courseId: string;
  // 0 = อาทิตย์
  weekday: number;
  startTime: string;
  endTime: string;
  roomId: string;
}

export interface Schedule extends NewSchedule {
  id: string;
  courseCode: string;
  roomName: string;
}

// null = ใช้ค่าเดิม
export interface Override {
  scheduleId: string;
  onDate: string;
  cancelled: boolean;
  roomId: string | null;
  startTime: string | null;
  endTime: string | null;
}

// คาบสอบ ใช้เช็คห้อง/เวลาชนกับตารางเรียน
export interface ExamSlot {
  id: string;
  courseId: string;
  courseCode: string;
  roomId: string;
  roomName: string;
  onDate: string;
  startsAt: Date;
  endsAt: Date;
}

export interface SchedulesRepo {
  listAll(): Promise<Schedule[]>;
  listByCourse(courseId: string): Promise<Schedule[]>;
  findById(id: string): Promise<Schedule | null>;
  listByWeekday(weekday: number): Promise<Schedule[]>;
  insert(schedule: NewSchedule): Promise<Schedule>;
  update(id: string, patch: Partial<NewSchedule>): Promise<Schedule>;
  remove(id: string): Promise<void>;
  listOverrides(scheduleIds: string[], from: string, to: string): Promise<Override[]>;
  listOverridesBetween(from: string, to: string): Promise<Override[]>;
  listOverridesOnDate(date: string): Promise<Override[]>;
  listExamsBetween(from: string, to: string): Promise<ExamSlot[]>;
  saveOverride(override: Override): Promise<Override>;
  removeOverride(scheduleId: string, date: string): Promise<boolean>;
}

export const SCHEDULES_REPO = Symbol('SCHEDULES_REPO');

interface ScheduleRow {
  id: string;
  course_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  room_id: string;
  rooms: { name: string } | null;
  courses: { code: string } | null;
}

interface OverrideRow {
  schedule_id: string;
  on_date: string;
  cancelled: boolean;
  room_id: string | null;
  start_time: string | null;
  end_time: string | null;
}

const SCHEDULE_COLUMNS =
  'id, course_id, weekday, start_time, end_time, room_id, rooms(name), courses(code)';
const OVERRIDE_COLUMNS = 'schedule_id, on_date, cancelled, room_id, start_time, end_time';

// Postgres คืน time เป็น HH:MM:SS
const hhmm = (time: string) => time.slice(0, 5);

const toSchedule = (row: ScheduleRow): Schedule => ({
  id: row.id,
  courseId: row.course_id,
  weekday: row.weekday,
  startTime: hhmm(row.start_time),
  endTime: hhmm(row.end_time),
  roomId: row.room_id,
  courseCode: row.courses?.code ?? '',
  roomName: row.rooms?.name ?? '',
});

const toOverride = (row: OverrideRow): Override => ({
  scheduleId: row.schedule_id,
  onDate: row.on_date,
  cancelled: row.cancelled,
  roomId: row.room_id,
  startTime: row.start_time && hhmm(row.start_time),
  endTime: row.end_time && hhmm(row.end_time),
});

const scheduleRow = (s: Partial<NewSchedule>) => ({
  ...(s.courseId !== undefined && { course_id: s.courseId }),
  ...(s.weekday !== undefined && { weekday: s.weekday }),
  ...(s.startTime !== undefined && { start_time: s.startTime }),
  ...(s.endTime !== undefined && { end_time: s.endTime }),
  ...(s.roomId !== undefined && { room_id: s.roomId }),
});

@Injectable()
export class SupabaseSchedulesRepo implements SchedulesRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async listAll(): Promise<Schedule[]> {
    const { data, error } = await this.db.from('schedules').select(SCHEDULE_COLUMNS);
    if (error) throw dbError();
    return (data as unknown as ScheduleRow[]).map(toSchedule);
  }

  async listByCourse(courseId: string): Promise<Schedule[]> {
    const { data, error } = await this.db
      .from('schedules')
      .select(SCHEDULE_COLUMNS)
      .eq('course_id', courseId)
      .order('weekday')
      .order('start_time');
    if (error) throw dbError();
    return (data as unknown as ScheduleRow[]).map(toSchedule);
  }

  async findById(id: string): Promise<Schedule | null> {
    const { data, error } = await this.db
      .from('schedules')
      .select(SCHEDULE_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError();
    return data ? toSchedule(data as unknown as ScheduleRow) : null;
  }

  async listByWeekday(weekday: number): Promise<Schedule[]> {
    const { data, error } = await this.db
      .from('schedules')
      .select(SCHEDULE_COLUMNS)
      .eq('weekday', weekday);
    if (error) throw dbError();
    return (data as unknown as ScheduleRow[]).map(toSchedule);
  }

  async insert(schedule: NewSchedule): Promise<Schedule> {
    const { data, error } = await this.db
      .from('schedules')
      .insert(scheduleRow(schedule))
      .select(SCHEDULE_COLUMNS)
      .single();
    if (error || !data) throw dbError();
    return toSchedule(data as unknown as ScheduleRow);
  }

  async update(id: string, patch: Partial<NewSchedule>): Promise<Schedule> {
    const { data, error } = await this.db
      .from('schedules')
      .update(scheduleRow(patch))
      .eq('id', id)
      .select(SCHEDULE_COLUMNS)
      .single();
    if (error || !data) throw dbError();
    return toSchedule(data as unknown as ScheduleRow);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from('schedules').delete().eq('id', id);
    if (error) throw dbError();
  }

  async listOverrides(scheduleIds: string[], from: string, to: string): Promise<Override[]> {
    if (!scheduleIds.length) return [];
    const { data, error } = await this.db
      .from('schedule_overrides')
      .select(OVERRIDE_COLUMNS)
      .in('schedule_id', scheduleIds)
      .gte('on_date', from)
      .lte('on_date', to)
      .order('on_date');
    if (error) throw dbError();
    return (data as OverrideRow[]).map(toOverride);
  }

  async listOverridesBetween(from: string, to: string): Promise<Override[]> {
    const { data, error } = await this.db
      .from('schedule_overrides')
      .select(OVERRIDE_COLUMNS)
      .gte('on_date', from)
      .lte('on_date', to);
    if (error) throw dbError();
    return (data as OverrideRow[]).map(toOverride);
  }

  async listExamsBetween(from: string, to: string): Promise<ExamSlot[]> {
    const { data, error } = await this.db
      .from('sessions')
      .select('id, course_id, room_id, on_date, starts_at, ends_at, rooms(name), courses(code)')
      .eq('kind', 'exam')
      .gte('on_date', from)
      .lte('on_date', to);
    if (error) throw dbError();
    return (
      data as unknown as {
        id: string;
        course_id: string;
        room_id: string;
        on_date: string;
        starts_at: string;
        ends_at: string;
        rooms: { name: string } | null;
        courses: { code: string } | null;
      }[]
    ).map((row) => ({
      id: row.id,
      courseId: row.course_id,
      courseCode: row.courses?.code ?? '',
      roomId: row.room_id,
      roomName: row.rooms?.name ?? '',
      onDate: row.on_date,
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
    }));
  }

  async listOverridesOnDate(date: string): Promise<Override[]> {
    const { data, error } = await this.db
      .from('schedule_overrides')
      .select(OVERRIDE_COLUMNS)
      .eq('on_date', date);
    if (error) throw dbError();
    return (data as OverrideRow[]).map(toOverride);
  }

  async saveOverride(override: Override): Promise<Override> {
    const { data, error } = await this.db
      .from('schedule_overrides')
      .upsert(
        {
          schedule_id: override.scheduleId,
          on_date: override.onDate,
          cancelled: override.cancelled,
          room_id: override.roomId,
          start_time: override.startTime,
          end_time: override.endTime,
        },
        { onConflict: 'schedule_id,on_date' },
      )
      .select(OVERRIDE_COLUMNS)
      .single();
    if (error || !data) throw dbError();
    return toOverride(data as OverrideRow);
  }

  async removeOverride(scheduleId: string, date: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('schedule_overrides')
      .delete()
      .eq('schedule_id', scheduleId)
      .eq('on_date', date)
      .select('schedule_id');
    if (error) throw dbError();
    return data.length > 0;
  }
}
