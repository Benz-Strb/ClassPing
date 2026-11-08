import type {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { EnvelopeInterceptor } from '../src/common/envelope.interceptor.js';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { TransfersController } from '../src/transfers/transfers.controller.js';
import { TRANSFERS_REPO } from '../src/transfers/transfers.repo.js';
import { TransfersService } from '../src/transfers/transfers.service.js';
import type {
  CurriculumDocument,
  MappingInput,
  NewTransferRequest,
  ReviewDecision,
  TransferMapping,
  TransferRequest,
} from '../src/transfers/transfers.types.js';

const C = '11111111-1111-4111-8111-111111111111';
const D = '22222222-2222-4222-8222-222222222222';
const PDF = Buffer.from('%PDF-1.7\n%%EOF');
const mapping: MappingInput = {
  curriculumId: C,
  sourceInstitution: 'School A',
  sourceCode: 'CS101',
  sourceName: 'Programming',
  minCredits: 3,
  targetCode: 'IT101',
  targetName: 'การเขียนโปรแกรม',
  targetCredits: 3,
  active: true,
};
const payload = {
  curriculumDocumentId: D,
  sourceInstitution: 'school a',
  courses: [
    { sourceCode: 'CS101', sourceName: 'Programming', credits: 3, grade: 'B' },
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

describe('Transfers HTTP flow', () => {
  let app: INestApplication;
  let rows: TransferRequest[];
  let docs: CurriculumDocument[];
  let mappings: TransferMapping[];
  let upload: ReturnType<typeof vi.fn>;
  let signed: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    rows = [];
    docs = [];
    mappings = [];
    upload = vi.fn();
    signed = vi.fn(async (path: string) => `https://private.test/${path}`);
    const repo = {
      catalogCurriculum: async (id: string) => id === C,
      listCurricula: async () => docs,
      getCurriculumDocument: async (id: string) =>
        docs.find((d) => d.id === id) ?? null,
      addCurriculumDocument: async (id: string, path: string) => {
        docs = [
          {
            id: D,
            curriculumId: id,
            curriculumName: 'หลักสูตรทดสอบ',
            year: 2569,
            active: true,
            path,
            fileName: 'curriculum.pdf',
            createdAt: new Date().toISOString(),
          },
        ];
        return { id: D };
      },
      listMappings: async (id?: string) =>
        mappings.filter((m) => !id || m.curriculumId === id),
      saveMapping: async (input: MappingInput) => {
        const row = { ...input, id: randomUUID() };
        mappings = [row];
        return row;
      },
      setMappingActive: async (id: string, active: boolean) => {
        mappings = mappings.map((m) => (m.id === id ? { ...m, active } : m));
        return { id };
      },
      upload,
      remove: vi.fn(),
      sign: signed,
      listRequests: async (id?: string) =>
        rows.filter((r) => !id || r.studentId === id),
      getRequest: async (id: string) => rows.find((r) => r.id === id) ?? null,
      insertRequest: async (input: NewTransferRequest) => {
        const row: TransferRequest = {
          ...structuredClone(input),
          id: randomUUID(),
          status: 'pending',
          studentName: 'นักศึกษา ทดสอบ',
          studentCode: '66000001',
          createdAt: new Date().toISOString(),
          reviewedAt: null,
          reviewedBy: null,
        };
        rows.push(row);
        return row;
      },
      review: async (
        id: string,
        reviewer: string,
        decisions: ReviewDecision[],
      ) => {
        const row = rows.find((r) => r.id === id)!;
        row.items = row.items.map((item) => ({
          ...item,
          ...decisions.find((d) => d.itemId === item.id),
        }));
        const count = decisions.filter((d) => d.decision === 'approved').length;
        row.status =
          count === 0
            ? 'rejected'
            : count === decisions.length
              ? 'approved'
              : 'partially_approved';
        row.reviewedBy = reviewer;
        row.reviewedAt = new Date().toISOString();
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [TransfersController],
      providers: [
        TransfersService,
        { provide: TRANSFERS_REPO, useValue: repo },
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
  async function prepare() {
    await request(app.getHttpServer())
      .post(`/transfers/curricula/${C}/document`)
      .set('x-role', 'admin')
      .attach('document', PDF, {
        filename: 'curriculum.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/transfers/mappings')
      .set('x-role', 'admin')
      .send(mapping)
      .expect(201);
  }
  async function submit(value = payload) {
    return request(app.getHttpServer())
      .post('/transfers/requests')
      .field('payload', JSON.stringify(value))
      .attach('document', PDF, {
        filename: 'transcript.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
  }
  it('เก็บชื่อไฟล์ภาษาไทยให้ถูกต้อง', async () => {
    await prepare();
    await request(app.getHttpServer())
      .post('/transfers/requests')
      .field('payload', JSON.stringify(payload))
      .attach('document', PDF, {
        filename: 'ใบแสดงผลการเรียน.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(rows[0].documentName).toBe('ใบแสดงผลการเรียน.pdf');
  });

  it('เอกสารเกิน 10 MB ได้ข้อความภาษาไทย', async () => {
    const res = await request(app.getHttpServer())
      .post('/transfers/requests')
      .field('payload', JSON.stringify(payload))
      .attach('document', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'big.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);
    expect(res.body.error.code).toBe('DOCUMENT_SIZE');
    expect(res.body.error.message).toBe('ไฟล์เอกสารใหญ่เกิน 10 MB');
  });

  it('อัปโหลดหลักสูตร → ชุดจับคู่ → นักศึกษายื่น → อนุมัติบางวิชา → นักศึกษาดูผล', async () => {
    await prepare();
    const curricula = await request(app.getHttpServer())
      .get('/transfers/curricula')
      .expect(200);
    expect(curricula.body.data[0].sourceInstitutions).toEqual(['SCHOOL A']);
    expect(curricula.body.data[0]).not.toHaveProperty('path');
    const response = await submit({
      ...payload,
      courses: [
        ...payload.courses,
        { sourceCode: 'UNKNOWN', sourceName: 'Other', credits: 3, grade: 'C' },
      ],
    });
    const row = response.body.data;
    expect(row.status).toBe('pending');
    expect(row.items[0].match.targetCode).toBe('IT101');
    expect(row.items[1].match).toBeNull();
    expect(row).not.toHaveProperty('documentPath');
    expect(upload).toHaveBeenCalledTimes(2);
    await request(app.getHttpServer())
      .post('/transfers/mappings')
      .set('x-role', 'admin')
      .send({ ...mapping, targetCode: 'NEW999' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/transfers/requests/${row.id}/review`)
      .set('x-role', 'admin')
      .set('x-user', 'admin-1')
      .send({
        decisions: [
          {
            itemId: row.items[0].id,
            decision: 'approved',
            note: 'ตรวจหลักสูตรและเกรดแล้ว',
          },
          {
            itemId: row.items[1].id,
            decision: 'rejected',
            note: 'ไม่มีคู่เทียบ',
          },
        ],
      })
      .expect(200);
    const result = await request(app.getHttpServer())
      .get('/transfers/requests')
      .expect(200);
    expect(result.body.data[0].status).toBe('partially_approved');
    expect(result.body.data[0].items[0].match.targetCode).toBe('IT101');
    expect(result.body.data[0].items[1].note).toBe('ไม่มีคู่เทียบ');
    await request(app.getHttpServer())
      .post(`/transfers/requests/${row.id}/review`)
      .set('x-role', 'admin')
      .send({
        decisions: row.items.map((item: { id: string }) => ({
          itemId: item.id,
          decision: 'rejected',
          note: 'again',
        })),
      })
      .expect(409);
  });
  it('student เห็นเฉพาะคำขอและเอกสารของตนเอง admin เปิดได้ teacher เข้าไม่ได้', async () => {
    await prepare();
    const { body } = await submit();
    const id = body.data.id;
    await request(app.getHttpServer())
      .get(`/transfers/requests/${id}/documents/request`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/transfers/requests/${id}/documents/curriculum`)
      .expect(200);
    const calls = signed.mock.calls.length;
    await request(app.getHttpServer())
      .get(`/transfers/requests/${id}/documents/request`)
      .set('x-user', 'other')
      .expect(404);
    expect(signed.mock.calls.length).toBe(calls);
    const mine = await request(app.getHttpServer())
      .get('/transfers/requests')
      .set('x-user', 'other')
      .expect(200);
    expect(mine.body.data).toEqual([]);
    await request(app.getHttpServer())
      .get(`/transfers/requests/${id}/documents/request`)
      .set('x-role', 'admin')
      .expect(200);
    await request(app.getHttpServer())
      .get(`/transfers/requests/${id}/documents/request`)
      .set('x-role', 'teacher')
      .expect(403);
  });
  it.each([
    ['get', '/transfers/mappings', 'student'],
    ['get', '/transfers/requests', 'teacher'],
    ['post', '/transfers/mappings', 'student'],
    ['post', `/transfers/curricula/${C}/document`, 'student'],
    ['post', `/transfers/requests/${C}/review`, 'student'],
    ['post', '/transfers/requests', 'admin'],
  ])('ปฏิเสธ %s %s สำหรับ %s', async (method, path, role) => {
    const agent = request(app.getHttpServer());
    await (method === 'get' ? agent.get(path) : agent.post(path))
      .set('x-role', role)
      .send({})
      .expect(403);
  });
  it('ไฟล์ปลอมและ payload ผิดไม่ถูกอัปโหลด', async () => {
    await prepare();
    upload.mockClear();
    await request(app.getHttpServer())
      .post('/transfers/requests')
      .field('payload', JSON.stringify(payload))
      .attach('document', Buffer.from('not pdf'), {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/transfers/requests')
      .field('payload', '{bad json')
      .attach('document', PDF, {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    expect(upload).not.toHaveBeenCalled();
  });
  it('ชุดจับคู่ที่ปิดใช้งานแล้วไม่ถูกใช้', async () => {
    await prepare();
    await request(app.getHttpServer())
      .patch(`/transfers/mappings/${mappings[0].id}`)
      .set('x-role', 'admin')
      .send({ active: false })
      .expect(200);
    const { body } = await submit();
    expect(body.data.items[0].match).toBeNull();
  });
});
