// อ่าน/แก้กล่องใน fMP4 ที่ MediaMTX ส่งมา เท่าที่ HLS ต้องใช้

interface Box {
  type: string;
  start: number;
  // ตำแหน่งเนื้อในกล่อง (หลัง header)
  body: number;
  end: number;
}

function* boxes(buf: Buffer, from = 0, to = buf.length): Generator<Box> {
  let at = from;
  while (at + 8 <= to) {
    let size = buf.readUInt32BE(at);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) throw new Error('fMP4 ไม่ครบ');
    yield {
      type: buf.toString('latin1', at + 4, at + 8),
      start: at,
      body: at + header,
      end: at + size,
    };
    at += size;
  }
}

function child(buf: Buffer, parent: Box, type: string): Box | undefined {
  for (const box of boxes(buf, parent.body, parent.end)) if (box.type === type) return box;
  return undefined;
}

// init = ftyp + moov ส่วนที่เหลือคือ moof/mdat ทีละท่อน
export function splitInit(buf: Buffer): { init: Buffer; media: Buffer } {
  for (const box of boxes(buf)) {
    if (box.type === 'moof')
      return { init: buf.subarray(0, box.start), media: buf.subarray(box.start) };
  }
  return { init: buf, media: buf.subarray(buf.length) };
}

// timescale ของ track วิดีโอ (MediaMTX มี track เดียว)
export function timescale(init: Buffer): number {
  const root = { type: '', start: 0, body: 0, end: init.length };
  const moov = child(init, root, 'moov');
  const trak = moov && child(init, moov, 'trak');
  const mdia = trak && child(init, trak, 'mdia');
  const mdhd = mdia && child(init, mdia, 'mdhd');
  if (!mdhd) throw new Error('ไม่พบ mdhd');
  return init.readUInt32BE(mdhd.body + (init[mdhd.body] === 1 ? 20 : 12));
}

// MediaMTX นับเวลาใหม่จากต้นช่วงที่ขอทุกครั้ง ท่อนที่ไม่ใช่ท่อนแรกต้องเลื่อนเวลาให้ต่อกัน
export function shiftTime(media: Buffer, ticks: bigint): Buffer {
  const out = Buffer.from(media);
  for (const moof of boxes(out)) {
    if (moof.type !== 'moof') continue;
    for (const traf of boxes(out, moof.body, moof.end)) {
      if (traf.type !== 'traf') continue;
      const tfdt = child(out, traf, 'tfdt');
      if (!tfdt) continue;
      const at = tfdt.body + 4;
      if (out[tfdt.body] === 1) {
        out.writeBigUInt64BE(out.readBigUInt64BE(at) + ticks, at);
      } else {
        const next = BigInt(out.readUInt32BE(at)) + ticks;
        if (next > 0xffffffffn) throw new Error('เวลาเกินช่องของ tfdt');
        out.writeUInt32BE(Number(next), at);
      }
    }
  }
  return out;
}
