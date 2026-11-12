"use client";

import Link from "next/link";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useRouter } from "next/navigation";
import { useWebUser } from "@/components/web-access";
import { supabase } from "@/lib/supabase";

interface Me {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl?: string | null;
  role: "student" | "teacher" | "admin";
  studentId: string | null;
}

const ROLE_LABEL: Record<Me["role"], string> = {
  student: "อาจารย์",
  teacher: "อาจารย์",
  admin: "ผู้ดูแลระบบ",
};

export default function MePage() {
  const router = useRouter();
  const me = useWebUser();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!me) return <p className="p-6">กำลังโหลด...</p>;

  return (
    <main className="account-page mx-auto space-y-6 p-6">
      <header><h1 className="text-2xl sm:text-3xl font-semibold">บัญชีของฉัน</h1><p className="text-gray-600">ข้อมูลบัญชีมหาวิทยาลัยของคุณ</p></header>
      <section className="account-profile" aria-label="ข้อมูลบัญชี">
        <ProfileAvatar user={me} className="account-avatar" />
        <div><h2>{me.fullName ?? me.email}</h2><p className="text-gray-600 break-all">{me.email}</p></div>
      </section>
      <dl className="account-details"><div><dt>บทบาท</dt><dd>{ROLE_LABEL[me.role]}</dd></div>{me.studentId && <div><dt>รหัสอาจารย์</dt><dd>{me.studentId}</dd></div>}</dl>
      {me.role === "admin" && (
        <Link
          href="/admin"
          className="block w-fit rounded-lg bg-blue-700 px-4 py-2 text-white hover:bg-blue-800"
        >
          ระบบผู้ดูแล
        </Link>
      )}
      <button onClick={signOut} className="rounded-lg border px-4 py-2">
        ออกจากระบบ
      </button>
    </main>
  );
}
