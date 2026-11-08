"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Camera, CameraToken } from "@/lib/admin";
import type { Room } from "@/lib/types";

export default function AdminCamerasPage() {
  const router = useRouter();
  const [data, setData] = useState<{ rooms: Room[]; cameras: Camera[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<CameraToken | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch<Room[]>("/admin/rooms"), apiFetch<Camera[]>("/admin/cameras")])
      .then(([rooms, cameras]) => { if (!cancelled) setData({ rooms, cameras }); })
      .catch(async (value: unknown) => { const message = await handleApiError(value, router); if (!cancelled) setError(message); });
    return () => { cancelled = true; };
  }, [router]);

  async function issue(room: Room, kind: "front" | "door") {
    const label = kind === "door" ? "ประตู" : "หน้าห้อง";
    const existing = data?.cameras.find((camera) => camera.roomId === room.id && camera.kind === kind);
    if (!window.confirm(existing?.hasToken
      ? `ออก token ใหม่สำหรับกล้อง${label} ${room.name}? token เดิมจะใช้ไม่ได้ ต้องอัปเดตที่กล้องด้วย`
      : `ออก token กล้อง${label}สำหรับ ${room.name}?`)) return;
    setBusy(true); setError(null); setStatus(""); setSecret(null);
    try {
      const token = await apiFetch<CameraToken>(`/admin/cameras/${room.id}/token`, { method: "POST", body: JSON.stringify({ kind }) });
      setSecret(token);
      setData((current) => current && ({ ...current, cameras: [
        ...current.cameras.filter((camera) => camera.roomId !== room.id || camera.kind !== kind),
        { id: token.cameraId, roomId: room.id, roomName: room.name, kind, lastSeenAt: existing?.lastSeenAt ?? null, hasToken: true },
      ] }));
      setStatus(`ออก token กล้อง${label}สำหรับ ${room.name} แล้ว`);
    } catch (value) { setError(await handleApiError(value, router)); }
    finally { setBusy(false); }
  }
  async function copyToken() {
    if (!secret) return;
    try { await navigator.clipboard.writeText(secret.token); setStatus("คัดลอก token แล้ว"); }
    catch { setError("คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอก token เอง"); }
  }

  return <section className="space-y-4" aria-labelledby="cameras-title">
    <div><h2 id="cameras-title" className="text-xl font-semibold">กล้องประจำห้อง</h2>
      <p className="text-sm text-gray-600">ตรวจการติดต่อของกล้องและออก token กล้องหน้าห้องและกล้องประตู</p></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {status && <p role="status" className="text-green-800">{status}</p>}
    {secret && <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4" aria-label="token ที่ออกใหม่">
      <p className="font-medium">เก็บ token นี้ไว้ที่กล้องก่อนปิด แสดงเฉพาะครั้งนี้</p>
      <p className="text-sm">รหัสห้อง: {secret.roomId}</p>
      <label htmlFor="camera-token" className="block text-sm">Token</label>
      <input id="camera-token" readOnly value={secret.token} onFocus={(event) => event.target.select()} className="w-full rounded border bg-white p-2 font-mono text-sm" />
      <div className="flex gap-3"><button onClick={copyToken} className="rounded border bg-white px-3 py-2">คัดลอก token</button>
        <button onClick={() => { setSecret(null); setStatus(""); }} className="rounded border bg-white px-3 py-2">ปิดและซ่อน token</button></div>
    </div>}
    {!data ? !error && <p role="status">กำลังโหลดกล้อง...</p> : !data.rooms.length ? <p>ยังไม่มีห้องเรียน <Link href="/admin/rooms" className="text-blue-700 underline">เพิ่มห้องเรียน</Link></p> :
      <ul className="divide-y rounded-lg border bg-white">{data.rooms.map((room) => {
        const cameras = data.cameras.filter((camera) => camera.roomId === room.id);
        const front = cameras.find((camera) => camera.kind === "front");
        const door = cameras.find((camera) => camera.kind === "door");
        return <li key={room.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="space-y-1"><h3 className="font-medium">{room.name}</h3>
            {!cameras.length && <p className="text-sm text-gray-600">ยังไม่มีกล้อง</p>}
            {cameras.map((camera) => <p key={camera.id} className="text-sm text-gray-600">
              {camera.kind === "front" ? "หน้าห้อง" : "ประตู"} · {camera.hasToken ? "มี token" : "ยังไม่มี token"} · ติดต่อครั้งล่าสุด: {camera.lastSeenAt ? new Date(camera.lastSeenAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ยังไม่เคยติดต่อ"}
            </p>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => issue(room, "front")} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">{busy ? "กำลังออก token..." : front?.hasToken ? "ออก token หน้าห้องใหม่" : "ออก token หน้าห้อง"}</button>
            <button disabled={busy} onClick={() => issue(room, "door")} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">{busy ? "กำลังออก token..." : door?.hasToken ? "ออก token ประตูใหม่" : "ออก token ประตู"}</button>
          </div>
        </li>;
      })}</ul>}
  </section>;
}
