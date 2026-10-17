import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/config.js';
import type { AppUser, UsersService } from '../users/users.service.js';
import { AuthGuard } from './auth.guard.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators.js';
import { RolesGuard } from './roles.guard.js';

const student: AppUser = {
  id: 'u1',
  email: '66112106@dpu.ac.th',
  fullName: null,
  role: 'student',
  studentId: '66112106',
  pdpaConsentAt: null,
};

function context(req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function reflector(meta: Record<string, unknown> = {}): Reflector {
  return {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;
}

function db(getUser: () => Promise<unknown>): SupabaseClient {
  return { auth: { getUser } } as unknown as SupabaseClient;
}

const users = {
  ensureUser: async () => student,
} as unknown as UsersService;

const config = { adminEmails: [] } as unknown as AppConfig;

const okUser = (email: string) => async () => ({
  data: { user: { id: 'u1', email, user_metadata: {} } },
  error: null,
});

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const e = error as { getStatus(): number; code: string };
    return { status: e.getStatus(), code: e.code };
  }
  throw new Error('คาดว่าจะ throw แต่ไม่ throw');
}

describe('AuthGuard', () => {
  it('ไม่มี Authorization ได้ 401 UNAUTHORIZED', async () => {
    const guard = new AuthGuard(reflector(), db(okUser('66112106@dpu.ac.th')), config, users);
    expect(await rejection(guard.canActivate(context({ headers: {} })))).toEqual({
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('token หมดอายุหรือปลอมได้ 401 ไม่ใช่ 500', async () => {
    const guard = new AuthGuard(
      reflector(),
      db(async () => ({ data: { user: null }, error: { name: 'AuthApiError', status: 401 } })),
      config,
      users,
    );
    expect(
      await rejection(guard.canActivate(context({ headers: { authorization: 'Bearer bad' } }))),
    ).toEqual({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('เมลไม่ใช่ @dpu.ac.th ได้ 403 DOMAIN_NOT_ALLOWED', async () => {
    const guard = new AuthGuard(reflector(), db(okUser('me@gmail.com')), config, users);
    expect(
      await rejection(guard.canActivate(context({ headers: { authorization: 'Bearer t' } }))),
    ).toEqual({ status: 403, code: 'DOMAIN_NOT_ALLOWED' });
  });

  it('token ถูกต้อง ใส่ AppUser ลงใน request.user', async () => {
    const req: Record<string, unknown> = { headers: { authorization: 'Bearer t' } };
    const guard = new AuthGuard(reflector(), db(okUser('66112106@dpu.ac.th')), config, users);
    expect(await guard.canActivate(context(req))).toBe(true);
    expect(req.user).toEqual(student);
  });

  it('route ที่ติด @Public() ผ่านได้โดยไม่มี token', async () => {
    const guard = new AuthGuard(
      reflector({ [IS_PUBLIC_KEY]: true }),
      db(okUser('x')),
      config,
      users,
    );
    expect(await guard.canActivate(context({ headers: {} }))).toBe(true);
  });

  it('ต่อ Supabase ไม่ได้ ได้ 503 DB_UNAVAILABLE', async () => {
    const guard = new AuthGuard(
      reflector(),
      db(async () => ({
        data: { user: null },
        error: { name: 'AuthRetryableFetchError', status: 0 },
      })),
      config,
      users,
    );
    expect(
      await rejection(guard.canActivate(context({ headers: { authorization: 'Bearer t' } }))),
    ).toEqual({ status: 503, code: 'DB_UNAVAILABLE' });
  });

  it('getUser throw ออกมาตรง ๆ ก็ได้ 503 DB_UNAVAILABLE', async () => {
    const guard = new AuthGuard(
      reflector(),
      db(async () => {
        throw new TypeError('fetch failed');
      }),
      config,
      users,
    );
    expect(
      await rejection(guard.canActivate(context({ headers: { authorization: 'Bearer t' } }))),
    ).toEqual({ status: 503, code: 'DB_UNAVAILABLE' });
  });
});

describe('RolesGuard', () => {
  it('route ต้องการ teacher แต่ผู้ใช้เป็น student ได้ 403 FORBIDDEN', () => {
    const guard = new RolesGuard(reflector({ [ROLES_KEY]: ['teacher'] }));
    expect(() => guard.canActivate(context({ user: student }))).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('admin ผ่าน route ที่ต้องการ teacher ได้', () => {
    const guard = new RolesGuard(reflector({ [ROLES_KEY]: ['teacher'] }));
    expect(guard.canActivate(context({ user: { ...student, role: 'admin' } }))).toBe(true);
  });

  it('route ที่ไม่ได้กำหนดบทบาท ผ่านได้ทุกคนที่ login แล้ว', () => {
    const guard = new RolesGuard(reflector());
    expect(guard.canActivate(context({ user: student }))).toBe(true);
  });
});
