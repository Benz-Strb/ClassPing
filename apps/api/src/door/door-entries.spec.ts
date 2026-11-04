import { DoorEntries } from './door-entries.js';

const t = (hhmm: string) => new Date(`2026-10-23T${hhmm}:00Z`);

function setup() {
  let now = t('02:00');
  const entries = new DoorEntries(() => now);
  return { entries, setNow: (d: Date) => (now = d) };
}

describe('DoorEntries', () => {
  it('between คืนเวลาเข้าในช่วงที่ขอ เรียงจากเก่าไปใหม่', () => {
    const { entries } = setup();
    entries.add('s1', t('02:30'), t('05:00'));
    entries.add('s1', t('02:10'), t('05:00'));
    entries.add('s1', t('03:30'), t('05:00'));
    expect(entries.between('s1', t('02:00'), t('03:00'))).toEqual([t('02:10'), t('02:30')]);
  });

  it('คนละคาบไม่ปนกัน', () => {
    const { entries } = setup();
    entries.add('s1', t('02:10'), t('05:00'));
    expect(entries.between('s2', t('02:00'), t('04:00'))).toEqual([]);
  });

  it('คาบที่จบแล้วถูกลืม', () => {
    const { entries, setNow } = setup();
    entries.add('s1', t('02:10'), t('05:00'));
    setNow(t('05:00'));
    expect(entries.between('s1', t('02:00'), t('06:00'))).toEqual([]);
  });
});
