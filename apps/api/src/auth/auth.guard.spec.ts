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
  identityVerifiedAt: null,
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

// รูปร่างเหมือนข้อมูลจริงที่ Supabase คืนมาหลัง login ด้วย Google Workspace
const googleIdentity = (email: string, identityData: Record<string, unknown> = {}) => ({
  provider: 'google',
  identity_data: {
    email,
    email_verified: true,
    full_name: 'ณัฐวุฒิ',
    custom_claims: { hd: email.split('@')[1] },
    ...identityData,
  },
});

const googleUser = (email: string, extra: Record<string, unknown> = {}) => ({
  id: 'u1',
  email,
  email_confirmed_at: '2026-10-17T00:00:00Z',
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: {},
  identities: [googleIdentity(email)],
  ...extra,
});

function recordingUsers() {
  const calls: unknown[] = [];
  const service = {
    ensureUser: async (input: unknown) => {
      calls.push(input);
      return student;
    },
  } as unknown as UsersService;
  return { service, calls };
}

const okUser = (email: string) => async () => ({
  data: { user: googleUser(email) },
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

  it('bearer ตัวพิมพ์เล็กก็ผ่าน', async () => {
    const req: Record<string, unknown> = { headers: { authorization: 'bearer t' } };
    const guard = new AuthGuard(reflector(), db(okUser('66112106@dpu.ac.th')), config, users);
    expect(await guard.canActivate(context(req))).toBe(true);
  });

  it('scheme อื่นได้ 401', async () => {
    const guard = new AuthGuard(reflector(), db(okUser('66112106@dpu.ac.th')), config, users);
    expect(
      await rejection(guard.canActivate(context({ headers: { authorization: 'Basic t' } }))),
    ).toMatchObject({ status: 401 });
  });

  it('บัญชีที่สมัครด้วยรหัสผ่าน (ไม่ใช่ Google) ได้ 403 แม้เมลจะเป็น @dpu.ac.th', async () => {
    const guard = new AuthGuard(
      reflector(),
      db(async () => ({
        data: {
          user: googleUser('66112106@dpu.ac.th', {
            app_metadata: { provider: 'email', providers: ['email'] },
            identities: [{ provider: 'email', identity_data: { email: '66112106@dpu.ac.th' } }],
          }),
        },
        error: null,
      })),
      config,
      users,
    );
    expect(
      await rejection(guard.canActivate(context({ headers: { authorization: 'Bearer t' } }))),
    ).toEqual({ status: 403, code: 'PROVIDER_NOT_ALLOWED' });
  });

  it('เมลใน Google identity ที่ Google ยังไม่ยืนยันได้ 403', async () => {
    const guard = new AuthGuard(
      reflector(),
      db(async () => ({
        data: {
          user: googleUser('66112106@dpu.ac.th', {
            identities: [googleIdentity('66112106@dpu.ac.th', { email_verified: false })],
          }),
        },
        error: null,
      })),
      config,
      users,
    );
    expect(
      await rejection(guard.canActivate(context({ headers: { authorization: 'Bearer t' } }))),
    ).toEqual({ status: 403, code: 'PROVIDER_NOT_ALLOWED' });
  });

  it('เปลี่ยนเมลบัญชีเป็นเมลแอดมินด้วย updateUser ไม่ได้สิทธิ์ เพราะเชื่อเมลจาก Google เท่านั้น', async () => {
    const { service, calls } = recordingUsers();
    const guard = new AuthGuard(
      reflector(),
      db(async () => ({
        data: {
          user: googleUser('somsak.kit@dpu.ac.th', {
            identities: [googleIdentity('attacker@gmail.com')],
          }),
        },
        error: null,
      })),
      { adminEmails: ['somsak.kit@dpu.ac.th'] } as unknown as AppConfig,
      service,
    );
    expect(
      await rejection(guard.canActivate(context({ headers: { authorization: 'Bearer t' } }))),
    ).toEqual({ status: 403, code: 'DOMAIN_NOT_ALLOWED' });
    expect(calls).toEqual([]);
  });

  it('บัญชี Google ที่ไม่ได้อยู่ใน Workspace ของ dpu.ac.th (ไม่มี hd) ได้ 403', async () => {
    const guard = new AuthGuard(
      reflector(),
      db(async () => ({
        data: {
          user: googleUser('66112106@dpu.ac.th', {
            identities: [googleIdentity('66112106@dpu.ac.th', { custom_claims: {} })],
          }),
        },
        error: null,
      })),
      config,
      users,
    );
    expect(
      await rejection(guard.canActivate(context({ headers: { authorization: 'Bearer t' } }))),
    ).toEqual({ status: 403, code: 'DOMAIN_NOT_ALLOWED' });
  });

  it('ส่งเมลและชื่อจาก Google identity ไปให้ ensureUser', async () => {
    const { service, calls } = recordingUsers();
    const guard = new AuthGuard(
      reflector(),
      db(okUser('66112106@dpu.ac.th')),
      config,
      service,
    );
    await guard.canActivate(context({ headers: { authorization: 'Bearer t' } }));
    expect(calls).toEqual([{ id: 'u1', email: '66112106@dpu.ac.th', fullName: 'ณัฐวุฒิ' }]);
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
