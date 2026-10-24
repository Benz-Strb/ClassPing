"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { formatTime } from "@/lib/time";
import type { LiveSession, LiveTicket } from "@/lib/types";
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

      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        <video ref={video} autoPlay muted playsInline className="h-full w-full" />
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
      {error && <p className="text-red-600">{error}</p>}
      <p className="text-sm text-gray-500">ไม่มีเสียง · มีการบันทึกการเปิดดูทุกครั้ง</p>
    </section>
  );
}
