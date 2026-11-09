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
import { LeaveOcrClient } from '../src/leave/leave-ocr.client.js';
import { TransfersService } from '../src/transfers/transfers.service.js';
import { TransferOcrLimitGuard } from '../src/transfers/transfer-ocr-limit.guard.js';
import { CLOCK } from '../src/common/clock.js';
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
      addCurriculumDocument: async (id: string, path: string, _file: unknown, details?: { sourceInstitution: string; sourceMajor: string; courses: { sourceCode: string; sourceName: string; credits: number; grade: string }[] }) => {
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
            ...details,
          },
        ];
        return { id: D };
      },
      createCatalog: async () => C,
      assignCurriculum: async (requestId: string, doc: CurriculumDocument, items: TransferRequest['items']) => {
        const row = rows.find(r => r.id === requestId)!;
        Object.assign(row, { curriculumId: doc.curriculumId, curriculumDocumentId: doc.id, curriculumName: doc.curriculumName, items });
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
        TransferOcrLimitGuard,
        { provide: CLOCK, useValue: () => new Date() },
        { provide: LeaveOcrClient, useValue: { readTransferDocument: vi.fn().mockResolvedValue({ lines: [{ text: 'School A University' }, { text: 'Major: CS' }, { text: 'IT101 Programming 3' }] }) } },
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
      .set('x-role', 'teacher')
      .attach('document', PDF, {
        filename: 'curriculum.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/transfers/mappings')
      .set('x-role', 'teacher')
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
      .set('x-role', 'teacher')
      .send({ ...mapping, targetCode: 'NEW999' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/transfers/requests/${row.id}/review`)
      .set('x-role', 'teacher')
      .set('x-user', 'teacher-1')
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
    expect(result.body.data[0].reviewedBy).toBe('teacher-1');
    expect(result.body.data[0].items[0].match.targetCode).toBe('IT101');
    expect(result.body.data[0].items[1].note).toBe('ไม่มีคู่เทียบ');
    await request(app.getHttpServer())
      .post(`/transfers/requests/${row.id}/review`)
      .set('x-role', 'teacher')
      .send({
        decisions: row.items.map((item: { id: string }) => ({
          itemId: item.id,
          decision: 'rejected',
          note: 'again',
        })),
      })
      .expect(409);
  });
  it('student เห็นเฉพาะคำขอและเอกสารของตนเอง teacher เปิดได้ admin เข้าไม่ได้', async () => {
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
      .set('x-role', 'teacher')
      .expect(200);
    await request(app.getHttpServer())
      .get(`/transfers/requests/${id}/documents/request`)
      .set('x-role', 'admin')
      .expect(403);
  });
  it.each([
    ['get', '/transfers/mappings', 'student'],
    ['post', '/transfers/mappings', 'student'],
    ['post', `/transfers/curricula/${C}/document`, 'student'],
    ['post', `/transfers/requests/${C}/review`, 'student'],
    ['post', '/transfers/requests', 'teacher'],
    ['get', '/transfers/curricula', 'admin'],
    ['get', `/transfers/curricula/${D}/document`, 'admin'],
    ['get', '/transfers/requests', 'admin'],
    ['get', `/transfers/requests/${C}/documents/request`, 'admin'],
    ['post', '/transfers/requests', 'admin'],
    ['get', '/transfers/mappings', 'admin'],
    ['post', '/transfers/mappings', 'admin'],
    ['patch', `/transfers/mappings/${C}`, 'admin'],
    ['post', `/transfers/curricula/${C}/document`, 'admin'],
    ['post', `/transfers/requests/${C}/review`, 'admin'],
  ])('ปฏิเสธ %s %s สำหรับ %s', async (method, path, role) => {
    const agent = request(app.getHttpServer());
    await agent[method as 'get'](path)
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
  it('ไม่ใช้ชุดจับคู่ที่ปิดใช้งาน แต่เสนอจากหลักสูตร OCR ได้', async () => {
    await prepare();
    await request(app.getHttpServer())
      .patch(`/transfers/mappings/${mappings[0].id}`)
      .set('x-role', 'teacher')
      .send({ active: false })
      .expect(200);
    const { body } = await submit();
    expect(body.data.items[0].matchSource).toBe('curriculum');
    expect(body.data.items[0].match.id).toBe(D);
  });
  it('OCR → ส่งคำขอไม่มีหลักสูตร → อาจารย์อัปโหลดหลักสูตร/จับคู่/อนุมัติ → อ้างอิงประวัติครั้งถัดไป', async () => {
    const preview = await request(app.getHttpServer()).post('/transfers/preview').attach('document', PDF, { filename: 'source.pdf', contentType: 'application/pdf' }).expect(201);
    expect(preview.body.data).toMatchObject({ sourceInstitution: 'School A University', sourceMajor: 'CS', courses: [{ sourceCode: 'IT101', credits: 3 }] });
    const draft = preview.body.data;
    const first = await request(app.getHttpServer()).post('/transfers/requests').field('payload', JSON.stringify(draft)).attach('document', PDF, { filename: 'source.pdf', contentType: 'application/pdf' }).expect(201);
    expect(first.body.data).toMatchObject({ status: 'pending', curriculumDocumentId: null, sourceMajor: 'CS' });
    await request(app.getHttpServer()).post('/transfers/curricula').set('x-role', 'teacher').field('payload', JSON.stringify({ name: 'Computer Science', year: 2569, draft })).attach('document', PDF, { filename: 'target.pdf', contentType: 'application/pdf' }).expect(201);
    await request(app.getHttpServer()).patch(`/transfers/requests/${first.body.data.id}/curriculum`).set('x-role', 'teacher').send({ curriculumDocumentId: D }).expect(200);
    const row = rows[0];
    expect(row.items[0].match?.targetCode).toBe('IT101');
    expect(row.items[0].decision).toBeUndefined();
    await request(app.getHttpServer()).post(`/transfers/requests/${row.id}/review`).set('x-role', 'teacher').send({ decisions: [{ itemId: row.items[0].id, decision: 'approved' }] }).expect(200);
    const next = await request(app.getHttpServer()).post('/transfers/requests').set('x-user', 'student-2').field('payload', JSON.stringify(draft)).attach('document', PDF, { filename: 'second.pdf', contentType: 'application/pdf' }).expect(201);
    expect(next.body.data).toMatchObject({ status: 'pending', items: [{ matchSource: 'history' }] });
    expect(next.body.data.items[0].decision).toBeUndefined();
    // คำขอเก่าเป็นของนักศึกษาคนอื่น นักศึกษาไม่ได้เห็น อาจารย์เห็น
    expect(next.body.data.items[0]).not.toHaveProperty('previousApproval');
    const mine = await request(app.getHttpServer()).get('/transfers/requests').set('x-user', 'student-2').expect(200);
    expect(mine.body.data.every((r: { items: object[] }) => r.items.every((item) => !('previousApproval' in item)))).toBe(true);
    const all = await request(app.getHttpServer()).get('/transfers/requests').set('x-role', 'teacher').expect(200);
    expect(all.body.data.find((r: { id: string }) => r.id === next.body.data.id).items[0]).toMatchObject({ previousApproval: { requestId: row.id } });
  });

});
