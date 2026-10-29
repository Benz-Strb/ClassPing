"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Room } from "@/lib/types";

export default function AdminRoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Room[]>("/admin/rooms")
      .then(setRooms)
      .catch(async (value: unknown) =>
        setError(await handleApiError(value, router)),
      );
  }, [router]);

  async function createRoom(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const room = await apiFetch<Room>("/admin/rooms", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setRooms((current) =>
        [...(current ?? []), room].sort((a, b) =>
          a.name.localeCompare(b.name, "th"),
        ),
      );
      setName("");
    } catch (value) {
      setError(await handleApiError(value, router));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="rooms-title"
      className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]"
    >
      <div className="space-y-4">
        <div>
          <h2 id="rooms-title" className="text-xl font-semibold">
            ห้องเรียน
          </h2>
          <p className="text-sm text-gray-600">
            ห้องที่ใช้จัดตารางเรียนและติดตั้งกล้อง
          </p>
        </div>
        {error && (
          <p className="text-red-700" role="alert">
            {error}
          </p>
        )}
        {rooms === null ? (
          <p role="status">กำลังโหลดห้องเรียน...</p>
        ) : rooms.length === 0 ? (
          <p className="text-gray-600">ยังไม่มีห้องเรียน</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {rooms.map((room) => (
              <li key={room.id} className="px-4 py-3">
                {room.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={createRoom}
        className="h-fit space-y-3 rounded-lg border bg-white p-4"
      >
        <h3 className="font-medium">เพิ่มห้องเรียน</h3>
        <label htmlFor="room-name" className="block text-sm font-medium">
          ชื่อห้อง
        </label>
        <input
          id="room-name"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="เช่น ห้อง 301"
          className="w-full rounded-md border px-3 py-2"
        />
        <button
          disabled={saving}
          className="rounded-md bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "กำลังเพิ่ม..." : "เพิ่มห้อง"}
        </button>
      </form>
    </section>
  );
}
