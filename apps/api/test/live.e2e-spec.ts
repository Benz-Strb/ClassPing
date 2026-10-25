import { Test } from '@nestjs/testing';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RolesGuard } from './../src/auth/roles.guard.js';
import { EnvelopeInterceptor } from './../src/common/envelope.interceptor.js';
import { HttpExceptionFilter } from './../src/common/http-exception.filter.js';
import { LiveController } from './../src/media/live.controller.js';
import { LiveService } from './../src/media/live.service.js';

// login ปลอม: ใส่บทบาทผ่าน header แทน token จริง
class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    req.user = { id: 'u1', role: req.headers['x-role'] };
    return true;
  }
}

const SESSION = '00000000-0000-0000-0000-000000000000';

describe('กล้องสด (สิทธิ์)', () => {
  let app: INestApplication<App>;
  let calls: string[];

  beforeEach(async () => {
    calls = [];
    const moduleRef = await Test.createTestingModule({
      controllers: [LiveController],
      providers: [
        {
          provide: LiveService,
          useValue: {
            listForDate: async () => {
              calls.push('list');
              return [];
            },
            startLive: async () => {
              calls.push('live');
              return { whepUrl: 'x', token: 't', expiresAt: 'e', session: {} };
            },
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

  it('นักศึกษาได้ 403 ทั้งดูรายการและขอดูสด', async () => {
    const server = app.getHttpServer();
    await request(server)
      .get('/live/sessions?date=2026-10-24')
      .set('x-role', 'student')
      .expect(403);
    await request(server).post(`/sessions/${SESSION}/live`).set('x-role', 'student').expect(403);
    expect(calls).toEqual([]);
  });

  it.each(['teacher', 'admin'])('%s เรียกได้ ขอดูสดตอบ 200', async (role) => {
    const server = app.getHttpServer();
    await request(server).get('/live/sessions?date=2026-10-24').set('x-role', role).expect(200);
    await request(server).post(`/sessions/${SESSION}/live`).set('x-role', role).expect(200);
    expect(calls).toEqual(['list', 'live']);
  });
});
