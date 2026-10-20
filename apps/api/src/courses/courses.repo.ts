import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export interface Course {
  id: string;
  code: string;
  name: string;
  section: string | null;
  teacherId: string;
}

export type NewCourse = Omit<Course, 'id'>;

// absentAfterMin = null คือนับขาดตอนหมดคาบ
export interface Rules {
  lateAfterMin: number;
  absentAfterMin: number | null;
  outOfRoomLimitMin: number;
}

export interface CoursesRepo {
  listAll(): Promise<Course[]>;
  listByTeacher(teacherId: string): Promise<Course[]>;
  findById(id: string): Promise<Course | null>;
  insert(course: NewCourse): Promise<Course>;
  update(id: string, patch: Partial<NewCourse>): Promise<Course>;
  getRules(courseId: string): Promise<Rules | null>;
  saveRules(courseId: string, rules: Rules): Promise<Rules>;
}

export const COURSES_REPO = Symbol('COURSES_REPO');

interface CourseRow {
  id: string;
  code: string;
  name: string;
  section: string | null;
  teacher_id: string;
}

interface RulesRow {
  late_after_min: number;
  absent_after_min: number | null;
  out_of_room_limit_min: number;
}

const COURSE_COLUMNS = 'id, code, name, section, teacher_id';

const toCourse = (row: CourseRow): Course => ({
  id: row.id,
  code: row.code,
  name: row.name,
  section: row.section,
  teacherId: row.teacher_id,
});

const toRules = (row: RulesRow): Rules => ({
  lateAfterMin: row.late_after_min,
  absentAfterMin: row.absent_after_min,
  outOfRoomLimitMin: row.out_of_room_limit_min,
});

const courseRow = (c: Partial<NewCourse>) => ({
  ...(c.code !== undefined && { code: c.code }),
  ...(c.name !== undefined && { name: c.name }),
  ...(c.section !== undefined && { section: c.section }),
  ...(c.teacherId !== undefined && { teacher_id: c.teacherId }),
});

@Injectable()
export class SupabaseCoursesRepo implements CoursesRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async listAll(): Promise<Course[]> {
    const { data, error } = await this.db.from('courses').select(COURSE_COLUMNS).order('code');
    if (error) throw dbError();
    return (data as CourseRow[]).map(toCourse);
  }

  async listByTeacher(teacherId: string): Promise<Course[]> {
    const { data, error } = await this.db
      .from('courses')
      .select(COURSE_COLUMNS)
      .eq('teacher_id', teacherId)
      .order('code');
    if (error) throw dbError();
    return (data as CourseRow[]).map(toCourse);
  }

  async findById(id: string): Promise<Course | null> {
    const { data, error } = await this.db
      .from('courses')
      .select(COURSE_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError();
    return data ? toCourse(data as CourseRow) : null;
  }

  async insert(course: NewCourse): Promise<Course> {
    const { data, error } = await this.db
      .from('courses')
      .insert(courseRow(course))
      .select(COURSE_COLUMNS)
      .single();
    if (error || !data) throw dbError();
    return toCourse(data as CourseRow);
  }

  async update(id: string, patch: Partial<NewCourse>): Promise<Course> {
    const { data, error } = await this.db
      .from('courses')
      .update(courseRow(patch))
      .eq('id', id)
      .select(COURSE_COLUMNS)
      .single();
    if (error || !data) throw dbError();
    return toCourse(data as CourseRow);
  }

  async getRules(courseId: string): Promise<Rules | null> {
    const { data, error } = await this.db
      .from('attendance_rules')
      .select('late_after_min, absent_after_min, out_of_room_limit_min')
      .eq('course_id', courseId)
      .maybeSingle();
    if (error) throw dbError();
    return data ? toRules(data as RulesRow) : null;
  }

  async saveRules(courseId: string, rules: Rules): Promise<Rules> {
    const { data, error } = await this.db
      .from('attendance_rules')
      .upsert(
        {
          course_id: courseId,
          late_after_min: rules.lateAfterMin,
          absent_after_min: rules.absentAfterMin,
          out_of_room_limit_min: rules.outOfRoomLimitMin,
        },
        { onConflict: 'course_id' },
      )
      .select('late_after_min, absent_after_min, out_of_room_limit_min')
      .single();
    if (error || !data) throw dbError();
    return toRules(data as RulesRow);
  }
}
