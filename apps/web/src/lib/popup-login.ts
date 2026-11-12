import { supabase } from './supabase';
import { apiFetch } from './api';
import type { Me } from './types';

import { POPUP_COOKIE, popupChannel } from './oauth-popup';

export async function signInWithGooglePopup(signal: AbortSignal): Promise<Me> {
  if (signal.aborted) throw new Error('ยกเลิกการเข้าสู่ระบบแล้ว');
  const attempt = crypto.randomUUID();
  const width = Math.min(480, window.screen.availWidth);
  const height = Math.min(660, window.screen.availHeight);
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  const popup = window.open('/auth/popup?waiting=1', `classping-google-${attempt}`, `popup=yes,menubar=no,toolbar=no,status=no,scrollbars=yes,resizable=yes,width=${width},height=${height},left=${left},top=${top}`);

  if (!popup) {
    throw new Error('เบราว์เซอร์บล็อกหน้าต่างเลือกบัญชี กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้ แล้วกดเข้าสู่ระบบอีกครั้ง');
  }
  try {
    popup.resizeTo(width, height);
    popup.moveTo(left, top);
    popup.focus();
  } catch {
    // บางเบราว์เซอร์จำกัดการปรับขนาด ให้ใช้ขนาดที่ร้องขอใน window.open
  }

  document.cookie = `${POPUP_COOKIE}=${attempt}; Path=/auth; Max-Age=600; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(popupChannel(attempt));

  return new Promise<Me>((resolve, reject) => {
    let checking = false;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      signal.removeEventListener('abort', onAbort);
      channel?.close();
      document.cookie = `${POPUP_COOKIE}=; Path=/auth; Max-Age=0; SameSite=Lax`;
      popup.close();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'));
    };
    const receive = async (data: unknown) => {
      if (settled || checking || !data || typeof data !== 'object') return;
      const result = data as { type?: string; attempt?: string; error?: string };
      if (result.type !== 'classping:oauth' || result.attempt !== attempt) return;
      if (result.error) { fail(new Error('เข้าสู่ระบบไม่สำเร็จ กรุณาเลือกบัญชีอีกครั้ง')); return; }
      checking = true;
      try {
        const user = await apiFetch<Me>('/me', { signal });
        if (user.role !== 'admin' && user.role !== 'teacher') {
          await supabase.auth.signOut({ scope: 'local' });
          throw new Error('เว็บไซต์สำหรับอาจารย์และผู้ดูแลระบบ นักศึกษากรุณาใช้แอป ClassPing');
        }
        if (settled) return;
        settled = true;
        cleanup();
        resolve(user);
      } catch (error) { fail(error); }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === popup) void receive(event.data);
    };
    const onAbort = () => fail(new Error('ยกเลิกการเข้าสู่ระบบแล้ว'));
    const timeout = window.setTimeout(() => fail(new Error('หมดเวลาการเข้าสู่ระบบ กรุณาลองใหม่')), 300_000);
    window.addEventListener('message', onMessage);
    signal.addEventListener('abort', onAbort, { once: true });
    if (channel) channel.onmessage = (event) => void receive(event.data);
    if (signal.aborted) { onAbort(); return; }

    void supabase.auth.signInWithOAuth({
      provider: 'google', options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        skipBrowserRedirect: true,
        queryParams: { hd: 'dpu.ac.th', prompt: 'select_account' },
      },
    }).then(({ data, error }) => {
      if (settled) return;
      if (error || !data.url) { fail(error); return; }
      popup.location.replace(data.url);
    }).catch(fail);
  });
}
