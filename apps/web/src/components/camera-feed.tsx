"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { API_URL, ApiError, apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { clock, gapAt, spanAt, type Span } from "@/lib/cctv";
import type { CameraKind, LiveTicket } from "@/lib/types";

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
const PERMANENT = [
  "NOT_LIVE",
  "NO_CAMERA",
  "SESSION_NOT_FOUND",
  "MEDIA_NOT_CONFIGURED",
];
// ภาพคลาดจากเวลาบนแถบเกินนี้ค่อยกระโดดตาม เล่นต่อเนื่องคลาดกันเล็กน้อยได้
const DRIFT_S = 1.5;
// ตอนหยุดหรือกรอ ภาพห่างจากเวลาบนแถบเกินนี้ค่อยขยับ
const SCRUB_S = 0.3;
const LINK_DELAY_MS = 150;
// ช่วงที่มีภาพยาวขึ้นเกินลิงก์เดิมเท่านี้ ขอลิงก์ใหม่ (ระหว่างคาบไฟล์อัดยาวขึ้นเรื่อย ๆ)
const GROWN_MS = 2000;

type Clip = { from: number; to: number; src: string };

// ภาพจากกล้องหนึ่งตัวในตัวเล่น: ตอนสดต่อ WebRTC ตอนย้อนหลังเล่น HLS ตามเวลาบนแถบของตัวเล่น
export function CameraFeed({
  sessionId,
  camera,
  label,
  live,
  t,
  playing,
  speed,
  spans,
  seekId,
  ready,
  badge,
  onLive,
  onStall,
  onToggleLayout,
  children,
}: {
  sessionId: string;
  camera: CameraKind;
  label: string;
  // ตัวเล่นอยู่ในโหมดสด
  live: boolean;
  // เวลาที่ต้องแสดงตอนย้อนหลัง
  t: number;
  playing: boolean;
  speed: number;
  spans: Span[];
  // เพิ่มทุกครั้งที่ผู้ใช้เลือกเวลาใหม่ ช่วงที่เคยเปิดไม่ได้จะลองใหม่
  seekId: number;
  // reader.js ของ MediaMTX โหลดเสร็จแล้ว
  ready: boolean;
  // ป้ายมุมซ้ายตอนย้อนหลัง
  badge: string;
  onLive?: (live: boolean) => void;
  // กำลังรอภาพ ตัวเล่นหยุดเดินเวลารอ
  onStall: (camera: CameraKind, stalled: boolean) => void;
  onToggleLayout: () => void;
  // ของที่วางทับภาพ แสดงเฉพาะตอนดูสด เช่นกรอบหน้า
  children?: ReactNode;
}) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [liveState, setLiveState] = useState<
    "connecting" | "playing" | "reconnecting" | "stopped"
  >("connecting");
  const [liveError, setLiveError] = useState<string | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState<{
    from: number;
    seekId: number;
    message: string;
  } | null>(null);

  const tRef = useRef(t);
  const seekRef = useRef(seekId);
  useEffect(() => {
    tRef.current = t;
    seekRef.current = seekId;
  });

  const showingLive = live && liveState === "playing";
  useEffect(() => onLive?.(showingLive), [showingLive, onLive]);

  // ---------- สด ----------
  // token ใช้ได้แค่ตอนเริ่มต่อ หลุดเมื่อไหร่ขอ token ใหม่แล้วต่อใหม่
  useEffect(() => {
    if (!live || !ready || !window.MediaMTXWebRTCReader) return;
    const ReaderClass = window.MediaMTXWebRTCReader;
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
        reader = new ReaderClass({
          url: ticket.whepUrl,
          token: ticket.token,
          onError: () => {
            reader?.close();
            reader = null;
            if (closed) return;
            setLiveState("reconnecting");
            timer = setTimeout(() => void connect(), RETRY_MS);
          },
          onTrack: (evt) => {
            if (el) el.srcObject = evt.streams[0];
            setLiveError(null);
            setLiveState("playing");
          },
        });
      } catch (e) {
        if (closed) return;
        if (
          e instanceof ApiError &&
          (PERMANENT.includes(e.code) || e.status === 403)
        ) {
          setLiveState("stopped");
          setLiveError(e.message);
          return;
        }
        setLiveError(await handleApiError(e, router));
        setLiveState("reconnecting");
        timer = setTimeout(() => void connect(), RETRY_MS);
      }
    }

    void connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      reader?.close();
      if (el) el.srcObject = null;
      setLiveState("connecting");
    };
  }, [live, ready, sessionId, camera, router]);

  // ---------- ย้อนหลัง ----------
  const span = live ? null : spanAt(spans, t);
  const blocked =
    !!span && failed?.from === span.from && failed.seekId === seekId;
  // ลิงก์หนึ่งครอบทั้งช่วงที่มีภาพ กรอในช่วงเดียวกันไม่ต้องขอลิงก์ใหม่
  const needKey =
    span &&
    !blocked &&
    (!clip ||
      clip.from !== span.from ||
      (span.to > clip.to + GROWN_MS && t >= clip.to - 1000))
      ? `${span.from}:${span.to}`
      : null;

  // ระบบบันทึกการเปิดดูย้อนหลังทุกครั้งที่ออกลิงก์ รอแป๊บก่อนขอ ลากแถบผ่านหลายช่วงเร็ว ๆ จะได้ไม่ขอทุกช่วง
  useEffect(() => {
    if (!needKey) return;
    const [from, to] = needKey.split(":").map(Number);
    let cancelled = false;
    const timer = setTimeout(() => void request(), LINK_DELAY_MS);
    const request = () =>
      apiFetch<{ url: string }>(`/sessions/${sessionId}/recording/link`, {
        method: "POST",
        body: JSON.stringify({
          start: new Date(from).toISOString(),
          duration: (to - from) / 1000,
          download: false,
          camera,
        }),
      })
        .then(({ url }) => {
          if (!cancelled)
            setClip({ from, to, src: `${API_URL}${url}/index.m3u8` });
        })
        .catch(async (e: unknown) => {
          const message = await handleApiError(e, router);
          if (!cancelled)
            setFailed({
              from,
              seekId: seekRef.current,
              message: message ?? "เปิดภาพย้อนหลังไม่ได้",
            });
        });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needKey, sessionId, camera, router]);

  useEffect(() => {
    const el = video.current;
    if (live || !clip || !el) return;
    const jump = () => {
      el.currentTime = Math.max(0, (tRef.current - clip.from) / 1000);
    };
    // ตอนกรอ ภาพโหลดไม่ทันตำแหน่งที่ลาก โหลดเสร็จแล้วไปต่อที่ตำแหน่งล่าสุด
    const catchUp = () => {
      const want = (tRef.current - clip.from) / 1000;
      if (el.paused && want >= 0 && Math.abs(el.currentTime - want) > SCRUB_S)
        el.currentTime = want;
    };
    const onWaiting = () => setWaiting(true);
    const onReady = () => {
      setWaiting(false);
      setReadySrc(clip.src);
    };
    el.addEventListener("loadedmetadata", jump, { once: true });
    el.addEventListener("seeked", catchUp);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("canplay", onReady);
    el.addEventListener("playing", onReady);
    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        // ลิงก์หมดอายุ ขอใหม่เอง
        if (data.response?.code === 401) return setClip(null);
        setFailed({
          from: clip.from,
          seekId: seekRef.current,
          message: "เล่นภาพย้อนหลังไม่ได้ ลองเลือกเวลาใหม่",
        });
        setClip(null);
      });
      hls.loadSource(clip.src);
      hls.attachMedia(el);
    } else {
      // Safari รุ่นเก่าที่ไม่มี MSE เล่น HLS เองได้
      el.src = clip.src;
    }
    return () => {
      el.removeEventListener("loadedmetadata", jump);
      el.removeEventListener("seeked", catchUp);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("canplay", onReady);
      el.removeEventListener("playing", onReady);
      hls?.destroy();
      el.removeAttribute("src");
      el.load();
    };
  }, [clip, live]);

  // ให้ภาพตามเวลาบนแถบ ความเร็ว และปุ่มเล่น/หยุดของตัวเล่น
  const clipReady =
    !!clip && !!span && clip.from === span.from && readySrc === clip.src;
  useEffect(() => {
    const el = video.current;
    if (live || !el) return;
    if (!clipReady || !clip) {
      if (!el.paused) el.pause();
      return;
    }
    const want = (t - clip.from) / 1000;
    // ระหว่างกำลังไปตำแหน่งก่อนหน้ายังไม่ขยับ รอ seeked แล้วค่อยตาม (ภาพตอนกรอเปลี่ยนเร็วสุดเท่าที่โหลดทัน)
    if (
      !el.seeking &&
      Math.abs(el.currentTime - want) > (playing ? DRIFT_S : SCRUB_S)
    )
      el.currentTime = want;
    el.playbackRate = speed;
    if (playing && el.paused) void el.play().catch(() => {});
    if (!playing && !el.paused) el.pause();
  }, [live, clipReady, clip, t, playing, speed]);

  const stalled = !live && !!span && !blocked && (!clipReady || waiting);
  useEffect(() => onStall(camera, stalled), [camera, stalled, onStall]);
  useEffect(() => () => onStall(camera, false), [camera, onStall]);

  let cover: ReactNode = null;
  if (live) {
    if (liveState !== "playing")
      cover =
        liveState === "stopped"
          ? (liveError ?? "ไม่มีภาพจากกล้อง")
          : liveState === "reconnecting"
            ? "ภาพหลุด กำลังต่อใหม่..."
            : "กำลังต่อกล้อง...";
  } else if (!span) {
    const gap = gapAt(spans, t);
    cover = gap ? (
      <>
        <b className="font-medium text-white">ไม่มีภาพช่วงนี้</b>
        <span>
          กล้องหลุด {clock(gap.from)}–{clock(gap.to)}
        </span>
      </>
    ) : (
      <b className="font-medium text-white">ไม่มีภาพช่วงนี้</b>
    );
  } else if (blocked) {
    cover = failed?.message;
  }

  return (
    // คงสัดส่วน 16:9 ไว้ กรอบหน้าจะได้ตรงกับภาพ
    <figure
      className="cctv-tile relative m-0 aspect-video w-full select-none bg-black"
      onDoubleClick={onToggleLayout}
      title="ดับเบิลคลิกเพื่อสลับมุมมอง"
    >
      {/* ปิดปุ่มลอยของเบราว์เซอร์ (ภาพซ้อนภาพ) ที่บังภาพตอนชี้เมาส์ */}
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        disablePictureInPicture
        className="absolute inset-0 h-full w-full"
      />
      {showingLive && children}
      <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
        {live ? (
          <>
            <span
              className={`h-2 w-2 rounded-full ${showingLive ? "bg-red-500" : "bg-gray-400"}`}
            />
            สด
          </>
        ) : (
          badge
        )}
      </span>
      <figcaption className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {label}
      </figcaption>
      {cover ? (
        <p className="absolute inset-0 m-0 flex flex-col items-center justify-center gap-1 bg-[#0a0c10] p-4 text-center text-sm text-gray-400">
          {cover}
        </p>
      ) : (
        stalled && (
          <p className="absolute inset-x-0 bottom-10 m-0 text-center text-xs text-white/80">
            กำลังโหลดภาพ...
          </p>
        )
      )}
    </figure>
  );
}
