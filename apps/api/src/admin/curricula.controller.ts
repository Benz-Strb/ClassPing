import { Body, Controller, Get, Inject, Injectable, Param, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { looksLike } from '../common/image-type.js';
import { writeOcrTextLog } from '../common/ocr-text-log.js';
import { UserLimitGuard } from '../common/user-limit.guard.js';
import { DocumentUploadErrorsInterceptor } from '../enrollment/upload-errors.interceptor.js';
import { LeaveOcrClient } from '../leave/leave-ocr.client.js';
import type { AppUser } from '../users/users.service.js';
import { CatalogService } from './catalog.service.js';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
type CurriculumFile = { buffer: Buffer; size: number; mimetype: string };

@Injectable()
class CurriculumOcrLimitGuard extends UserLimitGuard {
  constructor(@Inject(CLOCK) now: Clock) {
    super(10, 60_000, now);
  }
}

// อาจารย์จัดการได้เฉพาะหลักสูตร ข้อมูลกลางและแหล่งความรู้ยังเป็นของแอดมิน
@Controller('teacher/curricula')
@Roles('teacher')
export class CurriculaController {
  constructor(private readonly catalog: CatalogService, private readonly ocr: LeaveOcrClient) {}
  @Get()
  list() { return this.catalog.list('curricula'); }
  @Post()
  create(@Body() body: unknown) { return this.catalog.create('curricula', body); }
  @Post('import')
  importCsv(@Body() body: unknown) { return this.catalog.importCsv('curricula', body); }
  @Post('document/preview')
  @UseGuards(CurriculumOcrLimitGuard)
  @UseInterceptors(
    DocumentUploadErrorsInterceptor,
    FileInterceptor('document', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 0 } }),
  )
  async previewDocument(
    @CurrentUser() user: Pick<AppUser, 'id' | 'studentId' | 'fullName'>,
    @UploadedFile() file?: CurriculumFile,
  ) {
    if (!file || !file.size) throw new AppError(400, 'DOCUMENT_REQUIRED', 'กรุณาเลือกไฟล์หลักสูตร');
    if (file.size > MAX_DOCUMENT_BYTES || file.buffer.length > MAX_DOCUMENT_BYTES) {
      throw new AppError(413, 'DOCUMENT_SIZE', 'ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
    }
    const validType = file.mimetype === 'application/pdf'
      ? file.buffer.subarray(0, 5).toString() === '%PDF-'
      : ['image/jpeg', 'image/png'].includes(file.mimetype) && looksLike(file.mimetype, file.buffer);
    if (!validType) throw new AppError(400, 'DOCUMENT_TYPE', 'รองรับ PDF, JPG และ PNG เท่านั้น');

    const result = await this.ocr.readLeaveDocument(file.buffer, file.mimetype).catch((error: unknown) => {
      if (error instanceof AppError && error.getStatus() === 503) {
        throw new AppError(503, 'CURRICULUM_OCR_UNAVAILABLE', 'บริการอ่านเอกสารหลักสูตรยังไม่พร้อม กรุณาลองใหม่');
      }
      throw error;
    });
    const content = result.lines.map(({ text }) => text.trim()).filter(Boolean).join('\n');
    if (!content) throw new AppError(400, 'CURRICULUM_OCR_EMPTY', 'ไม่พบข้อความในไฟล์ กรุณาเลือกเอกสารที่อ่านได้ชัดขึ้น');
    if (content.length > 50_000) {
      throw new AppError(400, 'CURRICULUM_OCR_TOO_LONG', 'ข้อความเกิน 50,000 ตัวอักษร กรุณาเลือกเฉพาะหน้าที่ต้องการ');
    }
    await writeOcrTextLog(user, 'หลักสูตร', content);
    return { content };
  }
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) { return this.catalog.update('curricula', id, body); }
}
