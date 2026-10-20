import type { z } from 'zod';
import { AppError } from './app-error.js';

const GENERIC = 'ข้อมูลที่ส่งมาไม่ถูกต้อง';

// ตรวจ body ที่ส่งเข้ามา ไม่ผ่านได้ 400 พร้อมข้อความไทยของช่องแรกที่ผิด
// ช่องที่ schema ไม่ได้กำหนดข้อความเองจะได้ข้อความกลาง ไม่หลุดข้อความอังกฤษของ zod ไปหาผู้ใช้
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body, { error: () => GENERIC });
  if (!result.success) {
    throw new AppError(400, 'BAD_REQUEST', result.error.issues[0]?.message ?? GENERIC);
  }
  return result.data;
}
