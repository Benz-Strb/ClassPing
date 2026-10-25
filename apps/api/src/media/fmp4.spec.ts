import { shiftTime, splitInit, timescale } from './fmp4.js';

const box = (type: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};

const mdhd = (version: 0 | 1, scale: number) => {
  const body = Buffer.alloc(version === 1 ? 32 : 20);
  body[0] = version;
  body.writeUInt32BE(scale, version === 1 ? 20 : 12);
  return box('mdhd', body);
};

const tfdt = (version: 0 | 1, time: bigint) => {
  const body = Buffer.alloc(version === 1 ? 12 : 8);
  body[0] = version;
  if (version === 1) body.writeBigUInt64BE(time, 4);
  else body.writeUInt32BE(Number(time), 4);
  return box('tfdt', body);
};

const init = (version: 0 | 1 = 0) =>
  Buffer.concat([
    box('ftyp', Buffer.from('iso5')),
    box('moov', box('trak', box('mdia', mdhd(version, 90000)))),
  ]);
const fragment = (time: bigint, version: 0 | 1 = 1) =>
  Buffer.concat([box('moof', box('traf', tfdt(version, time))), box('mdat', Buffer.from('xx'))]);

const tfdtOf = (media: Buffer) => {
  const times: bigint[] = [];
  for (let at = media.indexOf('tfdt'); at >= 0; at = media.indexOf('tfdt', at + 1)) {
    times.push(
      media[at + 4] === 1 ? media.readBigUInt64BE(at + 8) : BigInt(media.readUInt32BE(at + 8)),
    );
  }
  return times;
};

describe('fmp4', () => {
  it('แยก init (ftyp+moov) ออกจากท่อนวิดีโอ และอ่าน timescale ได้ทั้ง mdhd v0/v1', () => {
    const media = Buffer.concat([fragment(1n), fragment(90001n)]);
    const split = splitInit(Buffer.concat([init(), media]));
    expect(split.init).toEqual(init());
    expect(split.media).toEqual(media);
    expect(timescale(split.init)).toBe(90000);
    expect(timescale(init(1))).toBe(90000);
  });

  it('เลื่อนเวลาทุกท่อนตามที่กำหนด ไม่แก้ของเดิม', () => {
    const media = Buffer.concat([fragment(1n), fragment(90001n), fragment(5n, 0)]);
    const shifted = shiftTime(media, 540000n);
    expect(tfdtOf(shifted)).toEqual([540001n, 630001n, 540005n]);
    expect(tfdtOf(media)).toEqual([1n, 90001n, 5n]);
  });

  it('tfdt แบบ 32 บิตล้นได้ error ไม่ส่งเวลาผิดออกไป', () => {
    expect(() => shiftTime(fragment(1n, 0), 0xffffffffn)).toThrow();
  });

  it('ไฟล์ขาดกลางกล่องได้ error', () => {
    expect(() => splitInit(init().subarray(0, 20))).toThrow();
  });
});
