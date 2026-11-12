import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import { DocumentUploadErrorsInterceptor } from '../enrollment/upload-errors.interceptor.js';
import type { AppUser } from '../users/users.service.js';
import { TimetablePreviewLimitGuard } from './timetable-limit.guard.js';
import { TimetablesService, type TimetableFile } from './timetables.service.js';

@Controller()
export class TimetablesController {
  constructor(private readonly timetables: TimetablesService) {}

  @Get('me/timetable')
  @Roles('student')
  saved(@CurrentUser() user: AppUser) {
    return this.timetables.saved(user);
  }

  @Put('me/timetable')
  @Roles('student')
  save(@CurrentUser() user: AppUser, @Body() body: unknown) {
    return this.timetables.save(user, body);
  }

  @Post('courses/:id/timetable/preview')
  @Roles('teacher', 'admin')
  @UseGuards(TimetablePreviewLimitGuard)
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
  @UseGuards(TimetablePreviewLimitGuard)
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
  @Post('me/timetable/verify-owner')
  @Roles('student')
  verifyOwner(@CurrentUser() user: AppUser, @Body() body: unknown) {
    return this.timetables.verifyOwner(user, body);
  }
  @Post('me/timetable/enroll')
  @Roles('student')
  enroll(@CurrentUser() user: AppUser, @Body() body: unknown) {
    return this.timetables.enroll(user, body);
  }
}
