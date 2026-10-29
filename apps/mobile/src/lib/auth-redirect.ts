export function getMobileAuthRedirectUri(_appOwnership: string | null): string {
  if (_appOwnership === 'expo') {
    throw new Error('Google Login ใช้ผ่าน Expo Go ไม่ได้ กรุณาเปิด ClassPing Development Build');
  }

  return 'classping://auth/callback';
}
