"use client";

import { useRef, useState, type PointerEvent } from "react";
import { clock, ticks, type Span } from "@/lib/cctv";

export interface TimelineTrack {
  key: string;
  label: string;
  spans: Span[];
  color: string;
}

// แถบเวลาเส้นเดียวของทุกกล้อง: แต่ละกล้องมีแถวของตัวเอง ช่วงที่มีภาพเป็นแถบสี ช่องว่างคือกล้องหลุด
export function CctvTimeline({
  range,
  tracks,
  t,
  edge,
  ended,
  disabled,
  onScrub,
  onSeek,
}: {
  range: Span;
  tracks: TimelineTrack[];
  // เวลาที่หัวอ่านอยู่
  t: number;
  // เวลาล่าสุดที่เลือกได้ ระหว่างคาบคือตอนนี้
  edge: number;
  ended: boolean;
  disabled: boolean;
  // ระหว่างลาก (null = ปล่อยแล้ว)
  onScrub: (t: number | null) => void;
  onSeek: (t: number) => void;
}) {
  const lanes = useRef<HTMLDivElement>(null);
  const firstBar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const dragging = useRef(false);
  const length = range.to - range.from;
  const pct = (x: number) => Math.min(100, Math.max(0, ((x - range.from) / length) * 100));

  function timeAt(clientX: number) {
    const bar = firstBar.current?.getBoundingClientRect();
    const box = lanes.current?.getBoundingClientRect();
    if (!bar || !box) return null;
    const f = Math.min(1, Math.max(0, (clientX - bar.left) / bar.width));
    const at = Math.min(range.from + f * length, edge);
    return { t: at, x: bar.left - box.left + ((at - range.from) / length) * bar.width };
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (disabled || !(e.target as HTMLElement).closest("[data-bar]")) return;
    const at = timeAt(e.clientX);
    if (!at) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setHover(at);
    onScrub(at.t);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const onBar = (e.target as HTMLElement).closest("[data-bar]");
    if (!dragging.current && !onBar) return setHover(null);
    const at = timeAt(e.clientX);
    if (!at) return;
    setHover(at);
    if (dragging.current) onScrub(at.t);
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    const at = timeAt(e.clientX);
    onScrub(null);
    if (at) onSeek(at.t);
  }

  return (
    <div className="px-3 pb-3 pt-1.5">
      <div className="relative ml-[76px] h-[18px] font-mono text-[11px] text-gray-400 max-sm:ml-[60px]">
        {ticks(range).map((tick) => (
          <span
            key={tick}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${pct(tick)}%` }}
          >
            {clock(tick).slice(0, 5)}
          </span>
        ))}
      </div>
      <div
        ref={lanes}
        className="relative touch-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={() => !dragging.current && setHover(null)}
      >
        {tracks.map((track, i) => (
          <div key={track.key} className="flex h-[22px] items-center gap-2">
            <span className="w-[68px] shrink-0 whitespace-nowrap text-right text-xs text-gray-400 max-sm:w-[52px]">
              {track.label}
            </span>
            <div
              ref={i === 0 ? firstBar : undefined}
              data-bar
              className={`relative h-3 flex-1 overflow-hidden rounded-sm bg-[#232a38] ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
              {track.spans.map((s) => (
                <div
                  key={s.from}
                  className="absolute inset-y-0"
                  style={{
                    left: `${pct(s.from)}%`,
                    width: `${pct(s.to) - pct(s.from)}%`,
                    background: track.color,
                  }}
                />
              ))}
              {!ended && (
                <div
                  className="absolute inset-y-0 right-0 bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgba(255,255,255,.06)_4px_8px)]"
                  style={{ left: `${pct(edge)}%` }}
                />
              )}
            </div>
          </div>
        ))}
        <div
          className="pointer-events-none absolute -bottom-1 -top-1 left-[76px] right-0 max-sm:left-[60px]"
          aria-hidden
        >
          <div
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white"
            style={{ left: `${pct(t)}%` }}
          />
        </div>
        {hover && (
          <span
            className="pointer-events-none absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded bg-black px-1.5 py-0.5 font-mono text-[11px] text-white"
            style={{ left: hover.x }}
          >
            {clock(hover.t)}
          </span>
        )}
      </div>
      <p className="mb-0 ml-[76px] mt-2 text-xs text-gray-400 max-sm:ml-[60px]">
        คลิกหรือลากแถบเพื่อย้อนดู · ช่องว่างคือช่วงที่กล้องหลุด · Space เล่น/หยุด · ←/→ ทีละ 10
        วินาที
      </p>
    </div>
  );
}
