import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { AdminController } from '../src/admin/admin.controller.js';
import { AdminService } from '../src/admin/admin.service.js';
import { CatalogController } from '../src/admin/catalog.controller.js';
import { CurriculaController } from '../src/admin/curricula.controller.js';
import { CatalogService } from '../src/admin/catalog.service.js';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { EnvelopeInterceptor } from '../src/common/envelope.interceptor.js';
import { CATALOG_REPO } from '../src/admin/catalog.repo.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { LeaveOcrClient } from '../src/leave/leave-ocr.client.js';
import { APP_CONFIG } from '../src/config/config.js';

class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    if (req.headers['x-role']) req.user = { id: 'user', role: req.headers['x-role'] };
    return true;
  }
}

const OCR_PATH = '/teacher/curricula/document/preview';
const ocr = { readLeaveDocument: vi.fn().mockResolvedValue({ lines: [{ text: 'ข้อความหลักสูตร' }] }) };
const ocrProviders = [
  { provide: CLOCK, useValue: () => new Date() },
  { provide: LeaveOcrClient, useValue: ocr },
];

describe('Admin HTTP RBAC', () => {
  let app: INestApplication<App>;
  const admin = { listUsers: vi.fn(async () => []), listRooms: vi.fn(async () => []), listCameras: vi.fn(async () => []), listVideoViews: vi.fn(async () => []), createRoom: vi.fn(), createCameraToken: vi.fn(), changeRole: vi.fn() };
  const catalog = { list: vi.fn(async () => []), create: vi.fn(), update: vi.fn(), importCsv: vi.fn() };
  const routes = [
    ['get', '/admin/users'], ['get', '/admin/rooms'], ['post', '/admin/rooms'],
    ['get', '/admin/cameras'], ['get', '/admin/video-views'], ['post', '/admin/cameras/room/token'], ['patch', '/admin/users/user/role'],
    ...['curricula', 'reference'].flatMap((kind) => [
      ['get', `/admin/catalog/${kind}`], ['post', `/admin/catalog/${kind}`],
      ['put', `/admin/catalog/${kind}/entry`], ['post', `/admin/catalog/${kind}/import`],
    ]),
  ] as [string, string][];
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminController, CatalogController, CurriculaController],
      providers: [
        ...ocrProviders,
        { provide: AdminService, useValue: admin }, { provide: CatalogService, useValue: catalog },
        { provide: APP_GUARD, useClass: FakeAuth }, { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalInterceptors(new EnvelopeInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => vi.clearAllMocks());
  for (const role of ['student', 'teacher', '']) {
    it(`blocks every admin route for ${role || 'missing user'} before service invocation`, async () => {
      for (const [method, path] of routes) {
        const agent = request(app.getHttpServer());
        const response = await agent[method as 'post'](path).set('x-role', role).send({});
        expect(response.status, `${method} ${path}`).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      }
      for (const fn of [...Object.values(admin), ...Object.values(catalog)]) expect(fn).not.toHaveBeenCalled();
    });
  }
  it('admin ใช้เส้นทางหลักสูตรเดิมและใหม่ไม่ได้แล้ว', async () => {
    for (const [method, path] of [
      ['get', '/admin/catalog/curricula'], ['post', '/admin/catalog/curricula'],
      ['put', '/admin/catalog/curricula/entry'], ['post', '/admin/catalog/curricula/import'],
      ['get', '/teacher/curricula'], ['post', '/teacher/curricula'],
      ['put', '/teacher/curricula/entry'], ['post', '/teacher/curricula/import'],
    ] as [string, string][]) {
      const response = await request(app.getHttpServer())[method as 'post'](path).set('x-role', 'admin').send({});
      expect(response.status, `${method} ${path}`).toBe(403);
    }
    for (const fn of Object.values(catalog)) expect(fn).not.toHaveBeenCalled();
  });
  it('อาจารย์จัดการได้เฉพาะหลักสูตร', async () => {
    await request(app.getHttpServer()).get('/teacher/curricula').set('x-role', 'teacher').expect(200);
    await request(app.getHttpServer()).post('/teacher/curricula').set('x-role', 'teacher').send({ name: 'IT' }).expect(201);
    await request(app.getHttpServer()).put('/teacher/curricula/entry').set('x-role', 'teacher').send({ name: 'IT' }).expect(200);
    await request(app.getHttpServer()).post('/teacher/curricula/import').set('x-role', 'teacher').send({ csv: 'x' }).expect(201);
    expect(catalog.list).toHaveBeenCalledWith('curricula');
    expect(catalog.create).toHaveBeenCalledWith('curricula', { name: 'IT' });
    expect(catalog.update).toHaveBeenCalledWith('curricula', 'entry', { name: 'IT' });
    expect(catalog.importCsv).toHaveBeenCalledWith('curricula', { csv: 'x' });
  });
  for (const role of ['student', '']) {
    it(`blocks teacher curricula routes for ${role || 'missing user'}`, async () => {
      for (const [method, path] of [['get', '/teacher/curricula'], ['post', '/teacher/curricula'], ['put', '/teacher/curricula/entry'], ['post', '/teacher/curricula/import']] as [string, string][]) {
        const response = await request(app.getHttpServer())[method as 'post'](path).set('x-role', role).send({});
        expect(response.status, `${method} ${path}`).toBe(403);
      }
      for (const fn of Object.values(catalog)) expect(fn).not.toHaveBeenCalled();
    });
  }
  it('allows only teachers to submit documents for OCR', async () => {
    for (const role of ['student', 'admin', '']) {
      await request(app.getHttpServer()).post(OCR_PATH).set('x-role', role)
        .attach('document', Buffer.from('%PDF-1.7'), 'curriculum.pdf').expect(403);
    }
    expect(ocr.readLeaveDocument).not.toHaveBeenCalled();
    const response = await request(app.getHttpServer()).post(OCR_PATH).set('x-role', 'teacher')
      .attach('document', Buffer.from('%PDF-1.7'), 'curriculum.pdf').expect(201);
    expect(response.body.data).toEqual({ content: 'ข้อความหลักสูตร' });
    expect(catalog.create).not.toHaveBeenCalled();
  });
  it('allows admin and dispatches writes to the intended handler', async () => {
    await request(app.getHttpServer()).get('/admin/catalog/reference').set('x-role', 'admin').expect(200);
    await request(app.getHttpServer()).post('/admin/catalog/reference/import').set('x-role', 'admin').send({ csv: 'example' }).expect(201);
    await request(app.getHttpServer()).put('/admin/catalog/reference/entry').set('x-role', 'admin').send({ name: 'FAQ' }).expect(200);
    await request(app.getHttpServer()).get('/admin/video-views?from=2026-11-01&to=2026-11-02').set('x-role', 'admin').expect(200);
    expect(admin.listVideoViews).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-11-02' });
    await request(app.getHttpServer()).post('/admin/cameras/room/token').set('x-role', 'admin').expect(201);
    expect(catalog.importCsv).toHaveBeenCalledWith('reference', { csv: 'example' });
    expect(catalog.update).toHaveBeenCalledWith('reference', 'entry', { name: 'FAQ' });
    expect(admin.createCameraToken).toHaveBeenCalledWith('room', undefined);
  });
});

describe('Admin catalog HTTP validation and UTF-8 payloads', () => {
  let app: INestApplication<App>;
  const repo = { insert: vi.fn(async (_kind: string, rows: object[]) => rows.map((row) => ({ id: 'entry', ...row }))), list: vi.fn(async () => []), update: vi.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CatalogController, CurriculaController],
      providers: [...ocrProviders, CatalogService, { provide: CATALOG_REPO, useValue: repo },
        { provide: APP_CONFIG, useValue: { allowedOrigins: [], port: 3001 } },
        { provide: APP_GUARD, useClass: FakeAuth }, { provide: APP_GUARD, useClass: RolesGuard }],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => vi.clearAllMocks());
  it('accepts bounded Thai text larger than the default 100 KB body limit', async () => {
    const response = await request(app.getHttpServer()).post('/admin/catalog/reference').set('x-role', 'admin')
      .send({ code: 'FAQ', name: 'FAQ', category: 'ทั่วไป', content: 'ก'.repeat(50000), active: true });
    expect(response.status).toBe(201);
    expect(response.body.data.content).toHaveLength(50000);
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });
  it('saves a reviewed Thai curriculum draft larger than the default JSON limit', async () => {
    const content = 'ก'.repeat(50_000);
    const draft = { code: 'CS', name: 'หลักสูตรตัวอย่าง', year: 2569, content };
    const response = await request(app.getHttpServer()).post('/teacher/curricula').set('x-role', 'teacher')
      .send(draft).expect(201);
    expect(response.body.data).toMatchObject(draft);
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });
  it('reports invalid CSV row without writing any records', async () => {
    const response = await request(app.getHttpServer()).post('/teacher/curricula/import').set('x-role', 'teacher')
      .send({ csv: 'code,name,year\nCS,Computer,2569\nIT,IT,no-year' });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('3');
    expect(repo.insert).not.toHaveBeenCalled();
  });
  it('rejects unsupported kinds', async () => {
    await request(app.getHttpServer()).get('/admin/catalog/users').set('x-role', 'admin').expect(400);
    await request(app.getHttpServer()).post('/admin/catalog/knowledge/import').set('x-role', 'admin').send({ csv: 'name\nFAQ' }).expect(400);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.list).not.toHaveBeenCalled();
  });
});
