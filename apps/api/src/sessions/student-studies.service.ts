import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';
import type { AppUser } from '../users/users.service.js';
import { addDays, bangkokDate } from './plan-day.js';

export interface StudentCourse { id: string; code: string; name: string; section: string | null }
interface SessionRow {
  id: string; course_id: string; kind: 'class' | 'exam'; title: string | null;
  on_date: string; starts_at: string; ends_at: string; rooms: { name: string } | null;
}

@Injectable()
export class StudentStudiesService {
  constructor(
    @Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async get(user: AppUser) {
    const from = bangkokDate(this.now());
    const to = addDays(from, 6);
    if (!user.studentId) return { from, to, courses: [], sessions: [] };

    const enrollments: { courses: StudentCourse }[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.db.from('enrollments')
        .select('courses!inner(id, code, name, section)')
        .eq('student_code', user.studentId).order('course_id').range(offset, offset + 499);
      if (error) throw dbError();
      const rows = data as unknown as { courses: StudentCourse }[];
      enrollments.push(...rows);
      if (rows.length < 500) break;
    }
    const courses = enrollments.map((row) => row.courses)
      .sort((a, b) => a.code.localeCompare(b.code) || (a.section ?? '').localeCompare(b.section ?? ''));
    if (!courses.length) return { from, to, courses, sessions: [] };

    const sessions: SessionRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.db.from('sessions')
        .select('id, course_id, kind, title, on_date, starts_at, ends_at, rooms(name)')
        .in('course_id', courses.map((course) => course.id))
        .is('cancelled_at', null)
        .gte('on_date', from).lte('on_date', to)
        .order('starts_at').order('id').range(offset, offset + 499);
      if (error) throw dbError();
      const rows = data as unknown as SessionRow[];
      sessions.push(...rows);
      if (rows.length < 500) break;
    }
    return {
      from, to, courses,
      sessions: sessions.map((row) => ({
        id: row.id, courseId: row.course_id, kind: row.kind, title: row.title,
        onDate: row.on_date, startsAt: row.starts_at, endsAt: row.ends_at,
        roomName: row.rooms?.name ?? null,
      })),
    };
  }
}
