import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { SessionsService, type SessionView } from './sessions.service.js';

@Controller()
@Roles('teacher')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('courses/:id/sessions')
  list(
    @CurrentUser() user: AppUser,
    @Param('id') courseId: string,
    @Query('from') from = '',
    @Query('to') to = '',
  ): Promise<SessionView[]> {
    return this.sessions.listForCourse(user, courseId, String(from), String(to));
  }
}
