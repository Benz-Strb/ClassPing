import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import { CatalogService } from './catalog.service.js';

@Controller('admin/catalog')
@Roles('admin')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get(':kind')
  list(@Param('kind') kind: string) { return this.catalog.list(kind); }
  @Post(':kind')
  create(@Param('kind') kind: string, @Body() body: unknown) { return this.catalog.create(kind, body); }
  @Put(':kind/:id')
  update(@Param('kind') kind: string, @Param('id') id: string, @Body() body: unknown) { return this.catalog.update(kind, id, body); }
  @Post(':kind/import')
  importCsv(@Param('kind') kind: string, @Body() body: unknown) { return this.catalog.importCsv(kind, body); }
}
