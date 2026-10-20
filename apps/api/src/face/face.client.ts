import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

export interface FacePose {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface EnrollResult {
  embedding: number[];
  bbox: [number, number, number, number];
  detScore: number;
  pose: FacePose | null;
  sharpness: number;
  model: string;
}

export interface DetectedFace {
  bbox: [number, number, number, number];
  detScore: number;
  embedding: number[];
  pose: FacePose | null;
}

export interface DetectResult {
  width: number;
  height: number;
  faces: DetectedFace[];
  skippedSmall: number;
}

export interface MatchCandidate {
  id: string;
  embeddings: number[][];
}

export interface MatchResult {
  bestId: string | null;
  score: number | null;
  secondId: string | null;
  secondScore: number | null;
}

const TIMEOUT_MS = 10_000;

// ปัญหาของรูปที่ผู้ใช้แก้เองได้ (ถ่ายใหม่) ส่งต่อให้แอปแสดงข้อความ
// code อื่นจาก service (เช่น BAD_EMBEDDING, REQUEST_TOO_LARGE, 404) เป็นบั๊กหรือตั้งค่าผิดฝั่งระบบ
const USER_FACING_CODES = new Set([
  'NO_FACE',
  'MULTIPLE_FACES',
  'FACE_TOO_SMALL',
  'LOW_QUALITY',
  'BLURRY',
  'INVALID_IMAGE',
  'IMAGE_TOO_LARGE',
]);

const unavailable = () =>
  new AppError(
    503,
    'FACE_SERVICE_UNAVAILABLE',
    'ระบบตรวจใบหน้าใช้งานไม่ได้ตอนนี้ ลองใหม่อีกครั้ง',
  );

// เรียก face service (Python) ที่รันแยกอยู่ ผลที่ผู้ใช้ควรรู้ (เช่น MULTIPLE_FACES) ส่งต่อตามเดิม
@Injectable()
export class FaceClient {
  private readonly logger = new Logger(FaceClient.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  enroll(image: Buffer, mime: string): Promise<EnrollResult> {
    return this.post('/faces/enroll', imageForm(image, mime));
  }

  detect(image: Buffer, mime: string): Promise<DetectResult> {
    return this.post('/faces/detect', imageForm(image, mime));
  }

  async match(
    probes: number[][],
    candidates: MatchCandidate[],
  ): Promise<MatchResult[]> {
    const data = await this.post<{ results: MatchResult[] }>(
      '/faces/match',
      JSON.stringify({ probes, candidates }),
      { 'Content-Type': 'application/json' },
    );
    return data.results;
  }

  private async post<T>(
    path: string,
    body: FormData | string,
    headers: Record<string, string> = {},
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.config.faceServiceUrl}${path}`, {
        method: 'POST',
        body,
        headers: { ...headers, 'X-Face-Token': this.config.faceServiceToken },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`เรียก face service ไม่ได้: ${String(error)}`);
      throw unavailable();
    }

    const payload = (await res.json().catch(() => null)) as {
      data?: T;
      error?: { code?: string; message?: string };
    } | null;

    // 401 แปลว่า token สองฝั่งไม่ตรงกัน เป็นปัญหาตั้งค่าเซิร์ฟเวอร์ ไม่ใช่ของผู้ใช้
    // ถ้าส่ง 401 ต่อไป เว็บ/แอปจะสั่งออกจากระบบโดยไม่จำเป็น
    if (res.status >= 500 || res.status === 401 || !payload) {
      this.logger.warn(`face service ตอบ ${res.status} ที่ ${path}`);
      throw unavailable();
    }
    if (!res.ok) {
      const code = payload.error?.code;
      if (code && USER_FACING_CODES.has(code)) {
        throw new AppError(res.status, code, payload.error?.message ?? 'ตรวจใบหน้าไม่สำเร็จ');
      }
      this.logger.error(`face service ตอบ ${res.status} ${code ?? ''} ที่ ${path}`);
      throw unavailable();
    }
    // ตอบสำเร็จแต่ไม่มี data แปลว่า service ผิดปกติ (หรือ URL ชี้ไปผิดที่)
    if (payload.data === undefined) {
      this.logger.warn(`face service ตอบ ${res.status} แต่ไม่มี data ที่ ${path}`);
      throw unavailable();
    }
    return payload.data;
  }
}

function imageForm(image: Buffer, mime: string): FormData {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(image)], { type: mime }), 'image');
  return form;
}
