import type { z } from 'zod';
import { AppError } from './app-error.js';

const GENERIC = 'ข้อมูลที่ส่งมาไม่ถูกต้อง';

// ช่องไหนไม่ได้ตั้งข้อความไว้ ใช้ GENERIC แทนข้อความอังกฤษของ zod
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body, { error: () => GENERIC });
  if (!result.success) {
    throw new AppError(400, 'BAD_REQUEST', result.error.issues[0]?.message ?? GENERIC);
  }
  return result.data;
}
