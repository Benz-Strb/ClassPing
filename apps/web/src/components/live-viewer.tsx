"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { bangkokDate, formatDate, formatTime } from "@/lib/time";
import type { LiveFaces, Recording } from "@/lib/types";
import { CctvPlayer } from "./cctv-player";
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

// หน้ากล้องวงจรปิดของคาบ: ดูสดระหว่างคาบ ดูย้อนหลังได้ทั้งระหว่างและหลังจบคาบในตัวเล่นเดียวกัน
export function LiveViewer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frontLive, setFrontLive] = useState(false);
  const [faces, setFaces] = useState<LiveFaces["faces"]>([]);
  const [showBoxes, setShowBoxes] = useState(true);
  const onFrontLive = useCallback((live: boolean) => setFrontLive(live), []);

  // รู้ก่อนว่าคาบนี้เวลาไหน ห้องมีกล้องอะไร และดาวน์โหลดได้ไหม
  useEffect(() => {
    let cancelled = false;
    apiFetch<Recording>(`/sessions/${sessionId}/recording`)
      .then((rec) => !cancelled && setInfo(rec))
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
      <Script
        src="/mediamtx/reader.js"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <Link href="/live" className="text-sm text-blue-600 underline">
        กล้องทั้งหมด
      </Link>
      <h1 className="text-xl font-semibold">
        {info ? (
          <>
            {info.session.courseCode} {info.session.courseName}{" "}
            <span className="font-normal text-gray-600">
              {formatDate(bangkokDate(new Date(info.session.startsAt)))}{" "}
              {formatTime(info.session.startsAt)}-
              {formatTime(info.session.endsAt)} · {info.session.roomName}
            </span>{" "}
            {info.session.kind === "exam" && (
              <ExamBadge title={info.session.title} />
            )}
          </>
        ) : (
          "กล้องวงจรปิด"
        )}
      </h1>

      {error && <p className="text-red-600">{error}</p>}
      {info === null ? (
        !error && <p>กำลังโหลด...</p>
      ) : info.cameras.length === 0 ? (
        <p className="text-gray-600">ห้องนี้ไม่มีกล้อง</p>
      ) : (
        // จอกว้างวางรายชื่อไว้ข้างตัวเล่นแบบหน้าจอ NVR ทั้งหมดอยู่ในจอเดียว จอแคบเรียงลงมา
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
          <CctvPlayer
            sessionId={sessionId}
            cameras={info.cameras}
            startsAt={Date.parse(info.session.startsAt)}
            endsAt={Date.parse(info.session.endsAt)}
            canDownload={info.canDownload}
            ready={ready}
            onFrontLive={onFrontLive}
            frontOverlay={boxes}
          />
          {/* สูงเท่าตัวเล่น รายชื่อยาวเลื่อนในกล่องเอง */}
          <aside className="relative min-h-0">
            <div className="space-y-2 xl:absolute xl:inset-0 xl:overflow-y-auto xl:pr-1">
              {info.cameras.includes("front") && (
                <>
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
                    <ol className="grid divide-y rounded-lg border text-sm sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-1 xl:divide-y">
                      {faces.map((face) => (
                        <li
                          key={face.n}
                          className="flex items-start gap-2 px-3 py-2"
                        >
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
                                  {KIND[face.kind].label &&
                                    ` · ${KIND[face.kind].label}`}
                                </span>
                              </>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className="text-xs text-gray-500">
                    กรอบอัปเดตทุก 1 วินาที อาจช้ากว่าภาพเล็กน้อย
                  </p>
                </>
              )}
              <p className="border-t pt-2 text-xs text-gray-500">
                ไม่มีเสียง · มีการบันทึกการเปิดดูสด ดูย้อนหลัง
                และดาวน์โหลดทุกครั้ง
                {info.expiresOn &&
                  ` · ระบบจะลบไฟล์ของคาบนี้ตั้งแต่ ${formatDate(bangkokDate(new Date(info.expiresOn)))}`}
              </p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
