import type { ReactNode } from 'react';
import Link from 'next/link';

export function LoginScene({ children }: { children: ReactNode }) {
  return <main id="main-content" className="signin-page">
    <header className="signin-header"><Link href="/" className="signin-logo" aria-label="ClassPing หน้าหลัก"><span aria-hidden="true">C<span className="signin-logo-dot" /></span>ClassPing</Link><span className="signin-university">Dhurakij Pundit University</span></header>
    <div className="signin-body">
      <section className="signin-intro" aria-labelledby="signin-title">
        <h1 id="signin-title">ทุกคาบเรียน<br /><span>เชื่อมต่อกันได้ง่ายขึ้น</span></h1>
        <p>รายวิชา ตารางเรียน และการเข้าเรียน<br />พื้นที่เดียวสำหรับวันทำงานในมหาวิทยาลัย</p>
        <div className="signin-rhythm" aria-hidden="true">
          <div className="rhythm-line" />
          <div className="rhythm-item"><span className="rhythm-node"><svg viewBox="0 0 24 24"><path d="M4 5h16v15H4zM8 3v4m8-4v4M4 10h16m-12 4h3m2 0h3m-8 3h3" /></svg></span><span>ตารางเรียน</span></div>
          <div className="rhythm-item rhythm-active"><span className="rhythm-node"><svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6" /></svg></span><span>การเข้าเรียน</span></div>
          <div className="rhythm-item"><span className="rhythm-node"><svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H5V3zm7 0v5h5M8 12h8m-8 4h5" /></svg></span><span>ใบลา</span></div>
        </div>
      </section>
      <section className="signin-form" aria-label="เข้าสู่ระบบบัญชีมหาวิทยาลัย">
        <div className="signin-form-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 5H5v7m19-7h3v7M5 21v6h7m15-6v6h-7M11 13h.01M21 13h.01M11 20c3 3 7 3 10 0" strokeLinecap="round" /></svg></div>
        {children}
      </section>
    </div>
    <footer className="signin-footer"><span>ClassPing · ระบบจัดการการเข้าเรียน</span><span>สำหรับอาจารย์และผู้ดูแลระบบ</span></footer>
  </main>;
}
