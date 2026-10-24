import { Suspense } from "react";

// useParams ต้องอยู่ใน Suspense (cacheComponents)
export default function LiveLayout({ children }: LayoutProps<"/live">) {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <Suspense fallback={<p>กำลังโหลด...</p>}>{children}</Suspense>
    </main>
  );
}
