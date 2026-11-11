"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { API_URL, apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import {
  LIVE_EDGE_MS,
  behindText,
  clock,
  spanAt,
  timelineRange,
  toSpans,
  type Span,
} from "@/lib/cctv";
import type { CameraKind, Recording } from "@/lib/types";
import { CameraFeed } from "./camera-feed";
import { CctvTimeline } from "./cctv-timeline";

const LABEL: Record<CameraKind, string> = {
  front: "กล้องหน้าห้อง",
  door: "กล้องประตู",
};
const SHORT: Record<CameraKind, string> = { front: "หน้าห้อง", door: "ประตู" };
const COLOR: Record<CameraKind, string> = { front: "#3b82f6", door: "#14b8a6" };
const SPEEDS = [1, 2, 4, 8, 16];
const TICK_MS = 250;
// ระหว่างคาบไฟล์อัดยาวขึ้นเรื่อย ๆ ดึงรายการช่วงใหม่ทุกเท่านี้
const REFRESH_MS = 30_000;
// กดหยุดตอนดูสด ภาพอัดช้ากว่าสดเล็กน้อย ถอยไปเท่านี้ให้มีภาพแน่
const PAUSE_BACK_MS = 3000;
const STEP_MS = 10_000;

type Mode = "live" | "replay";

