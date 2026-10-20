import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import type { Course, Rules } from './courses.repo.js';
import { CoursesService } from './courses.service.js';
import { RosterService, type AddResult, type RosterEntry } from './roster.service.js';

@Controller('courses')
@Roles('teacher')
export class CoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly roster: RosterService,
  ) {}

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

  @Get(':id/students')
  students(@CurrentUser() user: AppUser, @Param('id') id: string): Promise<RosterEntry[]> {
    return this.roster.list(user, id);
  }

  @Post(':id/students')
  addStudents(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AddResult> {
    return this.roster.add(user, id, body);
  }

  @Delete(':id/students/:code')
  @HttpCode(200)
  async removeStudent(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Param('code') code: string,
  ): Promise<{ removed: string }> {
    await this.roster.remove(user, id, code);
    return { removed: code };
  }
}
