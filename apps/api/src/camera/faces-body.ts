import { z } from 'zod';
import { AppError } from '../common/app-error.js';
import { looksLike } from '../common/image-type.js';
import type { DetectResult } from '../face/face.client.js';

export const MAX_FACES = 50;
export const EMBEDDING_SIZE = 512;
const MAX_CROP_BYTES = 64 * 1024;
const NORM_MIN = 0.99;
const NORM_MAX = 1.01;

const MESSAGE = 'ผลหน้าจากบอร์ดไม่ถูกต้อง';

const face = z.object({
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  detScore: z.number().min(0).max(1),
  embedding: z.array(z.number()).length(EMBEDDING_SIZE),
  liveness: z.number().min(0).max(1).nullable(),
  crop: z.string().nullable(),
});

// ISO พร้อม timezone ถ้าไม่ใช่ถือว่าไม่มี ไม่ปฏิเสธทั้งเฟรม
const capturedAt = z.string().datetime({ offset: true }).optional().catch(undefined);

const schema = z.object({
  // เวลาที่บอร์ดจับภาพ แค่รับไว้ ไม่ใช้เป็นเวลาที่เห็นหน้า
  capturedAt: capturedAt,
  model: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  skippedSmall: z.number().int().min(0).default(0),
  faces: z.array(face).max(MAX_FACES),
});

function invalid(): never {
  throw new AppError(400, 'INVALID_FACES', MESSAGE);
}

// ตรวจผลหน้าที่บอร์ดคำนวณมาแล้ว แล้วแปลงเป็นรูปเดียวกับที่ face service คืน
export function parseFacesBody(body: unknown, model: string): DetectResult {
  const parsed = schema.safeParse(body);
  if (!parsed.success) invalid();
  const data = parsed.data;
  if (data.model !== model) {
    throw new AppError(400, 'INVALID_FACES', 'โมเดลของบอร์ดไม่ตรงกับที่ระบบใช้');
  }

  const faces = data.faces.map((f) => {
    const [x1, y1, x2, y2] = f.bbox;
    if (!(x1 >= 0 && y1 >= 0 && x2 > x1 && y2 > y1 && x2 <= data.width && y2 <= data.height)) {
      invalid();
    }
    if (!f.embedding.every(Number.isFinite)) invalid();
    const norm = Math.sqrt(f.embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm < NORM_MIN || norm > NORM_MAX) invalid();

    if (f.crop !== null) {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(f.crop)) invalid();
      const bytes = Buffer.from(f.crop, 'base64');
      if (bytes.length > MAX_CROP_BYTES || !looksLike('image/jpeg', bytes)) invalid();
    }
    return {
      bbox: f.bbox,
      detScore: f.detScore,
      embedding: f.embedding,
      pose: null,
      liveness: f.liveness,
      crop: f.crop,
    };
  });
  return { width: data.width, height: data.height, faces, skippedSmall: data.skippedSmall };
}

// เวลาที่บอร์ดบอกว่าจับภาพ ไว้ log อย่างเดียว ไม่ใช้เป็นเวลาที่เห็นหน้า
export function readCapturedAt(body: unknown): string | null {
  const parsed = z.object({ capturedAt }).safeParse(body);
  return (parsed.success && parsed.data.capturedAt) || null;
}
