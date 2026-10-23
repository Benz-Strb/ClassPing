// ใส่กล้องหน้าห้องไว้เดโม แล้วเขียน token ลง services/camera/.env (รันซ้ำ = ออก token ใหม่)
// ใช้: npm run db:seed:camera -- "ห้องทดลอง 1"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { hashToken, newToken } from '../src/camera/camera-token.ts';

const roomName = process.argv[2]?.trim() || 'ห้องทดลอง 1';
const envPath = resolve(import.meta.dirname, '../../../services/camera/.env');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ใน apps/api/.env');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const { data: room, error: roomError } = await db
  .from('rooms')
  .select('id')
  .eq('name', roomName)
  .maybeSingle();
if (roomError) fail(`อ่านห้องไม่สำเร็จ: ${roomError.message}`);
if (!room) fail(`ไม่พบห้อง ${roomName} (ใส่ห้องก่อนด้วย npm run db:seed:rooms)`);

const token = newToken();
const { data: existing, error: findError } = await db
  .from('cameras')
  .select('id')
  .eq('room_id', room!.id)
  .eq('kind', 'front')
  .limit(1)
  .maybeSingle();
if (findError) fail(`อ่านกล้องไม่สำเร็จ: ${findError.message}`);

const { error: saveError } = existing
  ? await db.from('cameras').update({ token_hash: hashToken(token) }).eq('id', existing.id)
  : await db
      .from('cameras')
      .insert({ room_id: room!.id, kind: 'front', token_hash: hashToken(token) });
if (saveError) fail(`บันทึกกล้องไม่สำเร็จ: ${saveError.message}`);

// แทนเฉพาะบรรทัดของเรา ค่าอื่นในไฟล์คงไว้
const values: Record<string, string> = {
  CAMERA_TOKEN: token,
  API_URL: 'http://127.0.0.1:3001',
};
const lines = existsSync(envPath)
  ? readFileSync(envPath, 'utf8').split('\n').filter(Boolean)
  : [];
for (const [name, value] of Object.entries(values)) {
  const index = lines.findIndex((line) => line.startsWith(`${name}=`));
  // API_URL ที่ตั้งไว้เองแล้วไม่ทับ
  if (name === 'API_URL' && index >= 0) continue;
  if (index >= 0) lines[index] = `${name}=${value}`;
  else lines.push(`${name}=${value}`);
}
mkdirSync(dirname(envPath), { recursive: true });
writeFileSync(envPath, `${lines.join('\n')}\n`, { mode: 0o600 });

console.log(`บันทึก token กล้องของ ${roomName} แล้ว`);
