"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="login-layout"><section className="login-panel space-y-3">
    <h1>โหลดหน้าไม่สำเร็จ</h1>
    <p role="alert">ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง</p>
    <button type="button" onClick={reset}>ลองใหม่</button>
  </section></main>;
}
