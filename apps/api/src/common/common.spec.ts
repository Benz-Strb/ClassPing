import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AppError } from './app-error.js';
import { EnvelopeInterceptor } from './envelope.interceptor.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function fakeHost() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('EnvelopeInterceptor', () => {
  it('ห่อผลสำเร็จเป็น { data }', async () => {
    const result = await lastValueFrom(
      new EnvelopeInterceptor().intercept({} as never, {
        handle: () => of({ ok: true }),
      }),
    );
    expect(result).toEqual({ data: { ok: true } });
  });
});

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('AppError กลายเป็น { error: { code, message } } พร้อม status', () => {
    const { host, res } = fakeHost();
    filter.catch(new AppError(503, 'DB_UNAVAILABLE', 'ต่อฐานข้อมูลไม่ได้'), host);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: { code: 'DB_UNAVAILABLE', message: 'ต่อฐานข้อมูลไม่ได้' },
    });
  });

  it('HttpException ของ Nest ได้ code ตาม status', () => {
    const { host, res } = fakeHost();
    filter.catch(new NotFoundException('ไม่พบ'), host);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'ไม่พบ' } });
  });

  it('error ที่ไม่รู้จักเป็น 500 INTERNAL และไม่ส่งรายละเอียดภายในออกไป', () => {
    const { host, res } = fakeHost();
    filter.catch(new Error('secret stack detail'), host);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL', message: 'เกิดข้อผิดพลาดภายในระบบ' },
    });
  });
});
