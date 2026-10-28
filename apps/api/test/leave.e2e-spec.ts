import type {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RolesGuard } from './../src/auth/roles.guard.js';
import { EnvelopeInterceptor } from './../src/common/envelope.interceptor.js';
import { HttpExceptionFilter } from './../src/common/http-exception.filter.js';
import { FaceClient } from './../src/face/face.client.js';
import { LeaveController } from './../src/leave/leave.controller.js';
import {
  LEAVE_REPO,
  type LeaveRepo,
  type LeaveRequestInput,
  type LeaveRequestView,
  type LeaveSessionOption,
} from './../src/leave/leave.repo.js';
import { LeaveService } from './../src/leave/leave.service.js';

const SESSION: LeaveSessionOption = {
  id: '11111111-1111-4111-8111-111111111111',
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
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const role = req.headers['x-role'] as 'student' | 'teacher';
    req.user = {
      id: req.headers['x-user'] ?? `${role}-user`,
      email: `${role}@dpu.ac.th`,
      fullName: role === 'student' ? 'นักศึกษา ทดสอบ' : 'อาจารย์ ทดสอบ',
      role,
      studentId: role === 'student' ? '66000001' : null,
      pdpaConsentAt: null,
      identityVerifiedAt: null,
    };
    return true;
  }
}

class MemoryLeaveRepo implements LeaveRepo {
  requests: LeaveRequestView[] = [];
  attendance = new Map<string, string>();

  async listEligibleSessions() {
    return [SESSION];
  }

  async studentCanRequest(_studentId: string, sessionId: string) {
    return sessionId === SESSION.id;
  }

  async createRequest(input: LeaveRequestInput) {
    if (this.requests.some((item) => item.sessionId === input.sessionId)) {
      throw new Error('LEAVE_REQUEST_DUPLICATE');
    }
    const id = '22222222-2222-4222-8222-222222222222';
    this.requests.push({
      id,
      sessionId: input.sessionId,
      session: SESSION,
      student: {
        id: input.studentId,
        studentId: '66000001',
        fullName: 'นักศึกษา ทดสอบ',
      },
      reason: input.reason,
      status: 'pending',
      ocrText: input.ocrText,
      ocrStatus: input.ocrStatus,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: '2026-10-28T01:00:00.000Z',
      attachments: [],
    });
    return { id };
  }

  async deleteRequest(id: string) {
    this.requests = this.requests.filter((item) => item.id !== id);
  }

  async uploadEvidence() {}
  async deleteEvidence() {}

  async createAttachment(input: {
    requestId: string;
    path: string;
    fileName: string;
    mime: string;
    size: number;
  }) {
    const item = this.requests.find(
      (requestItem) => requestItem.id === input.requestId,
    );
    if (item)
      item.attachments.push({
        fileName: input.fileName,
        mime: input.mime,
        size: input.size,
      });
  }

  async reviewRequest(
    requestId: string,
    teacherId: string,
    decision: 'approved' | 'rejected',
    reviewNote: string | null,
  ) {
    const item = this.requests.find(
      (requestItem) => requestItem.id === requestId,
    );
    if (!item) throw new Error('LEAVE_REQUEST_NOT_FOUND');
    if (teacherId !== 'teacher-user')
      throw new Error('LEAVE_REQUEST_FORBIDDEN');
    if (item.status !== 'pending') throw new Error('LEAVE_REQUEST_NOT_PENDING');
    item.status = decision;
    item.reviewedBy = teacherId;
    item.reviewedAt = '2026-10-28T03:00:00.000Z';
    item.reviewNote = reviewNote;
    if (decision === 'approved')
      this.attendance.set(`${item.sessionId}:${item.student.id}`, 'leave');
  }

  async listByStudent(studentId: string) {
    return this.requests.filter((item) => item.student.id === studentId);
  }

  async listForTeacher() {
    return this.requests;
  }

  async signedEvidenceUrl(
    requestId: string,
    userId: string,
    role: 'student' | 'teacher',
  ) {
    const item = this.requests.find(
      (requestItem) => requestItem.id === requestId,
    );
    if (!item) throw new Error('LEAVE_REQUEST_NOT_FOUND');
    if (role === 'student' && item.student.id !== userId)
      throw new Error('LEAVE_REQUEST_FORBIDDEN');
    if (role === 'teacher' && userId !== 'teacher-user')
      throw new Error('LEAVE_REQUEST_FORBIDDEN');
    if (!item.attachments.length) throw new Error('EVIDENCE_NOT_FOUND');
    return 'https://example.test/signed-evidence';
  }
}