// ตัวเล่นกล้องวงจรปิดของคาบ: ดูสดและย้อนหลังในตัวเดียว แถบเวลาเส้นเดียวคุมทุกกล้องให้เล่นเวลาเดียวกัน
export function CctvPlayer({
  sessionId,
  cameras,
  startsAt,
  endsAt,
  canDownload,
  ready,
  onFrontLive,
  frontOverlay,
}: {
  sessionId: string;
  cameras: CameraKind[];
  startsAt: number;
  endsAt: number;
  canDownload: boolean;
  // reader.js ของ MediaMTX โหลดเสร็จแล้ว
  ready: boolean;
  onFrontLive?: (live: boolean) => void;
  // วางทับภาพกล้องหน้าห้องตอนดูสด เช่นกรอบหน้า
  frontOverlay?: ReactNode;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const ended = now >= endsAt;
  // จบคาบแล้วเปิดมาที่ต้นคาบ ระหว่างคาบเปิดมาเป็นภาพสด
  const [mode, setMode] = useState<Mode>(() =>
    Date.now() >= endsAt ? "replay" : "live",
  );
  const [t, setT] = useState(() =>
    Date.now() >= endsAt ? startsAt : Date.now(),
  );
  const [playing, setPlaying] = useState(() => Date.now() < endsAt);
  const [speed, setSpeed] = useState(1);
  const [drag, setDrag] = useState<number | null>(null);
  const [single, setSingle] = useState<CameraKind | null>(null);
  const [spans, setSpans] = useState<Partial<Record<CameraKind, Span[]>>>({});
  const [stalls, setStalls] = useState<CameraKind[]>([]);
  const [seekId, setSeekId] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = single && cameras.includes(single) ? [single] : cameras;
  const range = timelineRange(
    startsAt,
    endsAt,
    cameras.map((c) => spans[c] ?? []),
  );
  const edge = ended ? range.to : now;
  const at = mode === "live" ? now : t;

  const loadSpans = useCallback(async () => {
    try {
      const lists = await Promise.all(
        cameras.map((camera) =>
          apiFetch<Recording>(
            `/sessions/${sessionId}/recording?camera=${camera}`,
          ).then((rec) => [camera, toSpans(rec.segments)] as const),
        ),
      );
      setSpans(Object.fromEntries(lists));
    } catch (e) {
      setMessage(await handleApiError(e, router));
    }
  }, [cameras, sessionId, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดครั้งแรก
    void loadSpans();
    if (ended) return;
    const timer = setInterval(() => void loadSpans(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadSpans, ended]);

  // นาฬิกาของตัวเล่น: ตอนย้อนหลังเดินตามความเร็ว หยุดรอเมื่อกล้องไหนกำลังโหลดภาพ
  const latest = useRef({
    mode,
    playing,
    speed,
    drag,
    stalls,
    spans,
    shown,
    range,
    endsAt,
  });
  useEffect(() => {
    latest.current = {
      mode,
      playing,
      speed,
      drag,
      stalls,
      spans,
      shown,
      range,
      endsAt,
    };
  });
  useEffect(() => {
    let last = performance.now();
    const timer = setInterval(() => {
      const step = performance.now() - last;
      last = performance.now();
      const wall = Date.now();
      setNow(wall);
      const s = latest.current;
      const isEnded = wall >= s.endsAt;
      if (s.mode === "live") {
        if (isEnded) {
          // คาบจบระหว่างดูสด เปลี่ยนเป็นดูย้อนหลังช่วงท้ายคาบ
          setMode("replay");
          setPlaying(false);
          setT(s.endsAt - 30_000);
          setMessage("คาบจบแล้ว กดเล่นหรือลากแถบเวลาเพื่อดูย้อนหลัง");
        }
        return;
      }
      if (!s.playing || s.drag !== null || s.stalls.length) return;
      setT((prev) => {
        let next = prev + step * s.speed;
        // ทุกกล้องไม่มีภาพตรงนี้ ข้ามไปช่วงถัดไปที่มีภาพ
        const lists = s.shown.map((c) => s.spans[c] ?? []);
        if (!lists.some((list) => spanAt(list, next))) {
          const ahead = lists
            .flat()
            .filter((x) => x.from > next)
            .map((x) => x.from);
          if (ahead.length) next = Math.min(...ahead);
        }
        if (!isEnded && next >= wall - LIVE_EDGE_MS) {
          setMode("live");
          setMessage("ตามทันภาพสดแล้ว");
          return wall;
        }
        if (isEnded && next >= s.range.to) {
          setPlaying(false);
          return s.range.to;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const onStall = useCallback((camera: CameraKind, stalled: boolean) => {
    setStalls((prev) => {
      if (prev.includes(camera) === stalled) return prev;
      return stalled ? [...prev, camera] : prev.filter((c) => c !== camera);
    });
  }, []);

  function goLive() {
    if (ended) return;
    setMode("live");
    setPlaying(true);
    setMessage(null);
  }

  function seek(target: number, play = true) {
    const x = Math.min(Math.max(target, range.from), edge);
    if (!ended && x >= Date.now() - LIVE_EDGE_MS) return goLive();
    setMode("replay");
    setT(x);
    setPlaying(play);
    setSeekId((n) => n + 1);
    setMessage(null);
    if (!ended) void loadSpans();
  }

  function togglePlay() {
    if (mode === "live") return seek(Date.now() - PAUSE_BACK_MS, false);
    // เล่นจนสุดคาบแล้ว กดเล่นอีกครั้งเริ่มจากต้นคาบ
    if (!playing && ended && t >= range.to - 1000) return seek(range.from);
    setPlaying(!playing);
  }

  // ดาวน์โหลดช่วงที่มีภาพตรงเวลานี้ทั้งช่วง ของทุกกล้องที่แสดงอยู่ ระบบบันทึกทุกครั้ง
  async function download() {
    const targets = shown.flatMap((camera) => {
      const list = spans[camera] ?? [];
      const span = spanAt(list, at) ?? (mode === "live" ? list.at(-1) : null);
      return span ? [{ camera, span }] : [];
    });
    if (!targets.length)
      return setMessage("ตรงนี้ไม่มีภาพให้ดาวน์โหลด เลือกเวลาที่มีแถบสี");
    setBusy(true);
    setMessage(null);
    try {
      for (const { camera, span } of targets) {
        const to = Math.min(span.to, Date.now());
        const { url } = await apiFetch<{ url: string }>(
          `/sessions/${sessionId}/recording/link`,
          {
            method: "POST",
            body: JSON.stringify({
              start: new Date(span.from).toISOString(),
              duration: (to - span.from) / 1000,
              download: true,
              camera,
            }),
          },
        );
        // API ตอบเป็นไฟล์แนบ เบราว์เซอร์ดาวน์โหลดโดยไม่ออกจากหน้านี้
        const link = document.createElement("a");
        link.href = `${API_URL}${url}`;
        link.click();
      }
      setMessage(
        `กำลังดาวน์โหลด ${targets.map(({ camera, span }) => `${SHORT[camera]} ${clock(span.from).slice(0, 5)}–${clock(Math.min(span.to, Date.now())).slice(0, 5)}`).join(", ")}`,
      );
    } catch (e) {
      setMessage(await handleApiError(e, router));
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest("select, input, textarea")) return;
    if (e.code === "Space" && !(e.target as HTMLElement).closest("button")) {
      e.preventDefault();
      togglePlay();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      seek(at - STEP_MS, mode === "live" || playing);
    } else if (e.code === "ArrowRight" && mode === "replay") {
      e.preventDefault();
      seek(t + STEP_MS, playing);
    }
  }

  const live = mode === "live" && drag === null;
  const showing = drag ?? at;
  const badge =
    drag !== null
      ? "กำลังกรอ"
      : playing
        ? `ย้อนหลัง ${speed}x`
        : "หยุดชั่วคราว";
  const button =
    "inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[#2c3446] bg-[#1b2130] px-2.5 text-sm text-gray-100 hover:border-[#4a556d] disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <section
      className="cctv-player overflow-hidden rounded-xl bg-[#11151c] text-gray-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      aria-label="ตัวเล่นกล้อง"
      tabIndex={0}
      onKeyDown={onKey}
    >
      {/* พื้นที่ภาพขนาดคงที่แบบจอ NVR สลับ 1 จอ/2 จอแล้วตัวเล่นไม่ยืดหด
          สูงไม่เกินจอ ปุ่มคุมกับแถบเวลาจะได้อยู่ในจอเสมอ จอแคบเรียงกล้องลงมาแทน */}
      <div className="mx-auto flex w-full max-w-[min(100%,max(320px,calc((100dvh_-_380px)*16/9)))] items-center bg-black md:aspect-video">
        <div
          className={`grid w-full gap-0.5 ${shown.length > 1 ? "md:grid-cols-2" : ""}`}
        >
          {shown.map((camera) => (
            <CameraFeed
              key={camera}
              sessionId={sessionId}
              camera={camera}
              label={LABEL[camera]}
              // ระหว่างลากแถบ ภาพเปลี่ยนตามตำแหน่งที่ลากแบบ YouTube ปล่อยแล้วค่อยเล่นต่อ
              live={live}
              t={showing}
              playing={playing && drag === null}
              speed={speed}
              spans={spans[camera] ?? []}
              seekId={seekId}
              ready={ready}
              badge={badge}
              onLive={camera === "front" ? onFrontLive : undefined}
              onStall={onStall}
              onToggleLayout={() =>
                cameras.length > 1 && setSingle(single ? null : camera)
              }
            >
              {camera === "front" && frontOverlay}
            </CameraFeed>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 pb-1 pt-2.5">
        <button type="button" onClick={togglePlay} className={button}>
          {live || playing ? (
            <svg
              viewBox="0 0 14 14"
              className="h-3.5 w-3.5 fill-current"
              aria-hidden
            >
              <rect x="2" y="2" width="3.5" height="10" />
              <rect x="8.5" y="2" width="3.5" height="10" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 14 14"
              className="h-3.5 w-3.5 fill-current"
              aria-hidden
            >
              <path d="M3 1.5v11l9-5.5z" />
            </svg>
          )}
          {live || playing ? "หยุด" : "เล่น"}
        </button>
        <select
          aria-label="ความเร็ว"
          className={button}
          value={live ? 1 : speed}
          disabled={live}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
        <span className="font-mono text-[15px] font-semibold tabular-nums">
          {clock(showing)}
        </span>
        {!live && !ended && (
          <span className="text-sm text-gray-400">
            {behindText(Math.max(0, now - showing))}
          </span>
        )}
        <span className="flex-1" />
        {cameras.length > 1 && (
          <span
            className="inline-flex overflow-hidden rounded-md border border-[#2c3446]"
            role="group"
            aria-label="รูปแบบหน้าจอ"
          >
            {[null, ...cameras].map((c) => (
              <button
                key={c ?? "all"}
                type="button"
                aria-pressed={single === c}
                onClick={() => setSingle(c)}
                className={`min-h-8 px-2.5 text-sm ${single === c ? "bg-[#2c3446] text-gray-100" : "bg-[#1b2130] text-gray-400"}`}
              >
                {c ? SHORT[c] : `${cameras.length} จอ`}
              </button>
            ))}
          </span>
        )}
        {canDownload && (
          <button
            type="button"
            onClick={() => void download()}
            disabled={busy}
            className={button}
          >
            ดาวน์โหลด
          </button>
        )}
        <button
          type="button"
          onClick={goLive}
          disabled={ended || live}
          aria-pressed={live}
          className={`${button} ${live ? "!border-red-600 !bg-red-600 !text-white !opacity-100" : ""}`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          {ended ? "คาบจบแล้ว" : live ? "สด" : "กลับไปสด"}
        </button>
      </div>

      <CctvTimeline
        range={range}
        tracks={cameras.map((c) => ({
          key: c,
          label: SHORT[c],
          spans: spans[c] ?? [],
          color: COLOR[c],
        }))}
        t={showing}
        edge={edge}
        ended={ended}
        disabled={!cameras.some((c) => spans[c]?.length)}
        onScrub={setDrag}
        onSeek={(x) => seek(x)}
      />
      <p
        className="m-0 min-h-5 px-3 pb-2.5 text-sm text-gray-400"
        aria-live="polite"
      >
        {message}
      </p>
    </section>
  );
}
