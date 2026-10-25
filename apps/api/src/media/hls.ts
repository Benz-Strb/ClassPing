// ดูย้อนหลังแบบ HLS: ตัวเล่นขอทีละท่อน API ดึงจาก MediaMTX เฉพาะท่อนที่ขอ ไม่ต้องโหลดทั้งคลิป
// ท่อนละ 6 วินาทีตามที่ Apple แนะนำ (HLS Authoring Specification) และเป็นทวีคูณของ keyframe ทุก 2 วิของกล้อง
export const SEGMENT_SECONDS = 6;
// ท่อนสุดท้ายสั้นกว่านี้รวมเข้าท่อนก่อนหน้า MediaMTX อาจไม่มีภาพให้ในช่วงสั้นมาก
const MIN_LAST_SECONDS = 1;

export interface HlsSegment {
  // วินาทีนับจากต้นคลิป
  offset: number;
  length: number;
}

export function hlsSegments(duration: number): HlsSegment[] {
  const list: HlsSegment[] = [];
  for (let offset = 0; offset < duration; offset += SEGMENT_SECONDS) {
    list.push({ offset, length: Math.min(SEGMENT_SECONDS, duration - offset) });
  }
  const last = list.at(-1);
  if (list.length > 1 && last && last.length < MIN_LAST_SECONDS) {
    list.pop();
    list[list.length - 1].length += last.length;
  }
  return list;
}

export function hlsPlaylist(duration: number): string {
  const segments = hlsSegments(duration);
  const target = Math.ceil(Math.max(...segments.map((s) => s.length)));
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${target}`,
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-MAP:URI="init.mp4"',
    ...segments.flatMap((s, i) => [`#EXTINF:${s.length.toFixed(3)},`, `seg/${i}`]),
    '#EXT-X-ENDLIST',
    '',
  ].join('\n');
}
