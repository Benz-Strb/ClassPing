import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { AdminController } from '../src/admin/admin.controller.js';
import { AdminService } from '../src/admin/admin.service.js';
import { CatalogController } from '../src/admin/catalog.controller.js';
import { CHAT_PROVIDER, MockChatProvider } from '../src/chat/chat.provider.js';
import { CatalogService } from '../src/admin/catalog.service.js';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { EnvelopeInterceptor } from '../src/common/envelope.interceptor.js';
import { CATALOG_REPO } from '../src/admin/catalog.repo.js';
import { configureApp } from '../src/app.setup.js';
import { APP_CONFIG } from '../src/config/config.js';

class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    if (req.headers['x-role']) req.user = { id: 'user', role: req.headers['x-role'] };
    return true;
  }
}

describe('Admin HTTP RBAC', () => {
  let app: INestApplication<App>;
  const admin = { listUsers: vi.fn(async () => []), listRooms: vi.fn(async () => []), listCameras: vi.fn(async () => []), listVideoViews: vi.fn(async () => []), createRoom: vi.fn(), createCameraToken: vi.fn(), changeRole: vi.fn() };
  const catalog = { list: vi.fn(async () => []), create: vi.fn(), update: vi.fn(), importCsv: vi.fn() };
  const routes = [
    ['get', '/admin/users'], ['get', '/admin/rooms'], ['post', '/admin/rooms'],
    ['get', '/admin/cameras'], ['get', '/admin/video-views'], ['post', '/admin/cameras/room/token'], ['patch', '/admin/users/user/role'],
    ...['curricula', 'reference', 'knowledge'].flatMap((kind) => [
      ['get', `/admin/catalog/${kind}`], ['post', `/admin/catalog/${kind}`],
      ['put', `/admin/catalog/${kind}/entry`], ['post', `/admin/catalog/${kind}/import`],
    ]),
  ] as [string, string][];
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminController, CatalogController],
      providers: [
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
  it('allows admin and dispatches writes to the intended handler', async () => {
    await request(app.getHttpServer()).get('/admin/catalog/curricula').set('x-role', 'admin').expect(200);
    await request(app.getHttpServer()).post('/admin/catalog/reference/import').set('x-role', 'admin').send({ csv: 'example' }).expect(201);
    await request(app.getHttpServer()).put('/admin/catalog/knowledge/entry').set('x-role', 'admin').send({ name: 'FAQ' }).expect(200);
    await request(app.getHttpServer()).get('/admin/video-views?from=2026-11-01&to=2026-11-02').set('x-role', 'admin').expect(200);
    expect(admin.listVideoViews).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-11-02' });
    await request(app.getHttpServer()).post('/admin/cameras/room/token').set('x-role', 'admin').expect(201);
    expect(catalog.importCsv).toHaveBeenCalledWith('reference', { csv: 'example' });
    expect(catalog.update).toHaveBeenCalledWith('knowledge', 'entry', { name: 'FAQ' });
    expect(admin.createCameraToken).toHaveBeenCalledWith('room', undefined);
  });
});

describe('Admin catalog HTTP validation and UTF-8 payloads', () => {
  let app: INestApplication<App>;
  const repo = { saveKnowledge: vi.fn(async (_id: string | null, row: object) => ({ id: 'entry', ...row })), insert: vi.fn(async (_kind: string, rows: object[]) => rows.map((row) => ({ id: 'entry', ...row }))), list: vi.fn(async () => []), update: vi.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [CatalogService, { provide: CHAT_PROVIDER, useClass: MockChatProvider }, { provide: CATALOG_REPO, useValue: repo },
        { provide: APP_CONFIG, useValue: { allowedOrigins: [], port: 3001 } },
        { provide: APP_GUARD, useClass: FakeAuth }, { provide: APP_GUARD, useClass: RolesGuard }],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => vi.clearAllMocks());
  it('accepts bounded Thai knowledge text larger than the default 100 KB body limit', async () => {
    const response = await request(app.getHttpServer()).post('/admin/catalog/knowledge').set('x-role', 'admin')
      .send({ name: 'FAQ', content: 'ก'.repeat(50000), url: '', active: true });
    expect(response.status).toBe(201);
    expect(response.body.data.content).toHaveLength(50000);
    expect(repo.saveKnowledge).toHaveBeenCalledTimes(1);
  });
  it('reports invalid CSV row without writing any records', async () => {
    const response = await request(app.getHttpServer()).post('/admin/catalog/curricula/import').set('x-role', 'admin')
      .send({ csv: 'code,name,year\nCS,Computer,2569\nIT,IT,no-year' });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('3');
    expect(repo.insert).not.toHaveBeenCalled();
  });
  it('rejects unsupported kinds and importing knowledge as CSV', async () => {
    await request(app.getHttpServer()).get('/admin/catalog/users').set('x-role', 'admin').expect(400);
    await request(app.getHttpServer()).post('/admin/catalog/knowledge/import').set('x-role', 'admin').send({ csv: 'name\nFAQ' }).expect(400);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.list).not.toHaveBeenCalled();
  });
});
