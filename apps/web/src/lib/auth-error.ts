import type { useRouter } from "next/navigation";
import { ApiError } from "./api";
import { supabase } from "./supabase";

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
  return "โหลดข้อมูลไม่ได้ ลองใหม่อีกครั้ง";
}
