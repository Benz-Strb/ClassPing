import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import type { Course, Rules } from './courses.repo.js';
import { CoursesService } from './courses.service.js';

@Controller('courses')
@Roles('teacher')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list(@CurrentUser() user: AppUser): Promise<Course[]> {
    return this.courses.listFor(user);
  }

  @Post()
  create(@CurrentUser() user: AppUser, @Body() body: unknown): Promise<Course> {
    return this.courses.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AppUser, @Param('id') id: string): Promise<Course> {
    return this.courses.getOwned(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<Course> {
    return this.courses.update(user, id, body);
  }

  @Get(':id/rules')
  getRules(@CurrentUser() user: AppUser, @Param('id') id: string): Promise<Rules> {
    return this.courses.getRules(user, id);
  }

  @Put(':id/rules')
  setRules(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<Rules> {
    return this.courses.setRules(user, id, body);
  }
}
