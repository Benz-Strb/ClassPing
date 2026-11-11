import { createBrowserClient } from "@supabase/ssr";

// Browser และ server ใช้ session cookie ร่วมกัน
// ข้อมูลอื่นทั้งหมดดึงผ่าน API ของเรา (apiFetch)
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  // ปิด detectSessionInUrl เพราะหน้า /auth/callback แลก code เอง
  // ถ้าเปิดไว้ client จะแลก code ไปก่อนแล้วการแลกซ้ำจะ error ว่าหา code verifier ไม่เจอ
  { auth: { flowType: "pkce", detectSessionInUrl: false } },
);
