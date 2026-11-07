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
import { LeaveOcrClient } from './../src/leave/leave-ocr.client.js';
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
  cancelled: false,
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const role = req.headers['x-role'] as 'student' | 'teacher' | 'admin';
    req.user = {
      id: req.headers['x-user'] ?? `${role}-user`,
      email: `${role}@dpu.ac.th`,
      fullName: role === 'student' ? 'นักศึกษา ทดสอบ' : 'อาจารย์ ทดสอบ',
      role,
      studentId: role === 'student' || role === 'admin' ? '66000001' : null,
      pdpaConsentAt: null,
      identityVerifiedAt: null,
    };
    return true;
  }
}

class MemoryLeaveRepo implements LeaveRepo {
  requests: LeaveRequestView[] = [];
  attendance = new Map<string, string>();

  async listStatuses() {
    return this.requests.map((item) => ({ ...item }));
  }

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
          provide: LeaveOcrClient,
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

  it('แอดมินเห็นเฉพาะสถานะ ไม่มีเหตุผล OCR หมายเหตุ หรือไฟล์แนบ', async () => {
    const server = app.getHttpServer();
    await request(server).post('/leave-requests').set('x-role', 'student')
      .field('sessionId', SESSION.id).field('reason', 'ข้อมูลส่วนตัวที่แอดมินห้ามเห็น')
      .attach('evidence', PNG, { filename: 'private-evidence.png', contentType: 'image/png' }).expect(201);
    const requestId = repo.requests[0].id;
    for (const status of ['pending', 'approved'] as const) {
      if (status === 'approved') {
        await request(server).post(`/leave-requests/${requestId}/review`).set('x-role', 'teacher')
          .send({ decision: 'approved', reviewNote: 'หมายเหตุส่วนตัว' }).expect(200);
      }
      const response = await request(server).get('/leave-requests/statuses').set('x-role', 'admin').expect(200);
      expect(response.body.data).toEqual([{
        id: requestId, status, createdAt: repo.requests[0].createdAt, reviewedAt: repo.requests[0].reviewedAt,
      }]);
      expect(JSON.stringify(response.body)).not.toContain('ข้อมูลส่วนตัว');
      expect(JSON.stringify(response.body)).not.toContain('private-evidence');
      await request(server).get(`/leave-requests/${requestId}/evidence`).set('x-role', 'admin').expect(403);
      await request(server).get('/leave-requests/review').set('x-role', 'admin').expect(403);
    }
    for (const role of ['student', 'teacher']) {
      await request(server).get('/leave-requests/statuses').set('x-role', role).expect(403);
    }
  });

  it('รับหลักฐาน 25 MB ทั้งอ่านร่างและยื่นลา', async () => {
    const evidence = Buffer.alloc(25 * 1024 * 1024);
    PNG.copy(evidence);
    for (const path of ['/leave-requests/preview', '/leave-requests']) {
      await request(app.getHttpServer()).post(path).set('x-role', 'student')
        .field('sessionId', SESSION.id).field('reason', 'ลาป่วย')
        .attach('evidence', evidence, { filename: 'leave.png', contentType: 'image/png' })
        .expect(path.endsWith('preview') ? 200 : 201);
    }
    expect(repo.requests).toHaveLength(1);
  });

  it('ปฏิเสธหลักฐานเกิน 25 MB ทั้งอ่านร่างและยื่นลา', async () => {
    for (const path of ['/leave-requests/preview', '/leave-requests']) {
      await request(app.getHttpServer()).post(path).set('x-role', 'student')
        .field('sessionId', SESSION.id).field('reason', 'ลาป่วย')
        .attach('evidence', Buffer.alloc(25 * 1024 * 1024 + 1), { filename: 'leave.png', contentType: 'image/png' })
        .expect(413);
    }
    expect(repo.requests).toHaveLength(0);
  });

  it('นักศึกษาเลือกคาบ ยื่นหลักฐาน และอาจารย์อนุมัติจน attendance เป็น leave', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/leave-requests/preview')
      .set('x-role', 'student')
      .field('sessionId', SESSION.id)
      .attach('evidence', PNG, {
        filename: 'leave.png',
        contentType: 'image/png',
      })
      .expect(200)
      .expect({ data: { text: 'ใบลาป่วย', reason: 'ใบลาป่วย' } });
    expect(repo.requests).toEqual([]);

    await request(server)
      .post('/leave-requests/preview')
      .set('x-role', 'teacher')
      .field('sessionId', SESSION.id)
      .attach('evidence', PNG, {
        filename: 'leave.png',
        contentType: 'image/png',
      })
      .expect(403);

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

    const pending = await request(server)
      .get('/leave-requests/pending')
      .set('x-role', 'teacher')
      .expect(200);
    expect(pending.body.data).toHaveLength(1);
    expect(pending.body.data[0]).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      status: 'pending',
      reason: 'ไข้สูง',
      student: { studentId: '66000001' },
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

    await request(server)
      .get('/leave-requests/pending')
      .set('x-role', 'teacher')
      .expect(200)
      .expect({ data: [] });
  });

  it('อาจารย์ปฏิเสธคำขอโดยไม่เปลี่ยน attendance', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/leave-requests')
      .set('x-role', 'student')
      .field('sessionId', SESSION.id)
      .field('reason', 'หลักฐานไม่ครบ')
      .attach('evidence', PNG, {
        filename: 'leave.png',
        contentType: 'image/png',
      })
      .expect(201);

    const attendanceKey = `${SESSION.id}:student-user`;
    repo.attendance.set(attendanceKey, 'absent');

    await request(server)
      .post('/leave-requests/22222222-2222-4222-8222-222222222222/review')
      .set('x-role', 'teacher')
      .send({ decision: 'rejected', reviewNote: 'หลักฐานไม่เพียงพอ' })
      .expect(200)
      .expect({
        data: {
          id: '22222222-2222-4222-8222-222222222222',
          status: 'rejected',
        },
      });

    expect(repo.attendance.get(attendanceKey)).toBe('absent');
  });

  it('ปฏิเสธแอดมินที่มีรหัสนักศึกษาจาก API ระบบลา', async () => {
    const server = app.getHttpServer();
    for (const path of ['sessions', 'mine', 'review', 'pending']) {
      await request(server).get(`/leave-requests/${path}`).set('x-role', 'admin').expect(403);
    }
    for (const path of ['/leave-requests', '/leave-requests/preview']) {
      await request(server).post(path).set('x-role', 'admin')
        .field('sessionId', SESSION.id).field('reason', 'ทดสอบ')
        .attach('evidence', PNG, { filename: 'leave.png', contentType: 'image/png' }).expect(403);
    }
    await request(server).post('/leave-requests/22222222-2222-4222-8222-222222222222/review')
      .set('x-role', 'admin').send({ decision: 'approved' }).expect(403);
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
