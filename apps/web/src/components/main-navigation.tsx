import Link from "next/link";

const LINKS = [
  { href: "/", label: "หน้าหลัก" },
  { href: "/courses", label: "รายวิชา" },
  { href: "/live", label: "กล้อง" },
  { href: "/leave", label: "ยื่นลา" },
  { href: "/leave/review", label: "ตรวจใบลา" },
  { href: "/me", label: "บัญชี" },
];

export function MainNavigation() {
  return (
    <nav aria-label="เมนูหลัก" className="flex flex-wrap gap-2 border-b p-3">
      {LINKS.map(({ href, label }) => (
        <Link key={href} href={href} className="rounded border bg-white px-3 py-1">
          {label}
        </Link>
      ))}
    </nav>
  );
}
