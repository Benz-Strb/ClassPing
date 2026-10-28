import { it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseLeaveRepo } from './leave.repo.js';

it('ตรวจ enrollment ด้วยรหัสนักศึกษา แทน user UUID', async () => {
  const tables: Record<string, unknown> = {
    sessions: { course_id: 'course-1' },
    users: { student_id: '66000001' },
    enrollments: { student_code: '66000001' },
  };
  const calls: unknown[][] = [];
  const db = {
    from: (table: string) => {
      const q = {
        select: (column: string) => {
          calls.push([table, 'select', column]);
          return q;
        },
        eq: (column: string, value: string) => {
          calls.push([table, column, value]);
          return q;
        },
        maybeSingle: async () => ({ data: tables[table], error: null }),
      };
      return q;
    },
  };
  const repo = new SupabaseLeaveRepo(db as unknown as SupabaseClient);
  expect(await repo.studentCanRequest('user-uuid', 'session-1')).toBe(true);
  expect(calls).toContainEqual(['enrollments', 'student_code', '66000001']);
  expect(calls).not.toContainEqual(['enrollments', 'student_id', 'user-uuid']);
});
