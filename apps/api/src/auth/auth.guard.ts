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

interface GoogleIdentityData {
  email?: string;
  email_verified?: boolean;
  full_name?: string;
  name?: string;
  custom_claims?: { hd?: string };
}

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
    const google = this.googleIdentity(authUser);

    req.user = await this.users.ensureUser({
      id: authUser.id,
      email: google.email,
      fullName: google.full_name ?? google.name ?? null,
    });
    return true;
  }

  // เชื่อเมลจากข้อมูลที่ Google ยืนยันมาเท่านั้น ไม่ใช้ authUser.email
  // เพราะผู้ใช้เปลี่ยนเองได้ด้วย updateUser และกันคนสมัครด้วยรหัสผ่านโดยใช้เมลคนอื่น
  private googleIdentity(authUser: User): GoogleIdentityData & { email: string } {
    const data = authUser.identities?.find((i) => i.provider === 'google')
      ?.identity_data as GoogleIdentityData | undefined;
    if (!data?.email || data.email_verified !== true) {
      throw new AppError(
        403,
        'PROVIDER_NOT_ALLOWED',
        'กรุณาเข้าสู่ระบบด้วยบัญชี Google ของมหาวิทยาลัย',
      );
    }

    // hd มาจาก Google เฉพาะบัญชีใน Workspace ของมหาลัย
    if (
      data.custom_claims?.hd !== 'dpu.ac.th' ||
      !classifyEmail(data.email, this.config.adminEmails)
    ) {
      throw new AppError(403, 'DOMAIN_NOT_ALLOWED', 'ใช้ได้เฉพาะเมล @dpu.ac.th');
    }
    return { ...data, email: data.email };
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
