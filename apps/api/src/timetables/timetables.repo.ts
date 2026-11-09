import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';
import { dbError } from '../common/db-error.js';
import { normalizeCode } from './timetable-draft.js';

export interface MatchCourse {
  id: string;
  code: string;
  name: string;
  section: string | null;
  teacherName: string;
  schedules: {
    weekday: number;
    startTime: string;
    endTime: string;
    roomName: string;
  }[];
}
interface CandidateRow {
  id: string;
  code: string;
  name: string;
  section: string | null;
  users: { full_name: string | null } | null;
  schedules: {
    weekday: number;
    start_time: string;
    end_time: string;
    rooms: { name: string } | null;
  }[];
}
@Injectable()
export class TimetablesRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async candidates(codes: string[]): Promise<MatchCourse[]> {
    const wanted = new Set(codes.map(normalizeCode));
    const matches: MatchCourse[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.db
        .from('courses')
        .select(
          'id, code, name, section, users!teacher_id(full_name), schedules(weekday, start_time, end_time, rooms(name))',
        )
        .order('id')
        .range(offset, offset + 499);
      if (error) throw dbError();
      const rows = data as unknown as CandidateRow[];
      for (const row of rows) {
        if (!wanted.has(normalizeCode(row.code))) continue;
        matches.push({
          id: row.id,
          code: row.code,
          name: row.name,
          section: row.section,
          teacherName: row.users?.full_name ?? '',
          schedules: row.schedules.map((s) => ({
            weekday: s.weekday,
            startTime: s.start_time.slice(0, 5),
            endTime: s.end_time.slice(0, 5),
            roomName: s.rooms?.name ?? '',
          })),
        });
      }
      if (rows.length < 500) return matches;
    }
  }
}
