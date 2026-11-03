import { LiveStreaks } from './live-streaks.js';

const at = (s: number) => new Date(Date.UTC(2026, 10, 3, 2, 0, s));
const endsAt = at(3600);

describe('LiveStreaks', () => {
  it('คนจริงติดกัน 3 ภาพ นับ 3 และจำภาพแรกของชุด', () => {
    const s = new LiveStreaks();
    s.see('s1', 'u1', 'live', at(0), endsAt);
    s.see('s1', 'u1', 'live', at(1), endsAt);
    expect(s.see('s1', 'u1', 'live', at(2), endsAt)).toEqual({ count: 3, since: at(0) });
  });

  it('เจอรูปหรือจอแล้วเริ่มนับใหม่', () => {
    const s = new LiveStreaks();
    s.see('s1', 'u1', 'live', at(0), endsAt);
    s.see('s1', 'u1', 'live', at(1), endsAt);
    expect(s.see('s1', 'u1', 'spoof', at(2), endsAt)).toEqual({ count: 0, since: null });
    expect(s.see('s1', 'u1', 'live', at(3), endsAt)).toEqual({ count: 1, since: at(3) });
  });

  it('ภาพที่ไม่ได้ตรวจ ไม่นับและไม่ล้าง', () => {
    const s = new LiveStreaks();
    s.see('s1', 'u1', 'live', at(0), endsAt);
    expect(s.see('s1', 'u1', 'unchecked', at(1), endsAt)).toEqual({ count: 1, since: at(0) });
    expect(s.see('s1', 'u1', 'live', at(2), endsAt)).toEqual({ count: 2, since: at(0) });
  });

  it('ยังไม่เคยนับแล้วเจอภาพที่ไม่ได้ตรวจ = 0', () => {
    const s = new LiveStreaks();
    expect(s.see('s1', 'u1', 'unchecked', at(0), endsAt)).toEqual({ count: 0, since: null });
  });

  it('คนละคนหรือคนละคาบไม่ปนกัน', () => {
    const s = new LiveStreaks();
    s.see('s1', 'u1', 'live', at(0), endsAt);
    s.see('s1', 'u1', 'live', at(1), endsAt);
    expect(s.see('s1', 'u2', 'live', at(2), endsAt)).toEqual({ count: 1, since: at(2) });
    expect(s.see('s2', 'u1', 'live', at(2), endsAt)).toEqual({ count: 1, since: at(2) });
  });

  it('forgetEnded ลบคาบที่จบแล้ว (endsAt <= now)', () => {
    const s = new LiveStreaks();
    s.see('s1', 'u1', 'live', at(0), at(100));
    s.see('s2', 'u1', 'live', at(0), at(200));
    s.forgetEnded(at(100));
    expect(s.see('s1', 'u1', 'live', at(101), at(100))).toEqual({ count: 1, since: at(101) });
    expect(s.see('s2', 'u1', 'live', at(101), at(200))).toEqual({ count: 2, since: at(0) });
  });
});
