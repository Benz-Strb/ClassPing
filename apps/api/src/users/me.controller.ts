import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Public } from '../auth/auth.decorators.js';
import type { AppUser } from './users.service.js';

@Controller()
export class MeController {
  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AppUser): AppUser {
    return user;
  }
}
