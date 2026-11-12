"use client";

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { popupChannel } from '@/lib/oauth-popup';

function PopupResult() {
  const params = useSearchParams();
  const attempt = params.get('attempt');
  const error = params.get('error');
  const waiting = params.get('waiting') === '1';
  useEffect(() => {
    if (waiting || !attempt || !/^[a-f0-9-]{36}$/.test(attempt)) return;
    const message = { type: 'classping:oauth', attempt, error };
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(popupChannel(attempt));
    channel?.postMessage(message);
    window.opener?.postMessage(message, window.location.origin);
    const close = setTimeout(() => window.close(), 250);
    return () => { clearTimeout(close); channel?.close(); };
  }, [attempt, error, waiting]);
  return <main className="login-layout"><section className="login-panel space-y-3">
    <h1>ClassPing</h1>
    <p role="status">{waiting ? 'กำลังเปิด Google...' : error ? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่' : 'ยืนยันบัญชีแล้ว กลับไปที่หน้าหลักได้เลย'}</p>
    {!waiting && <Link href="/">กลับหน้าหลัก</Link>}
  </section></main>;
}

export default function PopupPage() {
  return <Suspense fallback={<p role="status">กำลังตรวจสอบบัญชี...</p>}><PopupResult /></Suspense>;
}
