"use client";

import { useEffect, useRef, useState } from "react";
import { bangkokTimeToIso, formatTime } from "@/lib/time";
import type { SessionView, TripView } from "@/lib/types";
import { Photo } from "./photo";

export interface TripResult {
  ok: boolean;
  error: string | null;
}

// ดูรูปตอนออกและแก้เวลากลับหรือลบรอบ ค่าที่พิมพ์ค้างไม่หายตอนหน้าดึงข้อมูลใหม่
export function TripDialog({
  studentCode,
  fullName,
  trip,
  session,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  studentCode: string;
  fullName: string | null;
  trip: TripView;
  session: Pick<SessionView, "onDate" | "startsAt" | "endsAt">;
  busy: boolean;
  onSave: (backAt: string) => Promise<TripResult>;
  onDelete: () => Promise<TripResult>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [backTime, setBackTime] = useState(() => {
    const start = trip.backAt ?? trip.suggestedBackAt;
    return start ? formatTime(start) : "";
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function finish(result: Promise<TripResult>) {
    setError(null);
    const { ok, error: message } = await result;
    if (ok) onClose();
    else setError(message);
  }

  function save() {
    if (!backTime) return;
    return finish(
      onSave(bangkokTimeToIso(session.onDate, backTime, session.startsAt, session.endsAt)),
    );
  }

  function remove() {
    if (!window.confirm("ลบรอบนี้ใช่ไหม รอบนี้จะหายไปจากการนับเวลานอกห้อง")) return;
    return finish(onDelete());
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-lg border p-5 backdrop:bg-black/40"
    >
      <div className="space-y-4">
        <div>
          <p className="font-mono">{studentCode}</p>
          <p className="text-sm text-gray-600">{fullName ?? "-"}</p>
        </div>
        {trip.imageUrl && <Photo src={trip.imageUrl} size="h-48 w-48" />}
        <p className="text-sm">ออกตอน {formatTime(trip.outAt)}</p>
        <label className="flex items-center gap-2 text-sm">
          เวลากลับ
          <input
            type="time"
            value={backTime}
            onChange={(e) => setBackTime(e.target.value)}
            className="rounded-lg border bg-white px-2 py-2 text-base"
          />
        </label>
        {!trip.backAt && trip.suggestedBackAt && (
          <p className="text-xs text-gray-500">
            กล้องประตูเห็นเข้าห้องตอน {formatTime(trip.suggestedBackAt)}
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !backTime}
            onClick={save}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            บันทึก
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="rounded-lg border px-4 py-2 text-red-600 disabled:opacity-50"
          >
            ลบรอบนี้
          </button>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-lg border px-4 py-2"
          >
            ปิด
          </button>
        </div>
      </div>
    </dialog>
  );
}
