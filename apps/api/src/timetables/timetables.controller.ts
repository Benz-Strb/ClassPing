import {
  Body,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import { DocumentUploadErrorsInterceptor } from '../enrollment/upload-errors.interceptor.js';
import type { AppUser } from '../users/users.service.js';
import { TimetablesService, type TimetableFile } from './timetables.service.js';

@Controller()
export class TimetablesController {
  constructor(private readonly timetables: TimetablesService) {}

  @Post('courses/:id/timetable/preview')
  @Roles('teacher', 'admin')
  @UseInterceptors(
    DocumentUploadErrorsInterceptor,
    FileInterceptor('document', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
      defParamCharset: 'utf8',
    }),
  )
  previewCourse(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @UploadedFile() file?: TimetableFile,
  ) {
    return this.timetables.preview(user, file, id);
  }
  @Post('courses/:id/timetable/import')
  @Roles('teacher', 'admin')
  importCourse(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.timetables.importCourse(user, id, body);
  }
  @Post('me/timetable/preview')
  @Roles('student')
  @UseInterceptors(
    DocumentUploadErrorsInterceptor,
    FileInterceptor('document', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
      defParamCharset: 'utf8',
    }),
  )
  previewStudent(
    @CurrentUser() user: AppUser,
    @UploadedFile() file?: TimetableFile,
  ) {
    return this.timetables.preview(user, file);
  }
  @Post('me/timetable/matches')
  @Roles('student')
  matches(@CurrentUser() user: AppUser, @Body() body: unknown) {
    return this.timetables.matches(user, body);
  }
  @Post('me/timetable/enroll')
  @Roles('student')
  enroll(@CurrentUser() user: AppUser, @Body() body: unknown) {
    return this.timetables.enroll(user, body);
  }
}
