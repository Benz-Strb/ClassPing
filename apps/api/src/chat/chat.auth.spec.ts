import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ChatController } from './chat.controller.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/config.js';
import type { UsersService } from '../users/users.service.js';

function context(method: keyof ChatController, role?: string): ExecutionContext {
  return {
    getHandler: () => ChatController.prototype[method], getClass: () => ChatController,
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, user: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext;
}
describe('chat routes and actual global guards', () => {
  const reflector = new Reflector();
  const auth = new AuthGuard(reflector, {} as SupabaseClient, {} as AppConfig, {} as UsersService);
  const roles = new RolesGuard(reflector);
  it('public is anonymous while student/ingestion/deletion require a token', async () => {
    expect(await auth.canActivate(context('publicAsk'))).toBe(true);
    for (const method of ['studentAsk', 'ingest', 'remove'] as const) {
      await expect(auth.canActivate(context(method))).rejects.toThrow('กรุณาเข้าสู่ระบบ');
    }
  });
  it('only admin may ingest or delete knowledge', () => {
    for (const method of ['ingest', 'remove'] as const) {
      expect(() => roles.canActivate(context(method, 'student'))).toThrow();
      expect(() => roles.canActivate(context(method, 'teacher'))).toThrow();
      expect(roles.canActivate(context(method, 'admin'))).toBe(true);
    }
  });
});
