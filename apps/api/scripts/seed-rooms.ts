// ใส่ห้องเรียนสำหรับเดโม (หน้าแอดมินจัดการห้องยังไม่มี)
// รันซ้ำได้ ห้องที่มีอยู่แล้วไม่ถูกเพิ่มซ้ำ: npm run db:seed:rooms
import { createClient } from '@supabase/supabase-js';

const ROOMS = ['ห้องทดลอง 1', 'ห้องทดลอง 2'];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ใน apps/api/.env');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const { error } = await db
  .from('rooms')
  .upsert(
    ROOMS.map((name) => ({ name })),
    { onConflict: 'name', ignoreDuplicates: true },
  );
if (error) {
  console.error(`ใส่ห้องไม่สำเร็จ: ${error.message}`);
  process.exit(1);
}

const { data } = await db.from('rooms').select('name').order('name');
console.log(`ห้องในระบบ: ${(data ?? []).map((r) => r.name).join(', ')}`);
