export interface AppConfig {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  adminEmails: string[];
  allowedOrigins: string[];
  faceServiceUrl: string;
  faceServiceToken: string;
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

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
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
  };
}
