export interface AppConfig {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  adminEmails: string[];
  allowedOrigins: string[];
  leaveOcrServiceUrl?: string;
  leaveOcrServiceToken?: string | null;
  faceServiceUrl: string;
  faceServiceToken: string;
  redisHost: string;
  redisPort: number;
  // คะแนนตั้งแต่ matchAcceptMin บันทึกเลย, ตั้งแต่ matchReviewMin ส่งให้อาจารย์ตรวจ ต่ำกว่านั้นถือว่าไม่รู้จัก
  matchAcceptMin: number;
  matchReviewMin: number;
  cameraOpenBeforeMin: number;
  matchLog: boolean;
  // คะแนน liveness ต่ำกว่านี้ถือว่าเป็นรูปหรือจอ null = ปิด
  livenessMin: number | null;
  // ต้องเจอคนจริงติดกันกี่ภาพ ถึงล้างสถานะสงสัยของแถวที่รอตรวจ
  livenessStreak: number;
  // media server (MediaMTX) ไม่ตั้ง secret = ยังไม่เปิดใช้กล้องสด/ดูย้อนหลัง
  mediaTokenSecret: string | null;
  // ใช้เรียก playback และ control API ของ MediaMTX
  mediaServerSecret: string | null;
  mediaRtspUrl: string;
  mediaWebrtcUrl: string;
  mediaPlaybackUrl: string;
  mediaApiUrl: string;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const MIN_FACE_TOKEN_LENGTH = 32;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`ยังไม่ได้ตั้งค่า ${name} ใน .env`);
  return value;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// ค่าเดียวกับ FACE_SERVICE_TOKEN ใน services/face/.env
function faceToken(env: NodeJS.ProcessEnv): string {
  const token = required(env, 'FACE_SERVICE_TOKEN');
  if (token.length < MIN_FACE_TOKEN_LENGTH) {
    throw new Error(`FACE_SERVICE_TOKEN ต้องยาวอย่างน้อย ${MIN_FACE_TOKEN_LENGTH} ตัว`);
  }
  return token;
}

function optionalSecret(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  if (!value) return null;
  if (value.length < MIN_FACE_TOKEN_LENGTH) {
    throw new Error(`${name} ต้องยาวอย่างน้อย ${MIN_FACE_TOKEN_LENGTH} ตัว`);
  }
  return value;
}

function url(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  return (env[name]?.trim() || fallback).replace(/\/+$/, '');
}

function score(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} ต้องเป็นตัวเลข 0 ถึง 1`);
  }
  return value;
}

function wholeNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} ต้องเป็นจำนวนเต็มไม่ติดลบ`);
  return Number(raw);
}

function optionalOpenScore(env: NodeJS.ProcessEnv, name: string): number | null {
  const raw = env[name]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new Error(`${name} ต้องเป็นตัวเลขมากกว่า 0 และน้อยกว่า 1`);
  }
  return value;
}

function positiveWhole(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error(`${name} ต้องเป็นจำนวนเต็มตั้งแต่ 1`);
  return Number(raw);
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const matchAcceptMin = score(env, 'MATCH_ACCEPT_MIN', 0.5);
  const matchReviewMin = score(env, 'MATCH_REVIEW_MIN', 0.36);
  if (matchReviewMin >= matchAcceptMin) {
    throw new Error('MATCH_REVIEW_MIN ต้องน้อยกว่า MATCH_ACCEPT_MIN');
  }

  return {
    port: Number(env.PORT) || 3001,
    supabaseUrl: required(env, 'SUPABASE_URL'),
    supabaseServiceRoleKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    adminEmails: list(env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    faceServiceUrl: (env.FACE_SERVICE_URL?.trim() || 'http://127.0.0.1:8001').replace(/\/+$/, ''),
    faceServiceToken: faceToken(env),
    leaveOcrServiceUrl: url(env, 'LEAVE_OCR_SERVICE_URL', 'http://127.0.0.1:8002'),
    leaveOcrServiceToken: optionalSecret(env, 'LEAVE_OCR_SERVICE_TOKEN'),
    redisHost: env.REDIS_HOST?.trim() || '127.0.0.1',
    redisPort: wholeNumber(env, 'REDIS_PORT', 6379),
    matchAcceptMin,
    matchReviewMin,
    cameraOpenBeforeMin: wholeNumber(env, 'CAMERA_OPEN_BEFORE_MIN', 20),
    matchLog: env.MATCH_LOG?.trim() === '1',
    livenessMin: optionalOpenScore(env, 'LIVENESS_MIN'),
    livenessStreak: positiveWhole(env, 'LIVENESS_STREAK', 3),
    mediaTokenSecret: optionalSecret(env, 'MEDIA_TOKEN_SECRET'),
    mediaServerSecret: optionalSecret(env, 'MEDIA_SERVER_SECRET'),
    mediaRtspUrl: url(env, 'MEDIA_RTSP_URL', 'rtsp://127.0.0.1:8554'),
    mediaWebrtcUrl: url(env, 'MEDIA_WEBRTC_URL', 'http://localhost:8889'),
    mediaPlaybackUrl: url(env, 'MEDIA_PLAYBACK_URL', 'http://127.0.0.1:9996'),
    mediaApiUrl: url(env, 'MEDIA_API_URL', 'http://127.0.0.1:9997'),
  };
}
