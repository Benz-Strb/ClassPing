import { Test } from '@nestjs/testing';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AttendanceController } from './../src/attendance/attendance.controller.js';
import { AttendanceService } from './../src/attendance/attendance.service.js';
import { RolesGuard } from './../src/auth/roles.guard.js';
import { AppError } from './../src/common/app-error.js';
import { EnvelopeInterceptor } from './../src/common/envelope.interceptor.js';
import { HttpExceptionFilter } from './../src/common/http-exception.filter.js';

// login ปลอม: ใส่บทบาทผ่าน header แทน token จริง
class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    req.user = { id: 'u1', role: req.headers['x-role'] };
    return true;
  }
}

const SESSION = '11111111-1111-4111-8111-111111111111';

describe('ผลเช็คชื่อรายคาบ (สิทธิ์และรูปแบบ)', () => {
  let app: INestApplication<App>;
  let calls: string[];

  beforeEach(async () => {
    calls = [];
    const moduleRef = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        {
          provide: AttendanceService,
          useValue: {
            view: async () => {
              calls.push('view');
              return { session: {}, rows: [], unknown: [] };
            },
            setStatus: async () => {
              calls.push('setStatus');
              throw new AppError(400, 'BAD_REQUEST', 'สถานะไม่ถูกต้อง');
            },
            review: async (_u: unknown, _s: string, code: string) => {
              calls.push(`review ${code}`);
              return { session: {}, rows: [], unknown: [] };
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

  it('นักศึกษาได้ 403 ทุก route และไม่ถึง service', async () => {
    const server = app.getHttpServer();
    await request(server).get(`/sessions/${SESSION}/attendance`).set('x-role', 'student').expect(403);
    await request(server)
      .patch(`/sessions/${SESSION}/attendance/66000001`)
      .set('x-role', 'student')
      .send({ status: 'present' })
      .expect(403);
    await request(server)
      .post(`/sessions/${SESSION}/attendance/66000001/review`)
      .set('x-role', 'student')
      .send({ action: 'confirm' })
      .expect(403);
    expect(calls).toEqual([]);
  });

  it('อาจารย์ดูได้', async () => {
    await request(app.getHttpServer())
      .get(`/sessions/${SESSION}/attendance`)
      .set('x-role', 'teacher')
      .expect(200)
      .expect({ data: { session: {}, rows: [], unknown: [] } });
  });

  it('error จาก service ส่งต่อในรูปแบบกลาง', async () => {
    await request(app.getHttpServer())
      .patch(`/sessions/${SESSION}/attendance/66000001`)
      .set('x-role', 'teacher')
      .send({ status: 'leave' })
      .expect(400)
      .expect({ error: { code: 'BAD_REQUEST', message: 'สถานะไม่ถูกต้อง' } });
  });

  it('review ตอบ 200 และส่งรหัสถึง service', async () => {
    await request(app.getHttpServer())
      .post(`/sessions/${SESSION}/attendance/66000001/review`)
      .set('x-role', 'teacher')
      .send({ action: 'confirm' })
      .expect(200);
    expect(calls).toEqual(['review 66000001']);
  });
});
