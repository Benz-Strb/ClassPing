"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_URL, apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { bangkokDate, formatDate, formatTime } from "@/lib/time";
import type { Recording } from "@/lib/types";
import { ExamBadge } from "./exam-badge";
import { HlsVideo } from "./hls-video";

type Segment = Recording["segments"][number];

const endOf = (seg: Segment) => new Date(Date.parse(seg.start) + seg.duration * 1000).toISOString();

function length(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes < 1 ? "ไม่ถึง 1 นาที" : `${minutes} นาที`;
}

export function RecordingView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [data, setData] = useState<Recording | null>(null);
  const [playing, setPlaying] = useState<{ start: string; src: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Recording>(`/sessions/${sessionId}/recording`)
      .then(setData)
      .catch(async (e: unknown) => setError(await handleApiError(e, router)));
  }, [sessionId, router]);

  // ลิงก์อายุสั้นจาก API ทุกครั้งที่เปิด ระบบบันทึกว่าใครเปิดดู/ดาวน์โหลด
  async function open(seg: Segment, download: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(`/sessions/${sessionId}/recording/link`, {
        method: "POST",
        body: JSON.stringify({ start: seg.start, duration: seg.duration, download }),
      });
      if (download) {
        // API ตอบเป็นไฟล์แนบ เบราว์เซอร์ดาวน์โหลดโดยไม่ออกจากหน้านี้
        const link = document.createElement("a");
        link.href = `${API_URL}${url}`;
        link.click();
      } else {
        setPlaying({ start: seg.start, src: `${API_URL}${url}/index.m3u8` });
      }
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <p className="text-red-600">{error}</p> : <p>กำลังโหลด...</p>;
  const { session } = data;

  return (
    <section className="space-y-4">
      <Link href="/live" className="text-sm text-blue-600 underline">
        กล้องทั้งหมด
      </Link>
      <h1 className="text-xl font-semibold">
        {session.courseCode} {session.courseName}{" "}
        <span className="font-normal text-gray-600">
          {formatDate(bangkokDate(new Date(session.startsAt)))} {formatTime(session.startsAt)}-
          {formatTime(session.endsAt)} · {session.roomName}
        </span>{" "}
        {session.kind === "exam" && <ExamBadge title={session.title} />}
      </h1>

      {playing && <HlsVideo key={playing.src} src={playing.src} onError={setError} />}

      {data.segments.length === 0 ? (
        <p className="text-gray-600">ไม่มีไฟล์อัดของคาบนี้</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.segments.map((seg) => (
            <li key={seg.start} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span>
                {formatTime(seg.start)}-{formatTime(endOf(seg))}{" "}
                <span className="text-sm text-gray-500">({length(seg.duration)})</span>
              </span>
              {playing?.start === seg.start && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                  กำลังเล่น
                </span>
              )}
              <span className="ml-auto space-x-3 text-sm">
                <button
                  disabled={busy}
                  onClick={() => void open(seg, false)}
                  className="text-blue-600 hover:underline disabled:opacity-50"
                >
                  เล่น
                </button>
                {data.canDownload && (
                  <button
                    disabled={busy}
                    onClick={() => void open(seg, true)}
                    className="text-blue-600 hover:underline disabled:opacity-50"
                  >
                    ดาวน์โหลด
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-red-600">{error}</p>}
      <p className="text-sm text-gray-500">
        ไฟล์แบ่งเป็นช่วงตามที่กล้องต่ออยู่ ไม่มีเสียง · มีการบันทึกทุกครั้งที่เปิดดูหรือดาวน์โหลด
        {data.expiresOn &&
          ` · ระบบจะลบไฟล์ของคาบนี้ตั้งแต่ ${formatDate(bangkokDate(new Date(data.expiresOn)))}`}
      </p>
    </section>
  );
}
