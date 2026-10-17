import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';
import { UsersService } from '../users/users.service.js';
import { IS_PUBLIC_KEY } from './auth.decorators.js';
import { classifyEmail } from './role-from-email.js';

interface AuthRequest {
  headers: Record<string, string | undefined>;
  user?: unknown;
}

const unauthorized = () =>
  new AppError(401, 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบใหม่');
const unavailable = () =>
  new AppError(503, 'DB_UNAVAILABLE', 'ระบบยืนยันตัวตนไม่พร้อมใช้งาน ลองใหม่อีกครั้ง');

// ตรวจ access token ของ Supabase ที่เว็บ/แอปส่งมา แล้วผูกผู้ใช้กับ request
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    const authUser = await this.verify(token);
    if (!classifyEmail(authUser.email ?? '', this.config.adminEmails)) {
      throw new AppError(403, 'DOMAIN_NOT_ALLOWED', 'ใช้ได้เฉพาะเมล @dpu.ac.th');
    }

    const meta = authUser.user_metadata as { full_name?: string; name?: string };
    req.user = await this.users.ensureUser({
      id: authUser.id,
      email: authUser.email!,
      fullName: meta.full_name ?? meta.name ?? null,
    });
    return true;
  }

  private async verify(token: string): Promise<User> {
    let result: Awaited<ReturnType<SupabaseClient['auth']['getUser']>>;
    try {
      result = await this.db.auth.getUser(token);
    } catch {
      throw unavailable();
    }

    const { data, error } = result;
    if (error) {
      // ต่อเซิร์ฟเวอร์ไม่ได้ (เช่นโปรเจกต์ถูกพัก) ต่างจาก token ใช้ไม่ได้
      const status = (error as { status?: number }).status ?? 0;
      if (error.name === 'AuthRetryableFetchError' || status === 0 || status >= 500) {
        throw unavailable();
      }
      throw unauthorized();
    }
    if (!data.user?.email) throw unauthorized();
    return data.user;
  }
}
