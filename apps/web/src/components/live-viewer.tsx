"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { bangkokDate, formatTime } from "@/lib/time";
import type { CameraKind, LiveFaces, LiveSession } from "@/lib/types";
import { CameraTile } from "./camera-tile";
import { ExamBadge } from "./exam-badge";

// กล้องตรวจหน้าวินาทีละครั้ง
const FACES_MS = 1000;

// โปรแกรมกล้องกลับภาพหน้าห้องก่อนส่งแล้ว แต่กรอบหน้ามาจากภาพที่ยังไม่กลับ ต้องกลับกรอบเอง
const MIRROR = true;

const KIND = {
  match: { label: "", box: "border-green-400", tag: "bg-green-500" },
  review: { label: "ไม่แน่ใจ", box: "border-yellow-300", tag: "bg-yellow-500" },
  unknown: { label: "ไม่รู้จัก", box: "border-gray-300", tag: "bg-gray-500" },
};

const LABEL: Record<CameraKind, string> = { front: "กล้องหน้าห้อง", door: "กล้องประตู" };

// หน้ากล้องวงจรปิดของคาบ: เห็นทุกกล้องในห้องพร้อมกัน
export function LiveViewer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [cameras, setCameras] = useState<CameraKind[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frontLive, setFrontLive] = useState(false);
  const [faces, setFaces] = useState<LiveFaces["faces"]>([]);
  const [showBoxes, setShowBoxes] = useState(true);
  const onFrontLive = useCallback((live: boolean) => setFrontLive(live), []);

  // รู้ก่อนว่าห้องมีกล้องอะไร จะได้ไม่ต่อกล้องที่ไม่มี
  useEffect(() => {
    let cancelled = false;
    apiFetch<LiveSession[]>(`/live/sessions?date=${bangkokDate(new Date())}`)
      .then((rows) => {
        if (cancelled) return;
        const found = rows.find((s) => s.id === sessionId) ?? null;
        setSession(found);
        // ไม่เจอในวันนี้ (เช่นคาบข้ามเที่ยงคืน) ลองต่อทั้งสองกล้อง
        const list: CameraKind[] = [];
        if (!found || found.hasCamera) list.push("front");
        if (!found || found.hasDoorCamera) list.push("door");
        setCameras(list);
      })
      .catch(async (e: unknown) => {
        const message = await handleApiError(e, router);
        if (!cancelled) setError(message);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, router]);

  // กรอบหน้ามาจากการตรวจเช็คชื่อ อาจช้ากว่าภาพเล็กน้อย
  useEffect(() => {
    if (!frontLive) return;
    let stop = false;
    // คำขอก่อนหน้ายังไม่เสร็จก็ไม่เริ่มคำขอใหม่ คำตอบเก่าจะได้ไม่ทับของใหม่
    let running = false;
    const load = () => {
      if (running) return Promise.resolve();
      running = true;
      return apiFetch<LiveFaces>(`/sessions/${sessionId}/live/faces`)
        .then((data) => !stop && setFaces(data.faces))
        .catch(() => !stop && setFaces([]))
        .finally(() => {
          running = false;
        });
    };
    void load();
    const timer = setInterval(() => void load(), FACES_MS);
    return () => {
      stop = true;
      clearInterval(timer);
      setFaces([]);
    };
  }, [frontLive, sessionId]);

  const boxes =
    showBoxes &&
    faces.map((face) => (
      <div
        key={face.n}
        className={`absolute border-2 ${KIND[face.kind].box}`}
        style={{
          left: `${(MIRROR ? 1 - face.box[2] : face.box[0]) * 100}%`,
          top: `${face.box[1] * 100}%`,
          width: `${(face.box[2] - face.box[0]) * 100}%`,
          height: `${(face.box[3] - face.box[1]) * 100}%`,
        }}
      >
        <span
          className={`absolute -top-6 left-0 rounded px-1.5 text-sm font-semibold text-white ${KIND[face.kind].tag}`}
        >
          {face.n}
        </span>
      </div>
    ));

  return (
    <section className="live-viewer space-y-4">
      <Script src="/mediamtx/reader.js" strategy="afterInteractive" onReady={() => setReady(true)} />
      <Link href="/live" className="text-sm text-blue-600 underline">
        กล้องทั้งหมด
      </Link>
      <h1 className="text-xl font-semibold">
        {session ? (
          <>
            {session.courseCode} {session.courseName}{" "}
            <span className="font-normal text-gray-600">
              {formatTime(session.startsAt)}-{formatTime(session.endsAt)} · {session.roomName}
            </span>{" "}
            {session.kind === "exam" && <ExamBadge title={session.title} />}
          </>
        ) : (
          "กล้องวงจรปิด"
        )}
      </h1>

      {error && <p className="text-red-600">{error}</p>}
      {cameras === null ? (
        !error && <p>กำลังโหลด...</p>
      ) : cameras.length === 0 ? (
        <p className="text-gray-600">ห้องนี้ไม่มีกล้อง</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {cameras.map((camera) => (
            <CameraTile
              key={camera}
              sessionId={sessionId}
              camera={camera}
              label={LABEL[camera]}
              ready={ready}
              onLive={camera === "front" ? onFrontLive : undefined}
            >
              {camera === "front" && boxes}
            </CameraTile>
          ))}
        </div>
      )}

      {cameras?.includes("front") && (
        <aside className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">คนในภาพหน้าห้อง</h2>
            <label className="flex items-center gap-1 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showBoxes}
                onChange={(e) => setShowBoxes(e.target.checked)}
              />
              แสดงกรอบ
            </label>
          </div>
          {!frontLive ? (
            <p className="text-sm text-gray-500">แสดงเฉพาะตอนดูสด</p>
          ) : faces.length === 0 ? (
            <p className="text-sm text-gray-500">ยังไม่เห็นใครในภาพ</p>
          ) : (
            <ol className="grid divide-y rounded-lg border text-sm sm:grid-cols-2 sm:divide-y-0">
              {faces.map((face) => (
                <li key={face.n} className="flex items-start gap-2 px-3 py-2">
                  <span
                    className={`mt-0.5 rounded px-1.5 font-semibold text-white ${KIND[face.kind].tag}`}
                  >
                    {face.n}
                  </span>
                  <span>
                    {face.kind === "unknown" ? (
                      <span className="text-gray-500">ไม่รู้จัก</span>
                    ) : (
                      <>
                        {face.name ?? "ยังไม่มีชื่อ"}
                        <span className="block text-gray-500">
                          {face.studentCode}
                          {KIND[face.kind].label && ` · ${KIND[face.kind].label}`}
                        </span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="text-xs text-gray-500">กรอบอัปเดตทุก 1 วินาที อาจช้ากว่าภาพเล็กน้อย</p>
        </aside>
      )}
      <p className="text-sm text-gray-500">
        ไม่มีเสียง · มีการบันทึกการเปิดดูสดและย้อนหลังทุกครั้ง · ดูย้อนหลังทั้งคาบได้หลังจบคาบ
      </p>
    </section>
  );
}
