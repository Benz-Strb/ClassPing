import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import type { Role } from '../auth/role-from-email.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export interface Person {
  id: string;
  name: string | null;
  email: string;
}

// คาบสอบคือแถวใน sessions ที่ kind = 'exam'
export interface NewExam {
  courseId: string;
  title: string;
  onDate: string;
  startsAt: Date;
  endsAt: Date;
  roomId: string;
  lateAfterMin: number;
  absentAfterMin: number | null;
}

export interface ExamRow extends NewExam {
  id: string;
  roomName: string;
  proctors: Person[];
}

export interface ExamsRepo {
  listByCourse(courseId: string): Promise<ExamRow[]>;
  findById(id: string): Promise<ExamRow | null>;
  insert(exam: NewExam, proctorIds: string[]): Promise<string>;
  update(id: string, exam: Omit<NewExam, 'courseId'>): Promise<void>;
  setProctors(id: string, userIds: string[]): Promise<void>;
  remove(id: string): Promise<void>;
  findUsers(ids: string[]): Promise<{ id: string; role: Role }[]>;
  listTeachers(): Promise<Person[]>;
}

export const EXAMS_REPO = Symbol('EXAMS_REPO');

const COLUMNS =
  'id, course_id, title, on_date, starts_at, ends_at, room_id, late_after_min, absent_after_min, rooms(name), session_proctors(users(id, full_name, email))';

interface Row {
  id: string;
  course_id: string;
  title: string;
  on_date: string;
  starts_at: string;
  ends_at: string;
  room_id: string;
  late_after_min: number;
  absent_after_min: number | null;
  rooms: { name: string } | null;
  session_proctors: { users: { id: string; full_name: string | null; email: string } | null }[];
}

const toExam = (row: Row): ExamRow => ({
  id: row.id,
  courseId: row.course_id,
  title: row.title,
  onDate: row.on_date,
  startsAt: new Date(row.starts_at),
  endsAt: new Date(row.ends_at),
  roomId: row.room_id,
  roomName: row.rooms?.name ?? '',
  lateAfterMin: row.late_after_min,
  absentAfterMin: row.absent_after_min,
  proctors: row.session_proctors
    .flatMap((p) => (p.users ? [p.users] : []))
    .map((u) => ({ id: u.id, name: u.full_name, email: u.email })),
});

const toColumns = (exam: Omit<NewExam, 'courseId'>) => ({
  title: exam.title,
  on_date: exam.onDate,
  starts_at: exam.startsAt.toISOString(),
  ends_at: exam.endsAt.toISOString(),
  room_id: exam.roomId,
  late_after_min: exam.lateAfterMin,
  absent_after_min: exam.absentAfterMin,
});

@Injectable()
export class SupabaseExamsRepo implements ExamsRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async listByCourse(courseId: string): Promise<ExamRow[]> {
    const { data, error } = await this.db
      .from('sessions')
      .select(COLUMNS)
      .eq('kind', 'exam')
      .eq('course_id', courseId)
      .order('starts_at');
    if (error) throw dbError();
    return (data as unknown as Row[]).map(toExam);
  }

  async findById(id: string): Promise<ExamRow | null> {
    const { data, error } = await this.db
      .from('sessions')
      .select(COLUMNS)
      .eq('kind', 'exam')
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError();
    return data ? toExam(data as unknown as Row) : null;
  }

  async insert(exam: NewExam, proctorIds: string[]): Promise<string> {
    const { data, error } = await this.db
      .from('sessions')
      .insert({ kind: 'exam', course_id: exam.courseId, ...toColumns(exam) })
      .select('id')
      .single();
    if (error || !data) throw dbError();
    const id = (data as { id: string }).id;
    try {
      await this.setProctors(id, proctorIds);
    } catch (err) {
      // ไม่ให้เหลือคาบสอบที่ไม่มีคนคุมตามที่เลือกไว้
      await this.db.from('sessions').delete().eq('id', id);
      throw err;
    }
    return id;
  }

  async update(id: string, exam: Omit<NewExam, 'courseId'>): Promise<void> {
    const { error } = await this.db.from('sessions').update(toColumns(exam)).eq('id', id);
    if (error) throw dbError();
  }

  async setProctors(id: string, userIds: string[]): Promise<void> {
    const { error } = await this.db.from('session_proctors').delete().eq('session_id', id);
    if (error) throw dbError();
    if (!userIds.length) return;
    const { error: insertError } = await this.db
      .from('session_proctors')
      .insert(userIds.map((userId) => ({ session_id: id, user_id: userId })));
    if (insertError) throw dbError();
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from('sessions').delete().eq('id', id).eq('kind', 'exam');
    if (error) throw dbError();
  }

  async findUsers(ids: string[]): Promise<{ id: string; role: Role }[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db.from('users').select('id, role').in('id', ids);
    if (error) throw dbError();
    return data as { id: string; role: Role }[];
  }

  async listTeachers(): Promise<Person[]> {
    const { data, error } = await this.db
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'teacher')
      .order('full_name');
    if (error) throw dbError();
    return (data as { id: string; full_name: string | null; email: string }[]).map((u) => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
    }));
  }
}
