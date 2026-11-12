"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithGooglePopup } from "@/lib/popup-login";
import { useLoginTransition } from "./login-transition";
import { LoginScene } from "./login-scene";

function LoginForm() {
  const router = useRouter();
  const transition = useLoginTransition();
  const attempt = useRef<AbortController | null>(null);
  const [opening, setOpening] = useState(false);
  useEffect(() => () => attempt.current?.abort(), []);
  const urlError = useSearchParams().get("error");
  const [loading, setLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const error = signInError ?? urlError;

  async function signIn() {
    if (attempt.current) return;
    const controller = new AbortController();
    attempt.current = controller;
    setLoading(true);
    setSignInError(null);
    try {
      const user = await signInWithGooglePopup(controller.signal);
      if (!user || controller.signal.aborted) return;
      setOpening(true);
      await transition.begin();
      router.replace('/');
      router.refresh();
    } catch (error) {
      if (!controller.signal.aborted) {
        setSignInError(error instanceof Error ? error.message : 'เข้าสู่ระบบไม่ได้ กรุณาลองใหม่');
        setLoading(false);
      }
    } finally {
      if (attempt.current === controller) attempt.current = null;
    }
  }

  function cancelLogin() {
    attempt.current?.abort();
    attempt.current = null;
    setLoading(false);
  }

  return <LoginScene>
    <h1>ClassPing</h1>
    <button type="button" className="signin-google" onClick={signIn} disabled={loading} aria-busy={loading}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22ZM6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59ZM12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z" /></svg>
      <span>{loading ? (opening ? 'กำลังเปิดหน้าแรก...' : 'กำลังเลือกบัญชี...') : 'เข้าสู่ระบบด้วย Google'}</span>
      {loading && <span className="signin-spinner" aria-hidden="true" />}
      {!loading && <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>}
    </button>
    {loading && !opening && <button type="button" className="signin-cancel" onClick={cancelLogin}>ยกเลิก</button>}
    {error && <p role="alert" className="signin-error">{error}</p>}
    <p className="signin-domain">อาจารย์และผู้ดูแลระบบ · <strong>@dpu.ac.th</strong></p>
  </LoginScene>;
}

export default function LoginScreen() {
  return (
    <Suspense fallback={<LoginScene><p role="status">กำลังเตรียมหน้าเข้าสู่ระบบ...</p></LoginScene>}>
      <LoginForm />
    </Suspense>
  );
}
