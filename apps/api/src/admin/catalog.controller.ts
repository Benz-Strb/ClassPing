import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
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
  @Get(':kind')
  list(@Param('kind') kind: string) { return this.catalog.list(adminKind(kind)); }
  @Post(':kind')
  create(@Param('kind') kind: string, @Body() body: unknown) { return this.catalog.create(adminKind(kind), body); }
  @Put(':kind/:id')
  update(@Param('kind') kind: string, @Param('id') id: string, @Body() body: unknown) { return this.catalog.update(adminKind(kind), id, body); }
  @Post(':kind/import')
  importCsv(@Param('kind') kind: string, @Body() body: unknown) { return this.catalog.importCsv(adminKind(kind), body); }
}
