import type { useRouter } from "next/navigation";
import { ApiError } from "./api";
import { supabase } from "./supabase";

// session หมด หรือบัญชีที่ใช้ไม่ได้ → ออกจากระบบแล้วไปหน้า login
// error อื่นคืนข้อความไทยจาก API ไว้แสดงบนหน้า
export async function handleApiError(
  error: unknown,
  router: ReturnType<typeof useRouter>,
): Promise<string | null> {
  if (error instanceof ApiError) {
    const signOut =
      error.status === 401 ||
      error.code === "DOMAIN_NOT_ALLOWED" ||
      error.code === "PROVIDER_NOT_ALLOWED";
    if (signOut) {
      await supabase.auth.signOut();
      router.replace(`/login?error=${encodeURIComponent(error.message)}`);
      return null;
    }
    return error.message;
  }
  return "เรียกระบบไม่สำเร็จ ลองใหม่อีกครั้ง";
}
