import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import type { Override, Schedule } from './schedules.repo.js';
import { SchedulesService } from './schedules.service.js';

@Controller()
@Roles('teacher')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get('courses/:id/schedules')
  list(@CurrentUser() user: AppUser, @Param('id') courseId: string): Promise<Schedule[]> {
    return this.schedules.list(user, courseId);
  }

  @Post('courses/:id/schedules')
  create(
    @CurrentUser() user: AppUser,
    @Param('id') courseId: string,
    @Body() body: unknown,
  ): Promise<Schedule> {
    return this.schedules.create(user, courseId, body);
  }

  @Patch('schedules/:id')
  update(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<Schedule> {
    return this.schedules.update(user, id, body);
  }

  @Delete('schedules/:id')
  @HttpCode(200)
  async remove(@CurrentUser() user: AppUser, @Param('id') id: string): Promise<{ removed: string }> {
    await this.schedules.remove(user, id);
    return { removed: id };
  }

  @Get('courses/:id/overrides')
  listOverrides(
    @CurrentUser() user: AppUser,
    @Param('id') courseId: string,
    @Query('from') from = '',
    @Query('to') to = '',
  ): Promise<Override[]> {
    return this.schedules.listOverrides(user, courseId, String(from), String(to));
  }

  @Put('schedules/:id/overrides/:date')
  setOverride(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Param('date') date: string,
    @Body() body: unknown,
  ): Promise<Override> {
    return this.schedules.setOverride(user, id, date, body);
  }

  @Delete('schedules/:id/overrides/:date')
  @HttpCode(200)
  async clearOverride(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Param('date') date: string,
  ): Promise<{ removed: string }> {
    await this.schedules.clearOverride(user, id, date);
    return { removed: date };
  }
}