describe('ระบบลา (e2e)', () => {
  let app: INestApplication<App>;
  let repo: MemoryLeaveRepo;

  beforeEach(async () => {
    repo = new MemoryLeaveRepo();
    const moduleRef = await Test.createTestingModule({
      controllers: [LeaveController],
      providers: [
        LeaveService,
        { provide: LEAVE_REPO, useValue: repo },
        {
          provide: FaceClient,
          useValue: {
            readLeaveDocument: async () => ({
              lines: [{ text: 'ใบลาป่วย', score: null }],
            }),
          },
        },
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

  it('นักศึกษาเลือกคาบ ยื่นหลักฐาน และอาจารย์อนุมัติจน attendance เป็น leave', async () => {
    const server = app.getHttpServer();
    await request(server)
      .get('/leave-requests/sessions')
      .set('x-role', 'student')
      .expect(200)
      .expect({ data: [SESSION] });

    const submitted = await request(server)
      .post('/leave-requests')
      .set('x-role', 'student')
      .field('sessionId', SESSION.id)
      .field('reason', 'ไข้สูง')
      .attach('evidence', PNG, {
        filename: 'leave.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(submitted.body.data).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      status: 'pending',
      ocrStatus: 'completed',
    });

    const mine = await request(server)
      .get('/leave-requests/mine')
      .set('x-role', 'student')
      .expect(200);
    expect(mine.body.data[0]).toMatchObject({
      reason: 'ไข้สูง',
      ocrText: 'ใบลาป่วย',
      session: { courseCode: 'CS101', roomName: 'LAB 1' },
      attachments: [{ fileName: 'leave.png', mime: 'image/png' }],
    });

    await request(server)
      .get('/leave-requests/22222222-2222-4222-8222-222222222222/evidence')
      .set('x-role', 'student')
      .expect(200)
      .expect({ data: { url: 'https://example.test/signed-evidence' } });

    await request(server)
      .post('/leave-requests/22222222-2222-4222-8222-222222222222/review')
      .set('x-role', 'teacher')
      .send({ decision: 'approved', reviewNote: 'หลักฐานครบ' })
      .expect(200)
      .expect({
        data: {
          id: '22222222-2222-4222-8222-222222222222',
          status: 'approved',
        },
      });
    expect(repo.attendance.get(`${SESSION.id}:student-user`)).toBe('leave');
  });

  it('ป้องกัน role ผิด, session ที่ไม่ได้ลงทะเบียน และ decision ที่ไม่รองรับ', async () => {
    const server = app.getHttpServer();
    await request(server)
      .get('/leave-requests/sessions')
      .set('x-role', 'teacher')
      .expect(403);
    await request(server)
      .post('/leave-requests')
      .set('x-role', 'student')
      .field('sessionId', '99999999-9999-4999-8999-999999999999')
      .field('reason', 'ป่วย')
      .attach('evidence', PNG, {
        filename: 'leave.png',
        contentType: 'image/png',
      })
      .expect(404);
    await request(server)
      .post('/leave-requests/not-found/review')
      .set('x-role', 'teacher')
      .send({ decision: 'waiting' })
      .expect(400)
      .expect({
        error: {
          code: 'BAD_REQUEST',
          message: 'decision ต้องเป็น approved หรือ rejected',
        },
      });
  });

  it('ป้องกันคำขอซ้ำ อาจารย์คนอื่น และการตรวจซ้ำ', async () => {
    const server = app.getHttpServer();
    const submit = () =>
      request(server)
        .post('/leave-requests')
        .set('x-role', 'student')
        .field('sessionId', SESSION.id)
        .field('reason', 'ป่วย')
        .attach('evidence', PNG, {
          filename: 'leave.png',
          contentType: 'image/png',
        });
    await submit().expect(201);
    await submit().expect(409);

    const reviewPath =
      '/leave-requests/22222222-2222-4222-8222-222222222222/review';
    await request(server)
      .post(reviewPath)
      .set('x-role', 'teacher')
      .set('x-user', 'other-teacher')
      .send({ decision: 'approved' })
      .expect(403);
    await request(server)
      .post(reviewPath)
      .set('x-role', 'teacher')
      .send({ decision: 'rejected' })
      .expect(200);
    await request(server)
      .post(reviewPath)
      .set('x-role', 'teacher')
      .send({ decision: 'approved' })
      .expect(409);
  });
});
