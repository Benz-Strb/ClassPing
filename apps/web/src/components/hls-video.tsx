"use client";

import Hls from "hls.js";
import { useEffect, useRef } from "react";

// ดูย้อนหลังแบบ HLS: โหลดทีละท่อนตามที่เล่นถึงหรือกรอไป ไม่โหลดทั้งคลิป
export function HlsVideo({ src, onError }: { src: string; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    // Safari รุ่นเก่าที่ไม่มี MSE เล่น HLS เองได้
    if (!Hls.isSupported()) {
      el.src = src;
      return;
    }
    const hls = new Hls();
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      hls.destroy();
      onError(
        data.response?.code === 401
          ? "ลิงก์หมดอายุแล้ว กดเล่นใหม่อีกครั้ง"
          : "เล่นวิดีโอไม่ได้ ลองกดเล่นใหม่อีกครั้ง",
      );
    });
    hls.loadSource(src);
    hls.attachMedia(el);
    return () => hls.destroy();
  }, [src, onError]);

  return (
    <video
      ref={video}
      controls
      autoPlay
      playsInline
      className="aspect-video w-full rounded-lg bg-black"
    />
  );
}
