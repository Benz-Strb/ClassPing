export interface AppConfig {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  adminEmails: string[];
  allowedOrigins: string[];
  faceServiceUrl: string;
  faceServiceToken: string;
  redisHost: string;
  redisPort: number;
  // คะแนนตั้งแต่ matchAcceptMin บันทึกเลย, ตั้งแต่ matchReviewMin ส่งให้อาจารย์ตรวจ ต่ำกว่านั้นถือว่าไม่รู้จัก
  matchAcceptMin: number;
  matchReviewMin: number;
  cameraOpenBeforeMin: number;
  matchLog: boolean;
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
    faceServiceUrl: (env.FACE_SERVICE_URL?.trim() || 'http://127.0.0.1:8001').replace(
      /\/+$/,
      '',
    ),
    faceServiceToken: faceToken(env),
    redisHost: env.REDIS_HOST?.trim() || '127.0.0.1',
    redisPort: wholeNumber(env, 'REDIS_PORT', 6379),
    matchAcceptMin,
    matchReviewMin,
    cameraOpenBeforeMin: wholeNumber(env, 'CAMERA_OPEN_BEFORE_MIN', 20),
    matchLog: env.MATCH_LOG?.trim() === '1',
  };
}
