import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import type { Person } from './exams.repo.js';
import { ExamsService, type ExamView } from './exams.service.js';

@Controller()
@Roles('teacher')
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get('courses/:id/exams')
  list(@CurrentUser() user: AppUser, @Param('id') courseId: string): Promise<ExamView[]> {
    return this.exams.list(user, courseId);
  }

  @Post('courses/:id/exams')
  create(
    @CurrentUser() user: AppUser,
    @Param('id') courseId: string,
    @Body() body: unknown,
  ): Promise<ExamView> {
    return this.exams.create(user, courseId, body);
  }

  @Patch('exams/:id')
  update(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ExamView> {
    return this.exams.update(user, id, body);
  }

  @Delete('exams/:id')
  @HttpCode(200)
  async remove(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
  ): Promise<{ removed: string }> {
    await this.exams.remove(user, id);
    return { removed: id };
  }

  // อาจารย์ที่เคยเข้าสู่ระบบ ไว้เลือกเป็นคนคุมสอบ
  @Get('teachers')
  teachers(): Promise<Person[]> {
    return this.exams.listTeachers();
  }
}
