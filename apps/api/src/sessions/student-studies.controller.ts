import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { StudentStudiesService } from './student-studies.service.js';

@Controller('me/studies')
@Roles('student')
export class StudentStudiesController {
  constructor(private readonly studies: StudentStudiesService) {}

  @Get()
  get(@CurrentUser() user: AppUser) {
    return this.studies.get(user);
  }
}
