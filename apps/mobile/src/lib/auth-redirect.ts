// Expo Go ไม่รู้จัก scheme classping:// ต้องใช้ลิงก์ exp:// ของ Expo Go แทน
// (ต้องมี exp://** ใน Redirect URLs ของ Supabase ใช้ช่วงพัฒนาเท่านั้น)
export function getMobileAuthRedirectUri(
  appOwnership: string | null,
  createExpoUrl: (path: string) => string,
): string {
  if (appOwnership === 'expo') {
    return createExpoUrl('auth/callback');
  }

  return 'classping://auth/callback';
}
