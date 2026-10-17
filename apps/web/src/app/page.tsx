import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Link href="/login" className="rounded-lg bg-blue-600 px-4 py-2 text-white">
        เข้าสู่ระบบ ClassPing
      </Link>
    </main>
  );
}
