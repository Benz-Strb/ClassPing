import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../common/app-error.js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export type CatalogKind = 'curricula' | 'reference' | 'knowledge';
export interface CatalogInput {
  code: string | null;
  name: string;
  year: number | null;
  category: string | null;
  url: string | null;
  content: string;
  active: boolean;
}
export interface CatalogEntry extends CatalogInput { id: string; kind: CatalogKind }
export interface CatalogRepo {
  list(kind: CatalogKind): Promise<CatalogEntry[]>;
  insert(kind: CatalogKind, rows: CatalogInput[]): Promise<CatalogEntry[]>;
  update(kind: CatalogKind, id: string, row: CatalogInput): Promise<CatalogEntry | null>;
}
export const CATALOG_REPO = Symbol('CATALOG_REPO');
const COLUMNS = 'id,kind,code,name,year,category,url,content,active';
function writeError(error: { code?: string }) {
  if (error.code === '23505') return new AppError(409, 'CATALOG_EXISTS', 'มีรหัสนี้แล้ว ไม่มีรายการจากคำขอนี้ถูกบันทึก');
  return dbError();
}

@Injectable()
export class SupabaseCatalogRepo implements CatalogRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async list(kind: CatalogKind): Promise<CatalogEntry[]> {
    const entries: CatalogEntry[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.db.from('admin_catalog').select(COLUMNS).eq('kind', kind).order('id').range(offset, offset + 499);
      if (error) throw dbError();
      entries.push(...(data as CatalogEntry[]));
      if (data.length < 500) return entries.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    }
  }

  async insert(kind: CatalogKind, rows: CatalogInput[]): Promise<CatalogEntry[]> {
    // A single INSERT is atomic, including conflicts against existing codes.
    const { data, error } = await this.db.from('admin_catalog').insert(rows.map((row) => ({ ...row, kind }))).select(COLUMNS);
    if (error) throw writeError(error);
    return data as CatalogEntry[];
  }

  async update(kind: CatalogKind, id: string, row: CatalogInput): Promise<CatalogEntry | null> {
    const { data, error } = await this.db.from('admin_catalog').update({ ...row, updated_at: new Date().toISOString() }).eq('kind', kind).eq('id', id).select(COLUMNS).maybeSingle();
    if (error) throw writeError(error);
    return data as CatalogEntry | null;
  }
}
