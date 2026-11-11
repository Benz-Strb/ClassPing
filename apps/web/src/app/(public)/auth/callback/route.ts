import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const failed = request.nextUrl.searchParams.has('error');
  if (code && !failed) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL('/', request.url));
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
  }
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent('เข้าสู่ระบบไม่สำเร็จ กรุณากดเข้าสู่ระบบอีกครั้ง')}`, request.url));
}
