import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseReportsRepo } from './reports.repo.js';

describe('SupabaseReportsRepo', () => {
  it.each(['present', 'late', 'absent', 'leave', 'pending'] as const)(
    'กรองและนับ %s โดยเซ็นเฉพาะภาพของนักศึกษาที่เลือก',
    async (status) => {
      const rows: Record<string, Record<string, unknown>[]> = {
        courses: [
          { id: 'course-1', code: 'CS101', name: 'ทดสอบ', section: null },
        ],
        attendance_rules: [],
        enrollments: [
          { course_id: 'course-1', student_code: '66000001' },
          { course_id: 'course-1', student_code: '66000002' },
        ],
        users: [
          { id: 'user-1', student_id: '66000001' },
          { id: 'user-2', student_id: '66000002' },
        ],
        sessions: [
          {
            id: 'exam',
            course_id: 'course-1',
            on_date: '2026-11-01',
            kind: 'exam',
            starts_at: '2026-11-01T02:00:00Z',
            ends_at: '2026-11-01T05:00:00Z',
            late_after_min: 5,
            absent_after_min: null,
            out_of_room_limit_min: null,
          },
          {
            id: 'class',
            course_id: 'course-1',
            on_date: '2026-11-01',
            kind: 'class',
          },
          {
            id: 'old',
            course_id: 'course-1',
            on_date: '2026-10-31',
            kind: 'exam',
          },
          {
            id: 'future',
            course_id: 'course-1',
            on_date: '2026-11-02',
            kind: 'exam',
          },
          {
            id: 'other',
            course_id: 'course-2',
            on_date: '2026-11-01',
            kind: 'exam',
          },
        ],
        attendance: [
          {
            session_id: 'exam',
            student_id: 'user-1',
            status,
            first_seen_at:
              status === 'leave'
                ? null
                : status === 'late'
                  ? '2026-11-01T02:10:00Z'
                  : status === 'absent'
                    ? '2026-11-01T05:01:00Z'
                    : '2026-11-01T02:01:00Z',
            image_path: 'own.jpg',
            updated_by: null,
          },
          {
            session_id: 'exam',
            student_id: 'user-2',
            status: 'present',
            image_path: 'other.jpg',
          },
        ],
      };
      const signedPaths: string[][] = [];
      const db = {
        from: (table: string) => {
          let data = rows[table];
          const query = {
            select: () => query,
            order: () => query,
            eq: (key: string, value: unknown) => {
              data = data.filter((row) => row[key] === value);
              return query;
            },
            gte: (key: string, value: string) => {
              data = data.filter((row) => String(row[key]) >= value);
              return query;
            },
            lte: (key: string, value: string) => {
              data = data.filter((row) => String(row[key]) <= value);
              return query;
            },
            in: (key: string, values: unknown[]) => {
              data = data.filter((row) => values.includes(row[key]));
              return query;
            },
            maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
            range: async (from: number, to: number) => ({
              data: data.slice(from, to + 1),
              error: null,
            }),
          };
          return query;
        },
        storage: {
          from: () => ({
            createSignedUrls: async (paths: string[]) => {
              signedPaths.push(paths);
              return {
                data: paths.map((path) => ({
                  path,
                  signedUrl: `https://storage.test/${path}`,
                })),
                error: null,
              };
            },
          }),
        },
      };
      const report = await new SupabaseReportsRepo(
        db as unknown as SupabaseClient,
      ).getAttendanceReport(
        'course-1',
        {
          kind: 'exam',
          startDate: '2026-11-01',
          endDate: '2026-11-01',
          studentCode: '66000001',
        },
        new Date('2026-11-01T06:00:00Z'),
        true,
      );
      expect(report?.sessions.map((session) => session.sessionId)).toEqual([
        'exam',
      ]);
      expect(report?.students).toHaveLength(1);
      const expectedCounts = {
        present: 0,
        late: 0,
        absent: 0,
        leave: 0,
        pending: 0,
        total: 1,
        [status]: 1,
      };
      expect(report?.summary.counts).toEqual(expectedCounts);
      expect(report?.students[0]?.counts).toEqual(expectedCounts);
      expect(report?.sessions[0]?.counts).toEqual(expectedCounts);
      const expectedRate = ['present', 'late', 'leave'].includes(status)
        ? 100
        : 0;
      expect(report?.summary.attendanceRate).toBe(expectedRate);
      expect(report?.students[0]?.attendanceRate).toBe(expectedRate);
      expect(report?.students[0]?.sessions[0]).toMatchObject({
        status,
        imageUrl: 'https://storage.test/own.jpg',
      });
      expect(signedPaths).toEqual([['own.jpg']]);
    },
  );
  it('ไม่นับขาดคาบก่อนเข้ารายชื่อและคาบที่กล้องไม่ได้บันทึก ส่วนรอตรวจไม่นับเป็นตัวหาร', async () => {
    const session = (id: string, day: string) => ({
      id,
      course_id: 'course-1',
      on_date: `2026-10-${day}`,
      kind: 'class',
      starts_at: `2026-10-${day}T02:00:00Z`,
      ends_at: `2026-10-${day}T05:00:00Z`,
      late_after_min: null,
      absent_after_min: null,
      out_of_room_limit_min: null,
    });
    const rows: Record<string, Record<string, unknown>[]> = {
      courses: [{ id: 'course-1', code: 'CS101', name: 'ทดสอบ', section: null }],
      attendance_rules: [],
      enrollments: [
        { course_id: 'course-1', student_code: '66000001', added_at: '2026-10-01T00:00:00Z' },
        { course_id: 'course-1', student_code: '66000002', added_at: '2026-10-15T00:00:00Z' },
      ],
      users: [
        { id: 'user-1', student_id: '66000001' },
        { id: 'user-2', student_id: '66000002' },
      ],
      sessions: [session('before', '10'), session('blank', '20'), session('after', '25')],
      attendance: [
        { session_id: 'before', student_id: 'user-1', status: 'present', first_seen_at: null },
        { session_id: 'after', student_id: 'user-1', status: 'present', first_seen_at: null },
        { session_id: 'after', student_id: 'user-2', status: 'pending', first_seen_at: null },
      ],
    };
    const db = {
      from: (table: string) => {
        let data = rows[table];
        const query = {
          // เอาเฉพาะคอลัมน์ที่ขอจริง
          select: (columns: string) => {
            if (table === 'enrollments') {
              const names = columns.split(',').map((c) => c.trim());
              data = data.map((row) => ({
                ...Object.fromEntries(names.map((n) => [n, row[n]])),
                course_id: row.course_id,
              }));
            }
            return query;
          },
          order: () => query,
          eq: (key: string, value: unknown) => {
            data = data.filter((row) => row[key] === value);
            return query;
          },
          in: (key: string, values: unknown[]) => {
            data = data.filter((row) => values.includes(row[key]));
            return query;
          },
          maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
          range: async (from: number, to: number) => ({
            data: data.slice(from, to + 1),
            error: null,
          }),
        };
        return query;
      },
    };

    const report = await new SupabaseReportsRepo(
      db as unknown as SupabaseClient,
    ).getAttendanceReport('course-1', { kind: 'all' }, new Date('2026-10-30T00:00:00Z'));

    const [first, second] = report!.students;
    expect(first.sessions.map((s) => s.status)).toEqual(['present', 'unrecorded', 'present']);
    expect(first.attendanceRate).toBe(100);
    expect(second.sessions.map((s) => s.status)).toEqual(['unrecorded', 'unrecorded', 'pending']);
    expect(second.counts).toMatchObject({ absent: 0, pending: 1, total: 1 });
    expect(second.attendanceRate).toBe(0);
  });

  it('ดึงนักศึกษาทุกหน้าเมื่อรายชื่อเกินขีดจำกัด 1,000 แถว', async () => {
    const enrollments = Array.from({ length: 1001 }, (_, index) => ({
      student_code: String(66000001 + index),
    }));
    const data: Record<string, unknown[]> = {
      sessions: [
        {
          id: 'session-1',
          course_id: 'course-1',
          on_date: '2026-10-20',
          starts_at: '2026-10-20T09:00:00Z',
          ends_at: '2026-10-20T12:00:00Z',
          kind: 'class',
          title: null,
          late_after_min: null,
          absent_after_min: null,
          out_of_room_limit_min: null,
          rooms: { name: 'LAB 1' },
        },
      ],
      enrollments,
      users: enrollments.map((row) => ({
        id: row.student_code,
        student_id: row.student_code,
        full_name: 'นักศึกษา ทดสอบ',
      })),
      attendance: enrollments.map((row) => ({
        session_id: 'session-1',
        student_id: row.student_code,
        status: 'present',
        first_seen_at: '2026-10-20T09:01:00Z',
      })),
    };
    const db = {
      from: (table: string) => {
        if (table === 'courses') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'course-1',
                    code: 'CPE101',
                    name: 'Programming',
                    section: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'attendance_rules') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          in: () => query,
          range: async (from: number, to: number) => ({
            data: data[table as keyof typeof data].slice(from, to + 1),
            error: null,
          }),
        };
        return query;
      },
    };

    const report = await new SupabaseReportsRepo(
      db as unknown as SupabaseClient,
    ).getAttendanceReport(
      'course-1',
      { kind: 'all' },
      new Date('2026-10-28T12:00:00Z'),
    );

    expect(report?.summary.totalStudents).toBe(1001);
    expect(report?.summary.counts.present).toBe(1001);
    expect(report?.students.at(-1)?.studentCode).toBe('66001001');
    expect(report?.students[0]?.sessions[0]).toMatchObject({
      roomName: 'LAB 1',
      firstSeenAt: '2026-10-20T09:01:00Z',
    });
  });

  it('คำนวณสรุปผล แยกคาบเรียนกับคาบสอบ และนับ absent อัตโนมัติเมื่อหมดคาบ', async () => {
    const now = new Date('2026-10-28T12:00:00Z');

    const fakeDb = {
      from: (table: string) => {
        if (table === 'courses') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'course-1',
                    code: 'CPE101',
                    name: 'Programming',
                    section: '1',
                    teacher_id: 'teacher-1',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'sessions') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    range: async (from: number, to: number) => ({
                      data: [
                        {
                          id: 'sess-class',
                          course_id: 'course-1',
                          on_date: '2026-10-20',
                          starts_at: '2026-10-20T09:00:00Z',
                          ends_at: '2026-10-20T12:00:00Z', // หมดคาบแล้ว (< now)
                          kind: 'class',
                          title: null,
                          late_after_min: null,
                          absent_after_min: null,
                          out_of_room_limit_min: null,
                          rooms: { name: 'LAB 1' },
                        },
                        {
                          id: 'sess-exam',
                          course_id: 'course-1',
                          on_date: '2026-10-25',
                          starts_at: '2026-10-25T09:00:00Z',
                          ends_at: '2026-10-25T12:00:00Z', // หมดคาบแล้ว (< now)
                          kind: 'exam',
                          title: 'Midterm',
                          late_after_min: 10,
                          absent_after_min: null,
                          out_of_room_limit_min: null,
                          rooms: { name: 'HALL' },
                        },
                        {
                          id: 'sess-future',
                          course_id: 'course-1',
                          on_date: '2026-10-30',
                          starts_at: '2026-10-30T09:00:00Z',
                          ends_at: '2026-10-30T12:00:00Z', // ยังไม่ถึงคาบ (> now)
                          kind: 'class',
                          title: null,
                          late_after_min: null,
                          absent_after_min: null,
                          out_of_room_limit_min: null,
                          rooms: { name: 'LAB 1' },
                        },
                      ].slice(from, to + 1),
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'enrollments') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  range: async (from: number, to: number) => ({
                    data: [
                      { student_code: '66000001' },
                      { student_code: '66000002' },
                    ].slice(from, to + 1),
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'attendance_rules') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }

        if (table === 'users') {
          return {
            select: () => ({
              in: () => ({
                order: () => ({
                  range: async (from: number, to: number) => ({
                    data: [
                      {
                        id: 'user-1',
                        student_id: '66000001',
                        full_name: 'Student One',
                      },
                      {
                        id: 'user-2',
                        student_id: '66000002',
                        full_name: 'Student Two',
                      },
                    ].slice(from, to + 1),
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'attendance') {
          return {
            select: () => ({
              in: () => ({
                order: () => ({
                  order: () => ({
                    range: async (from: number, to: number) => ({
                      data: [
                        // คาบเรียน sess-class: user-1 มาเรียน, user-2 ลาป่วย
                        {
                          session_id: 'sess-class',
                          student_id: 'user-1',
                          status: 'present',
                          first_seen_at: '2026-10-20T09:05:00Z',
                        },
                        {
                          session_id: 'sess-class',
                          student_id: 'user-2',
                          status: 'leave',
                          first_seen_at: null,
                        },
                        // คาบสอบ sess-exam: user-1 สาย, user-2 ไม่มีแถว (หมดคาบแล้ว = ขาดสอบ absent)
                        {
                          session_id: 'sess-exam',
                          student_id: 'user-1',
                          status: 'late',
                          first_seen_at: '2026-10-25T09:20:00Z',
                        },
                      ].slice(from, to + 1),
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const repo = new SupabaseReportsRepo(fakeDb as unknown as SupabaseClient);
    const report = await repo.getAttendanceReport(
      'course-1',
      { kind: 'all' },
      now,
    );

    expect(report).not.toBeNull();
    expect(report!.course.code).toBe('CPE101');
    expect(report!.summary.totalSessions).toBe(3);
    expect(report!.summary.totalStudents).toBe(2);

    // ตรวจสอบ Student 1:
    // sess-class = present
    // sess-exam = late
    // sess-future = unrecorded (ยังไม่หมดคาบ)
    // counts: present: 1, late: 1, absent: 0, leave: 0, pending: 0, total: 2
    const s1 = report!.students.find((s) => s.studentCode === '66000001')!;
    expect(s1.counts.present).toBe(1);
    expect(s1.counts.late).toBe(1);
    expect(s1.counts.absent).toBe(0);
    expect(s1.counts.total).toBe(2);
    expect(s1.attendanceRate).toBe(100.0);

    // ตรวจสอบ Student 2:
    // sess-class = leave
    // sess-exam = absent (เพราะหมดคาบแล้วและไม่มีแถว)
    // sess-future = unrecorded
    // counts: present: 0, late: 0, absent: 1, leave: 1, pending: 0, total: 2
    const s2 = report!.students.find((s) => s.studentCode === '66000002')!;
    expect(s2.counts.leave).toBe(1);
    expect(s2.counts.absent).toBe(1);
    expect(s2.counts.total).toBe(2);
    expect(s2.attendanceRate).toBe(50.0); // (leave / total) * 100

    // ตรวจสอบ sessions
    const classSession = report!.sessions.find(
      (s) => s.sessionId === 'sess-class',
    )!;
    expect(classSession.kind).toBe('class');
    expect(classSession.counts.present).toBe(1);
    expect(classSession.counts.leave).toBe(1);

    const examSession = report!.sessions.find(
      (s) => s.sessionId === 'sess-exam',
    )!;
    expect(examSession.kind).toBe('exam');
    expect(examSession.counts.late).toBe(1);
    expect(examSession.counts.absent).toBe(1);
  });
});
