import { Test } from '@nestjs/testing';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RolesGuard } from './../src/auth/roles.guard.js';
import { EnvelopeInterceptor } from './../src/common/envelope.interceptor.js';
import { HttpExceptionFilter } from './../src/common/http-exception.filter.js';
import { ExamsController } from './../src/exams/exams.controller.js';
import { ExamsService } from './../src/exams/exams.service.js';

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

const COURSE = '00000000-0000-0000-0000-000000000000';

// สิทธิ์ของ route คาบสอบใช้ RolesGuard ตัวจริง
describe('คาบสอบ (สิทธิ์)', () => {
  let app: INestApplication<App>;
  let calls: string[];

  beforeEach(async () => {
    calls = [];
    const moduleRef = await Test.createTestingModule({
      controllers: [ExamsController],
      providers: [
        {
          provide: ExamsService,
          useValue: {
            list: async () => {
              calls.push('list');
              return [];
            },
            create: async () => {
              calls.push('create');
              return {};
            },
            listTeachers: async () => {
              calls.push('teachers');
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

  it('นักศึกษาได้ 403 ทั้งดูคาบสอบ สร้าง และดูรายชื่ออาจารย์', async () => {
    const server = app.getHttpServer();
    await request(server).get(`/courses/${COURSE}/exams`).set('x-role', 'student').expect(403);
    await request(server).post(`/courses/${COURSE}/exams`).set('x-role', 'student').expect(403);
    await request(server).get('/teachers').set('x-role', 'student').expect(403);
    expect(calls).toEqual([]);
  });

  it.each(['teacher', 'admin'])('%s เรียกได้', async (role) => {
    const server = app.getHttpServer();
    await request(server).get(`/courses/${COURSE}/exams`).set('x-role', role).expect(200);
    await request(server).get('/teachers').set('x-role', role).expect(200);
    expect(calls).toEqual(['list', 'teachers']);
  });
});
