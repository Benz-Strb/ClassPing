import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error.js';
import type { AppUser } from '../users/users.service.js';
import { ROLES_KEY } from './auth.decorators.js';
import type { Role } from './role-from-email.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const user = context.switchToHttp().getRequest<{ user?: AppUser }>().user;
    if (user && (user.role === 'admin' || roles.includes(user.role))) return true;

    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ใช้งานส่วนนี้');
  }
}
