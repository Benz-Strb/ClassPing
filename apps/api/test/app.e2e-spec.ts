import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // ค่าปลอมพอให้แอปบูตได้ เคสในไฟล์นี้ไม่ได้เรียก Supabase จริง
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.FACE_SERVICE_TOKEN = 'f'.repeat(32);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('GET /health เปิดให้เรียกได้โดยไม่ต้อง login', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ data: { ok: true } });
  });

  it('GET /me ไม่มี token ได้ 401 ในรูปแบบ error กลาง', () => {
    return request(app.getHttpServer())
      .get('/me')
      .expect(401)
      .expect({
        error: { code: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบใหม่' },
      });
  });

  it.each([
    '/rooms',
    '/courses',
    '/courses/x/sessions?from=2026-10-20&to=2026-10-26',
    '/courses/x/exams',
    '/teachers',
    '/live/sessions?date=2026-10-24',
    '/sessions/00000000-0000-0000-0000-000000000000/recording',
  ])('GET %s ต้อง login ก่อน', (path) => {
    return request(app.getHttpServer()).get(path).expect(401);
  });

  it.each([
    ['post', '/me/consent'],
    ['get', '/me/face'],
    ['put', '/me/face/front'],
    ['post', '/me/identity'],
    ['delete', '/users/00000000-0000-0000-0000-000000000000/face'],
    ['post', '/sessions/00000000-0000-0000-0000-000000000000/live'],
    ['post', '/sessions/00000000-0000-0000-0000-000000000000/recording/link'],
  ] as const)('%s %s ต้อง login ก่อน', (method, path) => {
    return request(app.getHttpServer())[method](path).expect(401);
  });

  it('GET /clips/:token เปิดได้โดยไม่ต้อง login แต่ลิงก์ผิดได้ 401 แบบ error กลาง', () => {
    return request(app.getHttpServer())
      .get('/clips/not-a-token')
      .expect(401)
      .expect({ error: { code: 'LINK_EXPIRED', message: 'ลิงก์หมดอายุแล้ว กดเปิดใหม่อีกครั้ง' } });
  });

  afterEach(async () => {
    await app.close();
  });
});
