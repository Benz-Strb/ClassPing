import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import { DocumentUploadErrorsInterceptor } from '../enrollment/upload-errors.interceptor.js';
import type { AppUser } from '../users/users.service.js';
import { TransfersService } from './transfers.service.js';
import type { TransferFile } from './transfers.types.js';

@Controller('transfers')
@Roles('student', 'teacher')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}
  @Get('curricula') curricula(@CurrentUser() user: AppUser) {
    return this.transfers.curricula(user);
  }
  @Get('curricula/:id/document') curriculumDocument(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
  ) {
    return this.transfers.curriculumDocumentUrl(user, id);
  }
  @Get('requests') list(@CurrentUser() user: AppUser) {
    return this.transfers.list(user);
  }
  @Post('requests')
  @Roles('student')
  @UseInterceptors(
    DocumentUploadErrorsInterceptor,
    FileInterceptor('document', { limits: { fileSize: 10 * 1024 * 1024 }, defParamCharset: 'utf8' }),
  )
  submit(
    @CurrentUser() user: AppUser,
    @Body('payload') payload: unknown,
    @UploadedFile() file?: TransferFile,
  ) {
    return this.transfers.submit(user, payload, file);
  }
  @Get('requests/:id/documents/:kind')
  document(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Param('kind') kind: string,
  ) {
    return this.transfers.documentUrl(user, id, kind);
  }
  @Post('requests/:id/review')
  @Roles('teacher')
  @HttpCode(200)
  review(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.transfers.review(user, id, body);
  }
  @Post('curricula/:id/document')
  @Roles('teacher')
  @UseInterceptors(
    DocumentUploadErrorsInterceptor,
    FileInterceptor('document', { limits: { fileSize: 10 * 1024 * 1024 }, defParamCharset: 'utf8' }),
  )
  uploadCurriculum(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @UploadedFile() file?: TransferFile,
    @Body('payload') payload?: unknown,
  ) {
    return this.transfers.uploadCurriculum(user, id, file, payload);
  }
  @Post('preview')
  @UseInterceptors(DocumentUploadErrorsInterceptor, FileInterceptor('document', { limits: { fileSize: 10 * 1024 * 1024 }, defParamCharset: 'utf8' }))
  preview(@CurrentUser() user: AppUser, @UploadedFile() file?: TransferFile) { return this.transfers.preview(user, file); }
  @Post('curricula')
  @Roles('teacher')
  @UseInterceptors(DocumentUploadErrorsInterceptor, FileInterceptor('document', { limits: { fileSize: 10 * 1024 * 1024 }, defParamCharset: 'utf8' }))
  createCurriculum(@CurrentUser() user: AppUser, @Body('payload') payload: unknown, @UploadedFile() file?: TransferFile) { return this.transfers.createCurriculum(user, payload, file); }
  @Patch('requests/:id/curriculum')
  @Roles('teacher')
  assign(@CurrentUser() user: AppUser, @Param('id') id: string, @Body() body: unknown) { return this.transfers.assign(user, id, body); }
  @Get('mappings') @Roles('teacher') mappings(@CurrentUser() user: AppUser) {
    return this.transfers.mappings(user);
  }
  @Post('mappings') @Roles('teacher') saveMapping(
    @CurrentUser() user: AppUser,
    @Body() body: unknown,
  ) {
    return this.transfers.saveMapping(user, body);
  }
  @Patch('mappings/:id') @Roles('teacher') setMappingActive(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.transfers.setMappingActive(user, id, body);
  }
}
