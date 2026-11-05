import { Test } from '@nestjs/testing';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RolesGuard } from './../src/auth/roles.guard.js';
import { EnvelopeInterceptor } from './../src/common/envelope.interceptor.js';
import { HttpExceptionFilter } from './../src/common/http-exception.filter.js';
import { OutOfRoomController } from './../src/door/out-of-room.controller.js';
import { TripsController } from './../src/door/trips.controller.js';
import { TripsService } from './../src/door/trips.service.js';

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

const SESSION = '11111111-1111-4111-8111-111111111111';
const TRIP = '22222222-2222-4222-8222-222222222222';
const COURSE = '33333333-3333-4333-8333-333333333333';

describe('รอบนอกห้อง (สิทธิ์และรูปแบบ)', () => {
  let app: INestApplication<App>;
  let calls: unknown[][];

  beforeEach(async () => {
    calls = [];
    const moduleRef = await Test.createTestingModule({
      controllers: [TripsController, OutOfRoomController],
      providers: [
        {
          provide: TripsService,
          useValue: {
            setBack: async (_u: unknown, s: string, t: string, body: unknown) => {
              calls.push(['setBack', s, t, body]);
              return { session: {}, rows: [] };
            },
            remove: async (_u: unknown, s: string, t: string) => {
              calls.push(['remove', s, t]);
              return { session: {}, rows: [] };
            },
            review: async (_u: unknown, s: string, t: string, body: unknown) => {
              calls.push(['review', s, t, body]);
              return { session: {}, rows: [] };
            },
            report: async (_u: unknown, c: string, query: unknown) => {
              calls.push(['report', c, query]);
              return [];
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

  it.each(['student', 'admin'])('%s ได้ 403 ทุก route ของรอบ และไม่ถึง service', async (role) => {
    const server = app.getHttpServer();
    await request(server)
      .patch(`/sessions/${SESSION}/trips/${TRIP}`)
      .set('x-role', role)
      .send({ backAt: '2026-10-23T03:00:00Z' })
      .expect(403);
    await request(server)
      .delete(`/sessions/${SESSION}/trips/${TRIP}`)
      .set('x-role', role)
      .expect(403);
    await request(server)
      .post(`/sessions/${SESSION}/trips/${TRIP}/review`)
      .set('x-role', role)
      .send({ action: 'reject' })
      .expect(403);
    expect(calls).toEqual([]);
  });

  it('นักศึกษาได้ 403 ที่รายงานนอกห้อง และไม่ถึง service', async () => {
    await request(app.getHttpServer())
      .get(`/courses/${COURSE}/out-of-room?from=2026-10-01&to=2026-10-31`)
      .set('x-role', 'student')
      .expect(403);
    expect(calls).toEqual([]);
  });

  it('อาจารย์ PATCH, DELETE, review ได้ และส่งค่าถึง service', async () => {
    const server = app.getHttpServer();
    await request(server)
      .patch(`/sessions/${SESSION}/trips/${TRIP}`)
      .set('x-role', 'teacher')
      .send({ backAt: '2026-10-23T03:00:00Z' })
      .expect(200)
      .expect({ data: { session: {}, rows: [] } });
    await request(server)
      .delete(`/sessions/${SESSION}/trips/${TRIP}`)
      .set('x-role', 'teacher')
      .expect(200);
    await request(server)
      .post(`/sessions/${SESSION}/trips/${TRIP}/review`)
      .set('x-role', 'teacher')
      .send({ action: 'confirm' })
      .expect(200);
    expect(calls).toEqual([
      ['setBack', SESSION, TRIP, { backAt: '2026-10-23T03:00:00Z' }],
      ['remove', SESSION, TRIP],
      ['review', SESSION, TRIP, { action: 'confirm' }],
    ]);
  });

  it.each(['teacher', 'admin'])('%s ดูรายงานนอกห้องได้', async (role) => {
    await request(app.getHttpServer())
      .get(`/courses/${COURSE}/out-of-room?from=2026-10-01&to=2026-10-31`)
      .set('x-role', role)
      .expect(200)
      .expect({ data: [] });
    expect(calls).toEqual([['report', COURSE, { from: '2026-10-01', to: '2026-10-31' }]]);
  });
});
