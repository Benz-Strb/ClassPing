import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { AppUser } from '../users/users.service.js';
import type { Role } from './role-from-email.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

// route ที่เปิดให้เรียกได้โดยไม่ต้อง login
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// จำกัดบทบาทที่เรียก route ได้ (แอดมินผ่านทุก route)
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AppUser =>
    ctx.switchToHttp().getRequest<{ user: AppUser }>().user,
);
