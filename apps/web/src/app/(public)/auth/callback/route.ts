import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { POPUP_COOKIE } from '@/lib/oauth-popup';

export async function GET(request: NextRequest) {
  const attempt = request.cookies.get(POPUP_COOKIE)?.value;
  const popup = attempt && /^[a-f0-9-]{36}$/.test(attempt);
  const destination = (error = false) => {
    const path = popup ? `/auth/popup?attempt=${attempt}${error ? '&error=oauth' : ''}` : error ? `/login?error=${encodeURIComponent('เข้าสู่ระบบไม่สำเร็จ กรุณากดเข้าสู่ระบบอีกครั้ง')}` : '/';
    const response = NextResponse.redirect(new URL(path, request.url));
    response.cookies.set(POPUP_COOKIE, '', { path: '/auth', maxAge: 0 });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
  const code = request.nextUrl.searchParams.get('code');
  const failed = request.nextUrl.searchParams.has('error');
  if (code && !failed) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return destination();
    }
  }
  return destination(true);
}
