"use client";

import Image from "next/image";
import { useState } from "react";

export function ProfileAvatar({ user, className }: { user: { fullName: string | null; email: string; avatarUrl?: string | null }; className: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={className} aria-hidden="true">
    {user.avatarUrl && failedUrl !== user.avatarUrl
      ? <Image src={user.avatarUrl} alt="" width={56} height={56} unoptimized referrerPolicy="no-referrer" onError={() => setFailedUrl(user.avatarUrl!)} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
      : (user.fullName ?? user.email).trim().slice(0, 1).toUpperCase()}
  </span>;
}
