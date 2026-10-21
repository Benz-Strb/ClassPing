import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { EnrollmentService, type FaceStatus } from './enrollment.service.js';

@Controller()
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Post('me/consent')
  @HttpCode(200)
  consent(@CurrentUser() user: AppUser): Promise<AppUser> {
    return this.enrollment.consent(user);
  }

  @Get('me/face')
  status(@CurrentUser() user: AppUser): Promise<FaceStatus> {
    return this.enrollment.status(user);
  }

  @Delete('users/:id/face')
  @Roles('admin')
  @HttpCode(200)
  async reset(@Param('id') id: string): Promise<{ reset: true }> {
    await this.enrollment.reset(id);
    return { reset: true };
  }
}
