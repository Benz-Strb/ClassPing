import { createClient } from "@supabase/supabase-js";

// ใช้ฝั่ง browser เท่านั้น เอาไว้ login และถือ session
// ข้อมูลอื่นทั้งหมดดึงผ่าน API ของเรา (apiFetch)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  // ปิด detectSessionInUrl เพราะหน้า /auth/callback แลก code เอง
  // ถ้าเปิดไว้ client จะแลก code ไปก่อนแล้วการแลกซ้ำจะ error ว่าหา code verifier ไม่เจอ
  { auth: { flowType: "pkce", detectSessionInUrl: false } },
);
