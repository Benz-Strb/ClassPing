import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import { CatalogService } from './catalog.service.js';

// อาจารย์จัดการได้เฉพาะหลักสูตร ข้อมูลกลางและแหล่งความรู้ยังเป็นของแอดมิน
@Controller('teacher/curricula')
@Roles('teacher')
export class CurriculaController {
  constructor(private readonly catalog: CatalogService) {}
  @Get()
  list() { return this.catalog.list('curricula'); }
  @Post()
  create(@Body() body: unknown) { return this.catalog.create('curricula', body); }
  @Post('import')
  importCsv(@Body() body: unknown) { return this.catalog.importCsv('curricula', body); }
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) { return this.catalog.update('curricula', id, body); }
}
