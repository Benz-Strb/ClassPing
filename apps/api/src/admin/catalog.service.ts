import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error.js';
import { parseBody } from '../common/validate.js';
import { parseCsv, MAX_CSV_BYTES } from './catalog.csv.js';
import { CATALOG_REPO, type CatalogInput, type CatalogKind, type CatalogRepo } from './catalog.repo.js';

const kindSchema = z.enum(['curricula', 'reference', 'knowledge']);
const code = z.string().trim().min(1, 'กรุณาใส่รหัส').max(60).transform((s) => s.toUpperCase());
const name = z.string().trim().min(1, 'กรุณาใส่ชื่อ').max(200);
const content = z.string().trim().max(50_000, 'เนื้อหาต้องไม่เกิน 50,000 ตัวอักษร').default('');
const active = z.boolean().default(true);
const schemas = {
  curricula: z.object({ code, name, year: z.number().int().min(1900).max(3000), content, active }).strict(),
  reference: z.object({ code, name, category: z.string().trim().min(1, 'กรุณาใส่หมวดข้อมูล').max(100), content, active }).strict(),
  knowledge: z.object({ name, url: z.union([z.literal(''), z.url().max(2000).refine((s) => /^https?:\/\//i.test(s), 'URL ต้องขึ้นต้นด้วย http:// หรือ https://')]).default(''), content: z.string().trim().min(1, 'กรุณาใส่เนื้อหาความรู้').max(50_000), active }).strict(),
};
const HEADERS = {
  curricula: ['code', 'name', 'year', 'content', 'active'],
  reference: ['code', 'name', 'category', 'content', 'active'],
};

@Injectable()
export class CatalogService {
  constructor(@Inject(CATALOG_REPO) private readonly repo: CatalogRepo) {}

  async list(kind: string) { return this.repo.list(parseBody(kindSchema, kind)); }

  private input(kind: CatalogKind, body: unknown): CatalogInput {
    const value = parseBody(schemas[kind] as z.ZodType<Record<string, unknown>>, body);
    return { code: null, category: null, year: null, url: null, ...value, ...('url' in value ? { url: value.url || null } : {}) } as CatalogInput;
  }

  async create(kindValue: string, body: unknown) {
    const kind = parseBody(kindSchema, kindValue);
    return (await this.repo.insert(kind, [this.input(kind, body)]))[0];
  }

  async update(kindValue: string, idValue: string, body: unknown) {
    const kind = parseBody(kindSchema, kindValue);
    const id = parseBody(z.uuid(), idValue);
    const entry = await this.repo.update(kind, id, this.input(kind, body));
    if (!entry) throw new AppError(404, 'CATALOG_NOT_FOUND', 'ไม่พบรายการนี้');
    return entry;
  }

  async importCsv(kindValue: string, body: unknown) {
    const kind = parseBody(z.enum(['curricula', 'reference']), kindValue);
    const { csv } = parseBody(z.object({ csv: z.string().max(MAX_CSV_BYTES) }).strict(), body);
    const [headers, ...rows] = parseCsv(csv);
    const expected = HEADERS[kind];
    const required = expected.slice(0, 3);
    if (!headers || new Set(headers).size !== headers.length || headers.some((h) => !expected.includes(h)) || required.some((h) => !headers.includes(h))) {
      throw new AppError(400, 'INVALID_CSV', `หัวตารางต้องมี ${required.join(',')} และใช้ได้เฉพาะ ${expected.join(',')}`);
    }
    if (!rows.length) throw new AppError(400, 'INVALID_CSV', 'CSV ต้องมีข้อมูลอย่างน้อย 1 รายการ');
    const keys = new Set<string>();
    const inputs = rows.map((row, i) => {
      try {
        if (row.length !== headers.length) throw new Error('จำนวนช่องไม่ตรงกับหัวตาราง');
        const raw: Record<string, unknown> = Object.fromEntries(headers.map((h, j) => [h, row[j]]));
        if ('year' in raw) raw.year = Number(raw.year);
        if ('active' in raw) {
          if (raw.active !== 'true' && raw.active !== 'false') throw new Error('active ต้องเป็น true หรือ false');
          raw.active = raw.active === 'true';
        }
        const input = this.input(kind, raw);
        if (keys.has(input.code!)) throw new Error(`รหัส ${input.code} ซ้ำในไฟล์`);
        keys.add(input.code!);
        return input;
      } catch (error) {
        throw new AppError(400, 'INVALID_CSV', `CSV แถวข้อมูล ${i + 2}: ${error instanceof Error ? error.message : 'ข้อมูลไม่ถูกต้อง'}`);
      }
    });
    await this.repo.insert(kind, inputs);
    return { imported: inputs.length };
  }
}
