"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { API_URL, ApiError, apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { CameraKind, LiveTicket, Recording } from "@/lib/types";

// มาจาก /mediamtx/reader.js ของ MediaMTX (โหลดที่หน้าแม่)
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
// ลองใหม่ก็ไม่หาย หยุดต่อแล้วบอกผู้ใช้
const PERMANENT = ["NOT_LIVE", "NO_CAMERA", "SESSION_NOT_FOUND", "MEDIA_NOT_CONFIGURED"];
// ลากไปใกล้ปลายแถบไม่เกินนี้ ถือว่ากลับไปดูสด (ภาพอัดช้ากว่าสดราว 1-2 วิ)
const LIVE_EDGE_MS = 5000;
const HOUR_MS = 60 * 60 * 1000;

// HH:mm:ss เวลาไทย
function clock(ms: number) {
  return new Date(ms + 7 * HOUR_MS).toISOString().slice(11, 19);
}

type Span = { from: number; to: number };

// กล้องหนึ่งตัวแบบกล้องวงจรปิด: ดูสดผ่าน WebRTC ลากแถบเวลาย้อนไปดูภาพที่อัดไว้ (HLS) แล้วกดกลับมาสดได้
export function CameraTile({
  sessionId,
  camera,
  label,
  ready,
  onLive,
  children,
}: {
  sessionId: string;
  camera: CameraKind;
  label: string;
  // reader.js ของ MediaMTX โหลดเสร็จแล้ว
  ready: boolean;
  // กำลังแสดงภาพสดอยู่หรือไม่ (หน้าแม่ใช้ตัดสินว่าจะดึงกรอบหน้าหรือเปล่า)
  onLive?: (live: boolean) => void;
  // ของที่วางทับภาพ แสดงเฉพาะตอนดูสด เช่นกรอบหน้า
  children?: ReactNode;
}) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"live" | "replay">("live");
  const [state, setState] = useState<"connecting" | "playing" | "reconnecting" | "stopped">(
    "connecting",
  );
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [start, setStart] = useState<number | null>(null);
  const [replay, setReplay] = useState<{ from: number; src: string } | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);

  const live = mode === "live" && state === "playing";
  useEffect(() => onLive?.(live), [live, onLive]);

  // ปลายแถบคือเวลาตอนนี้ เดินไปเรื่อย ๆ แบบไลฟ์ YouTube
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ต้นแถบ = ภาพแรกที่อัดไว้ของคาบนี้
  useEffect(() => {
    let cancelled = false;
    void spans().then((list) => !cancelled && setStart(list[0]?.from ?? null)).catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, camera]);

  async function spans(): Promise<Span[]> {
    const data = await apiFetch<Recording>(`/sessions/${sessionId}/recording?camera=${camera}`);
    return data.segments.map((s) => {
      const from = Date.parse(s.start);
      return { from, to: from + s.duration * 1000 };
    });
  }

  // ดูสด: token ใช้ได้แค่ตอนเริ่มต่อ หลุดเมื่อไหร่ขอ token ใหม่แล้วต่อใหม่
  useEffect(() => {
    if (mode !== "live" || !ready || !window.MediaMTXWebRTCReader) return;
    const Reader = window.MediaMTXWebRTCReader;
    const el = video.current;
    let reader: Reader | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    async function connect() {
      try {
        const ticket = await apiFetch<LiveTicket>(
          `/sessions/${sessionId}/live?camera=${camera}`,
          { method: "POST" },
        );
        if (closed) return;
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
            if (el) el.srcObject = evt.streams[0];
            setError(null);
            setState("playing");
          },
        });
      } catch (e) {
        if (closed) return;
        if (e instanceof ApiError && (PERMANENT.includes(e.code) || e.status === 403)) {
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
      if (el) el.srcObject = null;
    };
  }, [mode, ready, sessionId, camera, router]);

  // ดูย้อนหลัง: ตัวเล่นขอทีละท่อนจาก API เล่นจนสุดภาพที่อัดไว้แล้วกลับไปสดเอง
  useEffect(() => {
    const el = video.current;
    if (mode !== "replay" || !replay || !el) return;
    const from = replay.from;
    const update = () => setPosition(from + el.currentTime * 1000);
    const ended = () => {
      setState("connecting");
      setMode("live");
    };
    const pause = () => setPaused(el.paused);
    el.addEventListener("timeupdate", update);
    el.addEventListener("ended", ended);
    el.addEventListener("play", pause);
    el.addEventListener("pause", pause);
    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setError(
          data.response?.code === 401
            ? "ลิงก์หมดอายุแล้ว ลากแถบเวลาใหม่อีกครั้ง"
            : "เล่นภาพย้อนหลังไม่ได้ ลองลากแถบเวลาใหม่",
        );
        ended();
      });
      hls.loadSource(replay.src);
      hls.attachMedia(el);
    } else {
      // Safari รุ่นเก่าที่ไม่มี MSE เล่น HLS เองได้
      el.src = replay.src;
    }
    void el.play().catch(() => {});
    return () => {
      el.removeEventListener("timeupdate", update);
      el.removeEventListener("ended", ended);
      el.removeEventListener("play", pause);
      el.removeEventListener("pause", pause);
      hls?.destroy();
      el.removeAttribute("src");
      el.load();
    };
  }, [mode, replay]);

  function goLive() {
    if (mode !== "live") setState("connecting");
    setReplay(null);
    setPosition(null);
    setPaused(false);
    setMode("live");
  }

  // ระบบบันทึกการเปิดดูย้อนหลังทุกครั้งที่ปล่อยแถบเวลา
  async function seek(at: number) {
    if (at >= Date.now() - LIVE_EDGE_MS) return goLive();
    setBusy(true);
    setError(null);
    try {
      const list = await spans();
      setStart(list[0]?.from ?? null);
      // ตรงนั้นกล้องหลุด ข้ามไปช่วงถัดไปที่มีภาพ
      const span = list.find((s) => at < s.to);
      const from = span ? Math.max(at, span.from) : null;
      if (!span || from === null || span.to - from < 2000) return goLive();
      const { url } = await apiFetch<{ url: string }>(`/sessions/${sessionId}/recording/link`, {
        method: "POST",
        body: JSON.stringify({
          start: new Date(from).toISOString(),
          duration: (span.to - from) / 1000,
          download: false,
          camera,
        }),
      });
      setReplay({ from, src: `${API_URL}${url}/index.m3u8` });
      setPosition(from);
      setPaused(false);
      setMode("replay");
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setBusy(false);
    }
  }

  function commit() {
    if (drag === null) return;
    const at = drag;
    setDrag(null);
    void seek(at);
  }

  const min = start ?? now - 1000;
  const shown = drag ?? (mode === "replay" ? (position ?? now) : now);
  const behind = Math.max(0, now - shown);

  return (
    <figure className="camera-tile space-y-2">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        <video ref={video} autoPlay muted playsInline className="h-full w-full" />
        {live && children}
        <figcaption className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {label}
        </figcaption>
        {mode === "live" && state !== "playing" && (
          <p className="absolute inset-0 flex items-center justify-center text-white">
            {state === "stopped"
              ? (error ?? "ไม่มีภาพจากกล้อง")
              : state === "reconnecting"
                ? "ภาพหลุด กำลังต่อใหม่..."
                : "กำลังต่อกล้อง..."}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm">
        {mode === "replay" && (
          <button
            type="button"
            onClick={() => {
              const el = video.current;
              if (!el) return;
              if (el.paused) void el.play();
              else el.pause();
            }}
            className="w-14 rounded border px-2 py-0.5"
          >
            {paused ? "เล่น" : "หยุด"}
          </button>
        )}
        <span className="w-16 tabular-nums text-gray-700">{clock(shown)}</span>
        <input
          type="range"
          aria-label={`แถบเวลา${label}`}
          className="min-w-0 flex-1 accent-red-600"
          min={min}
          max={now}
          step={1000}
          value={Math.min(Math.max(shown, min), now)}
          disabled={start === null || busy || state === "stopped"}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
        />
        {mode === "live" ? (
          <span className="flex items-center gap-1 font-semibold text-red-600">
            <span className="h-2 w-2 rounded-full bg-red-600" />
            สด
          </span>
        ) : (
          <button
            type="button"
            onClick={goLive}
            className="flex items-center gap-1 rounded border px-2 py-0.5 text-gray-700"
          >
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            กลับไปสด
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500">
        {start === null
          ? "ยังไม่มีภาพที่อัดไว้ ย้อนดูไม่ได้"
          : mode === "replay"
            ? `ช้ากว่าสด ${behind < 60000 ? `${Math.round(behind / 1000)} วินาที` : `${Math.floor(behind / 60000)} นาที`}`
            : "ลากแถบเวลาเพื่อย้อนดู"}
        {error && state !== "stopped" && <span className="ml-2 text-red-600">{error}</span>}
      </p>
    </figure>
  );
}
