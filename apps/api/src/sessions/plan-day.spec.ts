import {
  addDays,
  bangkokDate,
  overlaps,
  planDay,
  toInstant,
  weekdayOf,
  type OverrideLike,
  type ScheduleLike,
} from './plan-day.js';

// 2026-10-19 เป็นวันจันทร์
const MONDAY = '2026-10-19';
const TUESDAY = '2026-10-20';

const monday: ScheduleLike = {
  id: 's1',
  courseId: 'c1',
  weekday: 1,
  startTime: '09:00',
  endTime: '12:00',
  roomId: 'r1',
};

const override = (patch: Partial<OverrideLike>): OverrideLike => ({
  scheduleId: 's1',
  onDate: MONDAY,
  cancelled: false,
  roomId: null,
  startTime: null,
  endTime: null,
  ...patch,
});

describe('bangkokDate', () => {
  it('เลยเที่ยงคืนเวลาไทยแล้วเป็นวันใหม่ แม้ UTC ยังเป็นวันเดิม', () => {
    expect(bangkokDate(new Date('2026-10-19T17:30:00Z'))).toBe('2026-10-20');
  });

  it('ก่อนเที่ยงคืนเวลาไทยยังเป็นวันเดิม', () => {
    expect(bangkokDate(new Date('2026-10-19T16:59:59Z'))).toBe('2026-10-19');
  });
});

describe('addDays', () => {
  it('ข้ามเดือนและปีได้', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-19', 6)).toBe('2026-10-25');
  });
});

describe('weekdayOf', () => {
  it('0 = อาทิตย์ ... 6 = เสาร์', () => {
    expect(weekdayOf('2026-10-18')).toBe(0);
    expect(weekdayOf(MONDAY)).toBe(1);
    expect(weekdayOf('2026-10-24')).toBe(6);
  });
});

describe('toInstant', () => {
  it('เวลาไทยตอนเช้าเป็นวันก่อนหน้าใน UTC', () => {
    expect(toInstant(TUESDAY, '06:30').toISOString()).toBe('2026-10-19T23:30:00.000Z');
  });

  it('รับเวลาแบบมีวินาทีที่ Postgres ส่งมา', () => {
    expect(toInstant(MONDAY, '09:00:00').toISOString()).toBe('2026-10-19T02:00:00.000Z');
  });
});

describe('planDay', () => {
  it('ตารางวันจันทร์ได้คาบในวันจันทร์', () => {
    expect(planDay(MONDAY, [monday], [])).toEqual([
      {
        scheduleId: 's1',
        courseId: 'c1',
        roomId: 'r1',
        onDate: MONDAY,
        startsAt: new Date('2026-10-19T02:00:00Z'),
        endsAt: new Date('2026-10-19T05:00:00Z'),
      },
    ]);
  });

  it('ตารางวันจันทร์ไม่มีคาบในวันอังคาร', () => {
    expect(planDay(TUESDAY, [monday], [])).toEqual([]);
  });

  it('ย้ายห้องเฉพาะวัน เปลี่ยนแค่ห้อง', () => {
    const [session] = planDay(MONDAY, [monday], [override({ roomId: 'r2' })]);
    expect(session.roomId).toBe('r2');
    expect(session.startsAt).toEqual(new Date('2026-10-19T02:00:00Z'));
  });

  it('เปลี่ยนเวลาเฉพาะวัน', () => {
    const [session] = planDay(MONDAY, [monday], [
      override({ startTime: '13:00', endTime: '15:30' }),
    ]);
    expect(session.roomId).toBe('r1');
    expect(session.startsAt).toEqual(new Date('2026-10-19T06:00:00Z'));
    expect(session.endsAt).toEqual(new Date('2026-10-19T08:30:00Z'));
  });

  it('งดสอนแล้วไม่มีคาบ', () => {
    expect(planDay(MONDAY, [monday], [override({ cancelled: true })])).toEqual([]);
  });

  it('override ของวันอื่นหรือตารางอื่นไม่มีผล', () => {
    const others = [
      override({ onDate: '2026-10-26', cancelled: true }),
      override({ scheduleId: 's2', cancelled: true }),
    ];
    expect(planDay(MONDAY, [monday], others)).toHaveLength(1);
  });
});

describe('overlaps', () => {
  const range = (date: string, start: string, end: string) => ({
    startsAt: toInstant(date, start),
    endsAt: toInstant(date, end),
  });

  it('เวลาซ้อนกันนับว่าชน', () => {
    expect(overlaps(range(MONDAY, '09:00', '12:00'), range(MONDAY, '11:00', '13:00'))).toBe(true);
    expect(overlaps(range(MONDAY, '09:00', '12:00'), range(MONDAY, '10:00', '11:00'))).toBe(true);
  });

  it('ต่อกันพอดีขอบไม่นับว่าชน', () => {
    expect(overlaps(range(MONDAY, '09:00', '12:00'), range(MONDAY, '12:00', '15:00'))).toBe(false);
  });
});
