import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';
import type { AttendanceStatus } from '../attendance/decide.js';
import type {
  AttendanceCounts,
  AttendanceFilterDto,
  AttendanceReportResponse,
  CourseInfo,
  SessionSummaryReport,
  StudentAttendanceReport,
  StudentSessionStatus,
} from './reports.types.js';

export interface ReportsRepo {
  getAttendanceReport(
    courseId: string,
    filter: AttendanceFilterDto,
    now: Date,
  ): Promise<AttendanceReportResponse | null>;
}

export const REPORTS_REPO = Symbol('REPORTS_REPO');

interface RawCourse {
  id: string;
  code: string;
  name: string;
  section: string | null;
  teacher_id: string;
}

interface RawSession {
  id: string;
  course_id: string;
  on_date: string;
  starts_at: string;
  ends_at: string;
  kind: 'class' | 'exam';
  title: string | null;
  rooms: { name: string } | null;
}

interface RawEnrollment {
  student_code: string;
}

interface RawUser {
  id: string;
  student_id: string | null;
  full_name: string | null;
}

interface RawAttendance {
  session_id: string;
  student_id: string; // user id
  status: AttendanceStatus;
  first_seen_at: string | null;
}

async function allRows<T>(query: {
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
}): Promise<T[]> {
  const rows: T[] = [];
  while (true) {
    const { data, error } = await query.range(rows.length, rows.length + 999);
    if (error) throw dbError();
    if (!data?.length) return rows;
    rows.push(...(data as T[]));
  }
}

