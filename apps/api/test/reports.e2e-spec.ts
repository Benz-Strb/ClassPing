import type {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { CLOCK } from '../src/common/clock.js';
import { EnvelopeInterceptor } from '../src/common/envelope.interceptor.js';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { CoursesService } from '../src/courses/courses.service.js';
import { COURSES_REPO } from '../src/courses/courses.repo.js';
import {
  ReportsController,
  StudentReportsController,
} from '../src/reports/reports.controller.js';
import { REPORTS_REPO } from '../src/reports/reports.repo.js';
import { ReportsService } from '../src/reports/reports.service.js';

const courseId = '11111111-1111-4111-8111-111111111111';
const counts = {
  present: 1,
  late: 0,
  absent: 0,
  leave: 0,
  pending: 1,
  total: 2,
};
const student = {
  studentCode: '66000001',
  fullName: 'นักศึกษา ทดสอบ',
  userId: 'student-1',
  counts,
  totalSessions: 2,
  attendanceRate: 50,
  sessions: [
    {
      sessionId: 'session-1',
      onDate: '2026-11-01',
      kind: 'exam',
      title: 'สอบกลางภาค',
      startsAt: '2026-11-01T02:00:00Z',
      endsAt: '2026-11-01T05:00:00Z',
      status: 'pending',
      firstSeenAt: '2026-11-01T02:05:00Z',
      roomName: 'LAB 1',
    },
  ],
};

class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.user = {
      id: req.headers['x-user'] ?? 'student-1',
      role: req.headers['x-role'] ?? 'student',
      studentId: '66000001',
    };
    return true;
  }
}

describe('Student reports (e2e)', () => {
  let app: INestApplication;
  const getAttendanceReport = vi.fn();

  beforeEach(async () => {
    getAttendanceReport.mockReset().mockResolvedValue({
      course: { id: courseId, code: 'CS101', name: 'วิชาทดสอบ', section: '1' },
      filter: { kind: 'all' },
      summary: {
        totalSessions: 1,
        totalStudents: 2,
        counts,
        attendanceRate: 50,
      },
      sessions: [{ ...student.sessions[0], counts }],
      students: [
        student,
        { ...student, studentCode: 'other', fullName: 'ข้อมูลคนอื่น' },
      ],
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [StudentReportsController, ReportsController],
      providers: [
        ReportsService,
        CoursesService,
        {
          provide: COURSES_REPO,
          useValue: {
            findById: async (id: string) =>
              id === courseId ? { id, teacherId: 'owner' } : null,
          },
        },
        { provide: REPORTS_REPO, useValue: { getAttendanceReport } },
        { provide: CLOCK, useValue: () => new Date('2026-11-01T06:00:00Z') },
        { provide: APP_GUARD, useClass: FakeAuth },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new EnvelopeInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('คืนคาบของตนเองและส่งตัวกรองโดยไม่ยอมให้เปลี่ยนรหัสนักศึกษา', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/me/reports/attendance/${courseId}?kind=exam&startDate=2026-11-01&endDate=2026-11-30&studentCode=other`,
      )
      .expect(200);
    expect(response.body.data.student).toEqual(student);
    expect(JSON.stringify(response.body)).not.toContain('ข้อมูลคนอื่น');
    expect(getAttendanceReport.mock.calls[0]?.[1]).toEqual({
      kind: 'exam',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      studentCode: '66000001',
    });
  });

  it.each(['teacher', 'admin'])(
    'ปฏิเสธบทบาท %s ที่เส้นทางนักศึกษา',
    async (role) => {
      await request(app.getHttpServer())
        .get(`/me/reports/attendance/${courseId}`)
        .set('x-role', role)
        .expect(403);
      expect(getAttendanceReport).not.toHaveBeenCalled();
    },
  );

  it.each([
    `${courseId}?startDate=2026-11-30&endDate=2026-11-01`,
    `${courseId}?startDate=2026-02-30`,
    `${courseId}?kind=invalid`,
    'invalid-id',
  ])('ปฏิเสธตัวกรองหรือรหัสที่ไม่ถูกต้อง: %s', async (path) => {
    await request(app.getHttpServer())
      .get(`/me/reports/attendance/${path}`)
      .expect(400);
    expect(getAttendanceReport).not.toHaveBeenCalled();
  });

  it('ไม่เปิดเผยวิชาที่นักศึกษาไม่ได้ลงทะเบียน', async () => {
    getAttendanceReport.mockResolvedValue({
      course: { id: courseId },
      students: [],
    });
    await request(app.getHttpServer())
      .get(`/me/reports/attendance/${courseId}`)
      .expect(404);
  });

  describe.each(['attendance', 'attendance/csv', 'attendance/pdf'])(
    'สิทธิ์ %s',
    (path) => {
      it.each([
        ['teacher', 'owner', 200],
        ['teacher', 'other', 404],
        ['admin', 'admin-1', 200],
        ['student', 'student-1', 403],
      ] as const)('%s (%s) ตอบ %s', async (role, id, status) => {
        const response = await request(app.getHttpServer())
          .get(`/courses/${courseId}/reports/${path}`)
          .set('x-role', role)
          .set('x-user', id)
          .expect(status);
        if (status !== 200) expect(getAttendanceReport).not.toHaveBeenCalled();
        else if (path.endsWith('/csv')) {
          expect(response.headers['content-type']).toContain('text/csv');
          expect(response.headers['content-disposition']).toContain('.csv');
          expect(response.text).toContain('รอตรวจ');
        } else if (path.endsWith('/pdf')) {
          expect(response.headers['content-type']).toContain('application/pdf');
          expect(response.headers['content-disposition']).toContain('.pdf');
        } else expect(response.body.data.course.id).toBe(courseId);
      });
    },
  );
});
