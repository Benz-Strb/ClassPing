import { Body, Controller, Get, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { extractKnowledgeFile, KNOWLEDGE_FILE_LIMIT } from './knowledge-file.js';
import { Roles } from '../auth/auth.decorators.js';
import { AppError } from '../common/app-error.js';
import { CatalogService } from './catalog.service.js';

// หลักสูตรย้ายไปให้อาจารย์ดูแลที่ /teacher/curricula
function adminKind(kind: string) {
  if (kind === 'curricula') throw new AppError(403, 'FORBIDDEN', 'หลักสูตรให้อาจารย์เป็นผู้ดูแล');
  return kind;
}

@Controller('admin/catalog')
@Roles('admin')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Post('knowledge/extract')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: KNOWLEDGE_FILE_LIMIT, files: 1, fields: 0 }, defParamCharset: 'utf8' }))
  extract(@UploadedFile() file?: { originalname: string; buffer: Buffer }) { return extractKnowledgeFile(file); }
  @Get(':kind')
  list(@Param('kind') kind: string) { return this.catalog.list(adminKind(kind)); }
  @Post(':kind')
  create(@Param('kind') kind: string, @Body() body: unknown) { return this.catalog.create(adminKind(kind), body); }
  @Put(':kind/:id')
  update(@Param('kind') kind: string, @Param('id') id: string, @Body() body: unknown) { return this.catalog.update(adminKind(kind), id, body); }
  @Post(':kind/import')
  importCsv(@Param('kind') kind: string, @Body() body: unknown) { return this.catalog.importCsv(adminKind(kind), body); }
}
