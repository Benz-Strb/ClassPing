import { Test } from '@nestjs/testing';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RolesGuard } from './../src/auth/roles.guard.js';
import { EnrollmentController } from './../src/enrollment/enrollment.controller.js';
import { EnrollmentService } from './../src/enrollment/enrollment.service.js';
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

const USER = '00000000-0000-0000-0000-000000000000';

// สิทธิ์ของ DELETE /users/:id/face ใช้ RolesGuard ตัวจริง
describe('DELETE /users/:id/face (สิทธิ์)', () => {
  let app: INestApplication<App>;
  let calls: { id: string; withdraw: boolean }[];

  beforeEach(async () => {
    calls = [];
    const moduleRef = await Test.createTestingModule({
      controllers: [EnrollmentController],
      providers: [
        {
          provide: EnrollmentService,
          useValue: {
            reset: async (id: string, { withdraw = false } = {}) => {
              calls.push({ id, withdraw });
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

  it.each(['student', 'teacher'])('%s ได้ 403 และไม่ได้ลบอะไร', async (role) => {
    await request(app.getHttpServer())
      .delete(`/users/${USER}/face`)
      .set('x-role', role)
      .expect(403);
    expect(calls).toEqual([]);
  });

  it('แอดมินรีเซ็ตได้', async () => {
    await request(app.getHttpServer())
      .delete(`/users/${USER}/face`)
      .set('x-role', 'admin')
      .expect(200)
      .expect({ data: { reset: true, withdrawn: false } });
    expect(calls).toEqual([{ id: USER, withdraw: false }]);
  });

  it('ส่ง withdraw=1 ถอนความยินยอมด้วย', async () => {
    await request(app.getHttpServer())
      .delete(`/users/${USER}/face?withdraw=1`)
      .set('x-role', 'admin')
      .expect(200)
      .expect({ data: { reset: true, withdrawn: true } });
    expect(calls).toEqual([{ id: USER, withdraw: true }]);
  });
});