@Injectable()
export class SupabaseReportsRepo implements ReportsRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async getAttendanceReport(
    courseId: string,
    filter: AttendanceFilterDto,
    now: Date,
  ): Promise<AttendanceReportResponse | null> {
    // 1. ดึงข้อมูลคอร์ส
    const { data: courseData, error: courseError } = await this.db
      .from('courses')
      .select('id, code, name, section, teacher_id')
      .eq('id', courseId)
      .maybeSingle();

    if (courseError) throw dbError();
    if (!courseData) return null;
    const course = courseData as unknown as RawCourse;

    // 2. ดึง sessions ตาม filter
    let sessionQuery = this.db
      .from('sessions')
      .select('id, course_id, on_date, starts_at, ends_at, kind, title, rooms(name)')
      .eq('course_id', courseId)
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true });

    if (filter.sessionId) {
      sessionQuery = sessionQuery.eq('id', filter.sessionId);
    }
    if (filter.kind && filter.kind !== 'all') {
      sessionQuery = sessionQuery.eq('kind', filter.kind);
    }
    if (filter.startDate) {
      sessionQuery = sessionQuery.gte('on_date', filter.startDate);
    }
    if (filter.endDate) {
      sessionQuery = sessionQuery.lte('on_date', filter.endDate);
    }

    const sessions = await allRows<RawSession>(sessionQuery);

    // 3. ดึง enrollments (รายชื่อนักศึกษา)
    let enrollmentQuery = this.db
      .from('enrollments')
      .select('student_code')
      .eq('course_id', courseId)
      .order('student_code', { ascending: true });

    if (filter.studentCode) {
      enrollmentQuery = enrollmentQuery.eq('student_code', filter.studentCode);
    }

    const enrollments = await allRows<RawEnrollment>(enrollmentQuery);
    const studentCodes = enrollments.map((e) => e.student_code);

    // 4. ดึง users เพื่อ map student_id -> user account
    const usersByCode = new Map<string, RawUser>();
    if (studentCodes.length > 0) {
      for (let start = 0; start < studentCodes.length; start += 200) {
        const users = await allRows<RawUser>(
          this.db
            .from('users')
            .select('id, student_id, full_name')
            .in('student_id', studentCodes.slice(start, start + 200))
            .order('id', { ascending: true }),
        );
        for (const user of users) {
          if (user.student_id) usersByCode.set(user.student_id, user);
        }
      }
    }

    // 5. ดึง attendance ของ sessions เหล่านี้
    const sessionIds = sessions.map((s) => s.id);
    const attendanceMap = new Map<string, RawAttendance>(); // key: `${sessionId}:${userId}`
    if (sessionIds.length > 0) {
      for (let start = 0; start < sessionIds.length; start += 200) {
        const attendances = await allRows<RawAttendance>(
          this.db
            .from('attendance')
            .select('session_id, student_id, status, first_seen_at')
            .in('session_id', sessionIds.slice(start, start + 200))
            .order('session_id', { ascending: true })
            .order('student_id', { ascending: true }),
        );
        for (const attendance of attendances) {
          attendanceMap.set(`${attendance.session_id}:${attendance.student_id}`, attendance);
        }
      }
    }

    // 6. ประมวลผลและสร้างรายงาน
    const sessionReports: SessionSummaryReport[] = [];
    const sessionCountsMap = new Map<string, AttendanceCounts>();
    for (const s of sessions) {
      sessionCountsMap.set(s.id, {
        present: 0,
        late: 0,
        absent: 0,
        leave: 0,
        pending: 0,
        total: 0,
      });
    }

    const overallCounts: AttendanceCounts = {
      present: 0,
      late: 0,
      absent: 0,
      leave: 0,
      pending: 0,
      total: 0,
    };

    const studentReports: StudentAttendanceReport[] = [];

    for (const code of studentCodes) {
      const user = usersByCode.get(code);
      const studentCounts: AttendanceCounts = {
        present: 0,
        late: 0,
        absent: 0,
        leave: 0,
        pending: 0,
        total: 0,
      };

      const studentSessions: StudentSessionStatus[] = [];

      for (const s of sessions) {
        const sessionEndsAt = new Date(s.ends_at);
        const isSessionEnded = sessionEndsAt <= now;
        let finalStatus: AttendanceStatus | 'unrecorded' = 'unrecorded';

        if (user) {
          const key = `${s.id}:${user.id}`;
          const att = attendanceMap.get(key);
          if (att) {
            finalStatus = att.status;
          } else if (isSessionEnded) {
            // หมดคาบแล้ว แต่ไม่มีบันทึกเช็คชื่อหรือการลา = ขาดเรียน
            finalStatus = 'absent';
          }
        } else if (isSessionEnded) {
          // นักศึกษายังไม่เคย login แต่หมดคาบแล้ว = ขาดเรียน
          finalStatus = 'absent';
        }

        if (finalStatus !== 'unrecorded') {
          studentCounts[finalStatus]++;
          studentCounts.total++;

          const sCounts = sessionCountsMap.get(s.id);
          if (sCounts) {
            sCounts[finalStatus]++;
            sCounts.total++;
          }

          overallCounts[finalStatus]++;
          overallCounts.total++;
        }

        studentSessions.push({
          sessionId: s.id,
          onDate: s.on_date,
          startsAt: s.starts_at,
          endsAt: s.ends_at,
          kind: s.kind,
          title: s.title,
          status: finalStatus,
        });
      }

      const eligibleTotal = studentCounts.total;
      const positiveCount = studentCounts.present + studentCounts.late + studentCounts.leave;
      const rate = eligibleTotal > 0 ? Math.round((positiveCount / eligibleTotal) * 1000) / 10 : 0;

      studentReports.push({
        studentCode: code,
        fullName: user?.full_name ?? null,
        userId: user?.id ?? null,
        counts: studentCounts,
        totalSessions: sessions.length,
        attendanceRate: rate,
        sessions: studentSessions,
      });
    }

    for (const s of sessions) {
      const counts = sessionCountsMap.get(s.id) ?? {
        present: 0,
        late: 0,
        absent: 0,
        leave: 0,
        pending: 0,
        total: 0,
      };
      sessionReports.push({
        sessionId: s.id,
        onDate: s.on_date,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        kind: s.kind,
        title: s.title,
        roomName: s.rooms?.name ?? '-',
        counts,
      });
    }

    const overallTotal = overallCounts.total;
    const overallPositive = overallCounts.present + overallCounts.late + overallCounts.leave;
    const overallRate = overallTotal > 0 ? Math.round((overallPositive / overallTotal) * 1000) / 10 : 0;

    const courseInfo: CourseInfo = {
      id: course.id,
      code: course.code,
      name: course.name,
      section: course.section,
    };

    return {
      course: courseInfo,
      filter,
      summary: {
        totalSessions: sessions.length,
        totalStudents: studentCodes.length,
        counts: overallCounts,
        attendanceRate: overallRate,
      },
      sessions: sessionReports,
      students: studentReports,
    };
  }
}
