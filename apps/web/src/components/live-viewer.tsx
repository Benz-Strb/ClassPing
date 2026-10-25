"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { formatTime } from "@/lib/time";
import type { LiveFaces, LiveSession, LiveTicket } from "@/lib/types";
import { ExamBadge } from "./exam-badge";

// มาจาก /mediamtx/reader.js ของ MediaMTX
interface Reader {
  close(): void;
}
declare global {
  interface Window {
    MediaMTXWebRTCReader?: new (conf: {
      url: string;
      token: string;
      onError: (err: string) => void;
      onTrack: (evt: RTCTrackEvent) => void;
    }) => Reader;
  }
}

const RETRY_MS = 3000;
// กล้องตรวจหน้าวินาทีละครั้ง
const FACES_MS = 1000;

const KIND = {
  match: { label: "", box: "border-green-400", tag: "bg-green-500" },
  review: { label: "ไม่แน่ใจ", box: "border-yellow-300", tag: "bg-yellow-500" },
  unknown: { label: "ไม่รู้จัก", box: "border-gray-300", tag: "bg-gray-500" },
};

export function LiveViewer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [state, setState] = useState<"connecting" | "playing" | "reconnecting" | "stopped">(
    "connecting",
  );
  const [error, setError] = useState<string | null>(null);
  const [faces, setFaces] = useState<LiveFaces["faces"]>([]);
  const [showBoxes, setShowBoxes] = useState(true);

  useEffect(() => {
    if (!ready || !window.MediaMTXWebRTCReader) return;
    const Reader = window.MediaMTXWebRTCReader;
    let reader: Reader | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    // token ใช้ได้แค่ตอนเริ่มต่อ หลุดเมื่อไหร่ขอ token ใหม่แล้วต่อใหม่
    async function connect() {
      try {
        const ticket = await apiFetch<LiveTicket>(`/sessions/${sessionId}/live`, {
          method: "POST",
        });
        if (closed) return;
        setSession(ticket.session);
        reader = new Reader({
          url: ticket.whepUrl,
          token: ticket.token,
          onError: () => {
            reader?.close();
            reader = null;
            if (closed) return;
            setState("reconnecting");
            timer = setTimeout(() => void connect(), RETRY_MS);
          },
          onTrack: (evt) => {
            if (video.current) video.current.srcObject = evt.streams[0];
            setState("playing");
          },
        });
      } catch (e) {
        if (closed) return;
        if (e instanceof ApiError && (e.code === "NOT_LIVE" || e.code === "NO_CAMERA")) {
          setState("stopped");
          setError(e.message);
          return;
        }
        setError(await handleApiError(e, router));
        setState("reconnecting");
        timer = setTimeout(() => void connect(), RETRY_MS);
      }
    }

    void connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      reader?.close();
    };
  }, [ready, sessionId, router]);

  // กรอบหน้ามาจากการตรวจเช็คชื่อ อาจช้ากว่าภาพเล็กน้อย
  useEffect(() => {
    if (state !== "playing") return;
    let stop = false;
    const load = () =>
      apiFetch<LiveFaces>(`/sessions/${sessionId}/live/faces`)
        .then((data) => !stop && setFaces(data.faces))
        .catch(() => !stop && setFaces([]));
    void load();
    const timer = setInterval(() => void load(), FACES_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [state, sessionId]);

  return (
    <section className="space-y-4">
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
          "กล้องหน้าห้อง"
        )}
      </h1>

      <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
          <video ref={video} autoPlay muted playsInline className="h-full w-full" />
          {state === "playing" &&
            showBoxes &&
            faces.map((face) => (
              <div
                key={face.n}
                className={`absolute border-2 ${KIND[face.kind].box}`}
                style={{
                  left: `${face.box[0] * 100}%`,
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
            ))}
          {state !== "playing" && (
            <p className="absolute inset-0 flex items-center justify-center text-white">
              {state === "stopped"
                ? "ไม่มีภาพจากกล้อง"
                : state === "reconnecting"
                  ? "ภาพหลุด กำลังต่อใหม่..."
                  : "กำลังต่อกล้อง..."}
            </p>
          )}
        </div>

        <aside className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">คนในภาพ</h2>
            <label className="flex items-center gap-1 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showBoxes}
                onChange={(e) => setShowBoxes(e.target.checked)}
              />
              แสดงกรอบ
            </label>
          </div>
          {faces.length === 0 ? (
            <p className="text-sm text-gray-500">ยังไม่เห็นใครในภาพ</p>
          ) : (
            <ol className="divide-y rounded-lg border text-sm">
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
      </div>
      {error && <p className="text-red-600">{error}</p>}
      <p className="text-sm text-gray-500">ไม่มีเสียง · มีการบันทึกการเปิดดูทุกครั้ง</p>
    </section>
  );
}
