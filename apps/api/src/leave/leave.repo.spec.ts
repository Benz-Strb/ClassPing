import { describe, expect, it } from 'vitest';
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

describe('รายการคาบที่ยื่นลาได้', () => {
  it('คืนชื่อวิชา เวลา และห้อง แทนการให้หน้า UI ใช้ UUID อย่างเดียว', async () => {
    const rows = [
      {
        id: 'session-1',
        course_id: 'course-1',
        kind: 'class',
        title: null,
        on_date: '2026-10-28',
        starts_at: '2026-10-28T02:00:00.000Z',
        ends_at: '2026-10-28T05:00:00.000Z',
        courses: {
          id: 'course-1',
          code: 'CS101',
          name: 'พื้นฐานการเขียนโปรแกรม',
          section: '1',
        },
        rooms: { name: 'LAB 1' },
      },
    ];
    const tableData: Record<string, unknown> = {
      users: { student_id: '66000001' },
      enrollments: [{ course_id: 'course-1' }],
      sessions: rows,
    };
    const db = {
      from: (table: string) => {
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: tableData.users,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'enrollments') {
          return {
            select: () => ({
              eq: async () => ({ data: tableData.enrollments, error: null }),
            }),
          };
        }
        return {
          select: () => ({
            in: () => ({
              order: () => ({
                limit: async () => ({ data: tableData.sessions, error: null }),
              }),
            }),
          }),
        };
      },
    };

    const repo = new SupabaseLeaveRepo(db as unknown as SupabaseClient);
    await expect(repo.listEligibleSessions('student-user')).resolves.toEqual([
      {
        id: 'session-1',
        courseId: 'course-1',
        courseCode: 'CS101',
        courseName: 'พื้นฐานการเขียนโปรแกรม',
        section: '1',
        kind: 'class',
        title: null,
        onDate: '2026-10-28',
        startsAt: '2026-10-28T02:00:00.000Z',
        endsAt: '2026-10-28T05:00:00.000Z',
        roomName: 'LAB 1',
      },
    ]);
  });
});

it('แยก unique violation เป็นคำขอลาซ้ำ', async () => {
  const db = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { code: '23505' } }),
        }),
      }),
    }),
  };
  const repo = new SupabaseLeaveRepo(db as unknown as SupabaseClient);

  await expect(
    repo.createRequest({
      studentId: 'student-user',
      sessionId: 'session-1',
      reason: 'ป่วย',
      ocrText: '',
      ocrStatus: 'completed',
    }),
  ).rejects.toThrow('LEAVE_REQUEST_DUPLICATE');
});

it('รายการคำขอลามีรายละเอียดคาบและนักศึกษาให้ UI แสดงผล', async () => {
  const row = {
    id: 'leave-1',
    student_id: 'student-user',
    session_id: 'session-1',
    reason: 'ป่วย',
    status: 'pending',
    ocr_text: 'ใบลาป่วย',
    ocr_status: 'completed',
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    created_at: '2026-10-28T01:00:00.000Z',
    leave_attachments: [],
    sessions: {
      id: 'session-1',
      course_id: 'course-1',
      kind: 'class',
      title: null,
      on_date: '2026-10-28',
      starts_at: '2026-10-28T02:00:00.000Z',
      ends_at: '2026-10-28T05:00:00.000Z',
      courses: {
        id: 'course-1',
        code: 'CS101',
        name: 'พื้นฐานการเขียนโปรแกรม',
        section: '1',
      },
      rooms: { name: 'LAB 1' },
    },
    users: {
      id: 'student-user',
      student_id: '66000001',
      full_name: 'นักศึกษา ทดสอบ',
    },
  };
  const db = {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        order: async () => ({ data: [row], error: null }),
      };
      return q;
    },
  };
  const repo = new SupabaseLeaveRepo(db as unknown as SupabaseClient);

  const [request] = await repo.listByStudent('student-user');
  expect(request.session).toMatchObject({
    id: 'session-1',
    courseCode: 'CS101',
    courseName: 'พื้นฐานการเขียนโปรแกรม',
    roomName: 'LAB 1',
  });
  expect(request.student).toEqual({
    id: 'student-user',
    studentId: '66000001',
    fullName: 'นักศึกษา ทดสอบ',
  });
});

it('ตรวจคำขอและเขียน attendance ผ่าน transaction เดียวใน database', async () => {
  const calls: unknown[][] = [];
  const db = {
    rpc: async (name: string, params: Record<string, unknown>) => {
      calls.push([name, params]);
      return { error: null };
    },
  };
  const repo = new SupabaseLeaveRepo(db as unknown as SupabaseClient);

  await repo.reviewRequest('leave-1', 'teacher-1', 'approved', 'หลักฐานครบ');

  expect(calls).toEqual([
    [
      'review_leave_request',
      {
        p_request_id: 'leave-1',
        p_teacher_id: 'teacher-1',
        p_decision: 'approved',
        p_review_note: 'หลักฐานครบ',
      },
    ],
  ]);
});

it.each([
  'LEAVE_REQUEST_NOT_FOUND',
  'LEAVE_REQUEST_FORBIDDEN',
  'LEAVE_REQUEST_NOT_PENDING',
])('ส่งต่อรหัสข้อผิดพลาดจาก transaction: %s', async (message) => {
  const db = { rpc: async () => ({ error: { message } }) };
  const repo = new SupabaseLeaveRepo(db as unknown as SupabaseClient);

  await expect(
    repo.reviewRequest('leave-1', 'teacher-1', 'approved', null),
  ).rejects.toThrow(message);
});
