import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CatalogController } from '../src/admin/catalog.controller.js';
import { CatalogService } from '../src/admin/catalog.service.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { EnvelopeInterceptor } from '../src/common/envelope.interceptor.js';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { KNOWLEDGE_FILE_LIMIT } from '../src/admin/knowledge-file.js';

describe('Knowledge file upload HTTP', () => {
  let app: INestApplication;
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: CatalogService, useValue: {} }, { provide: APP_GUARD, useClass: RolesGuard }],
    }).compile();
    app = module.createNestApplication();
    app.use((req: { headers: Record<string, string>; user?: { role: string } }, _res: unknown, next: () => void) => {
      if (req.headers.authorization === 'Bearer admin') req.user = { role: 'admin' };
      if (req.headers.authorization === 'Bearer student') req.user = { role: 'student' };
      next();
    });
    app.useGlobalInterceptors(new EnvelopeInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  afterEach(async () => { await app.close(); });
  it('returns extracted text in the standard envelope without saving', async () => {
    const res = await request(app.getHttpServer()).post('/admin/catalog/knowledge/extract')
      .set('Authorization', 'Bearer admin').attach('file', Buffer.from('ทุนการศึกษา'), 'scholarship.txt').expect(201);
    expect(res.body.data).toEqual({ name: 'scholarship', content: 'ทุนการศึกษา' });
  });
  it('keeps a Thai file name for the default name', async () => {
    const res = await request(app.getHttpServer()).post('/admin/catalog/knowledge/extract')
      .set('Authorization', 'Bearer admin').attach('file', Buffer.from('ทุนการศึกษา'), 'ทุนเรียนดี.txt').expect(201);
    expect(res.body.data.name).toBe('ทุนเรียนดี');
  });
  it('requires an admin role before parsing uploads', async () => {
    for (const token of ['', 'Bearer student']) {
      await request(app.getHttpServer()).post('/admin/catalog/knowledge/extract')
        .set('Authorization', token).attach('file', Buffer.from('test'), 'test.txt').expect(403);
    }
  });
  it('accepts a file at the new 25 MB limit', async () => {
    const buffer = Buffer.alloc(25 * 1024 * 1024, ' ');
    buffer.write('Scholarship');
    const res = await request(app.getHttpServer()).post('/admin/catalog/knowledge/extract')
      .set('Authorization', 'Bearer admin').attach('file', buffer, 'large.txt').expect(201);
    expect(res.body.data.content).toBe('Scholarship');
  });
  it('rejects a missing file and enforces the multipart size limit', async () => {
    const res = await request(app.getHttpServer()).post('/admin/catalog/knowledge/extract')
      .set('Authorization', 'Bearer admin').expect(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
    await request(app.getHttpServer()).post('/admin/catalog/knowledge/extract')
      .set('Authorization', 'Bearer admin').attach('file', Buffer.alloc(KNOWLEDGE_FILE_LIMIT + 1), 'large.txt').expect(413);
  });
});
