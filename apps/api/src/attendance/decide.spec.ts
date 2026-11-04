import type { Rules } from '../courses/courses.repo.js';
import { classify, livenessOf, nextWrite, rulesFor, statusAt, type Thresholds } from './decide.js';
import type { BestTwo } from './gallery.js';

const t: Thresholds = { acceptMin: 0.5, reviewMin: 0.36 };

const best = (score: number | null, secondScore: number | null = null): BestTwo => ({
  bestId: score === null ? null : 'a',
  score,
  secondId: secondScore === null ? null : 'b',
  secondScore,
});

describe('classify', () => {
  it('คะแนนสูงและอันดับสองห่าง = บันทึกเลย', () => {
    expect(classify(best(0.62, 0.2), t)).toEqual({ kind: 'match', userId: 'a', score: 0.62 });
  });

  it('สองคนคะแนนถึงเกณฑ์ทั้งคู่ = รอตรวจ', () => {
    expect(classify(best(0.62, 0.55), t)).toEqual({ kind: 'review', userId: 'a', score: 0.62 });
  });

  it('คะแนนกลาง = รอตรวจ', () => {
    expect(classify(best(0.45), t)).toEqual({ kind: 'review', userId: 'a', score: 0.45 });
  });

  it('ต่ำกว่าเกณฑ์รอตรวจ หรือไม่มีใครให้เทียบ = ไม่รู้จัก', () => {
    expect(classify(best(0.35), t)).toEqual({ kind: 'unknown' });
    expect(classify(best(null), t)).toEqual({ kind: 'unknown' });
  });

  it('คะแนนเท่าเกณฑ์พอดีนับว่าถึง', () => {
    expect(classify(best(0.5), t).kind).toBe('match');
    expect(classify(best(0.36), t).kind).toBe('review');
  });
});

describe('statusAt', () => {
  const startsAt = new Date('2026-10-22T02:00:00Z'); // 09:00 เวลาไทย
  const endsAt = new Date('2026-10-22T05:00:00Z'); // 12:00
  const rules = (absentAfterMin: number | null): Rules => ({
    lateAfterMin: 15,
    absentAfterMin,
    outOfRoomLimitMin: 15,
  });
  const at = (time: string) => new Date(`2026-10-22T${time}+07:00`);

  it('มาก่อนเริ่มคาบหรือภายในนาทีที่ตัดสาย = มา', () => {
    expect(statusAt(at('08:55:00'), startsAt, endsAt, rules(null))).toBe('present');
    expect(statusAt(at('09:15:59'), startsAt, endsAt, rules(null))).toBe('present');
  });

  it('เลยนาทีที่ตัดสาย = สาย', () => {
    expect(statusAt(at('09:16:00'), startsAt, endsAt, rules(null))).toBe('late');
  });

  it('มีเวลาตัดขาด: ภายในนาทีนั้นยังสาย เลยไปเป็นขาด', () => {
    expect(statusAt(at('09:30:59'), startsAt, endsAt, rules(30))).toBe('late');
    expect(statusAt(at('09:31:00'), startsAt, endsAt, rules(30))).toBe('absent');
  });

  it('ไม่ตั้งเวลาตัดขาด: มาก่อนหมดคาบนับสาย', () => {
    expect(statusAt(at('11:59:00'), startsAt, endsAt, rules(null))).toBe('late');
    expect(statusAt(at('12:00:00'), startsAt, endsAt, rules(null))).toBe('absent');
  });
});

describe('rulesFor', () => {
  const course: Rules = { lateAfterMin: 15, absentAfterMin: 30, outOfRoomLimitMin: 20 };

  it('คาบเรียนใช้เกณฑ์ของวิชา', () => {
    expect(rulesFor({ kind: 'class', lateAfterMin: null, absentAfterMin: null }, course)).toEqual(
      course,
    );
  });

  it('คาบสอบใช้เกณฑ์ของคาบ (ขาดว่าง = หมดคาบ) เวลานอกห้องยังใช้ของวิชา', () => {
    expect(rulesFor({ kind: 'exam', lateAfterMin: 10, absentAfterMin: null }, course)).toEqual({
      lateAfterMin: 10,
      absentAfterMin: null,
      outOfRoomLimitMin: 20,
    });
  });

  it('คาบสอบตั้งสาย 10 นาที: เห็นนาทีที่ 10:59 = มา, 11:00 = สาย', () => {
    const rules = rulesFor({ kind: 'exam', lateAfterMin: 10, absentAfterMin: 30 }, course);
    const startsAt = new Date('2026-10-22T02:00:00Z');
    const endsAt = new Date('2026-10-22T04:00:00Z');
    expect(statusAt(new Date('2026-10-22T02:10:59Z'), startsAt, endsAt, rules)).toBe('present');
    expect(statusAt(new Date('2026-10-22T02:11:00Z'), startsAt, endsAt, rules)).toBe('late');
  });
});

describe('livenessOf', () => {
  it('ปิดระบบ (ไม่มีเกณฑ์) = ไม่ตรวจ', () => {
    expect(livenessOf(0.9, null)).toBe('unchecked');
  });

  it('ไม่มีคะแนน = ไม่ตรวจ', () => {
    expect(livenessOf(null, 0.15)).toBe('unchecked');
    expect(livenessOf(undefined, 0.15)).toBe('unchecked');
  });

  it('ต่ำกว่าเกณฑ์ = รูปหรือจอ', () => {
    expect(livenessOf(0.1, 0.15)).toBe('spoof');
  });

  it('เท่ากับเกณฑ์ = คนจริง', () => {
    expect(livenessOf(0.15, 0.15)).toBe('live');
    expect(livenessOf(0.8, 0.15)).toBe('live');
  });
});

describe('nextWrite', () => {
  const camera = (
    status: 'present' | 'late' | 'absent' | 'pending',
    reviewReason: 'spoof' | null = null,
  ) => ({ status, byTeacher: false, reviewReason });
  const inc = (status: 'present' | 'late' | 'absent' | 'pending', clearsSpoof = false) => ({
    status,
    clearsSpoof,
  });

  it('ยังไม่มีแถว = เพิ่ม', () => {
    expect(nextWrite(null, inc('pending'))).toBe('insert');
    expect(nextWrite(null, inc('present'))).toBe('insert');
  });

  it('รอตรวจแล้วเจอแบบมั่นใจ = แทนที่', () => {
    expect(nextWrite(camera('pending'), inc('late'))).toBe('replace');
  });

  it('ผลมั่นใจแล้วไม่ถูกทับ ทั้งด้วยรอตรวจและผลใหม่', () => {
    expect(nextWrite(camera('present'), inc('pending'))).toBe('skip');
    expect(nextWrite(camera('present'), inc('late'))).toBe('skip');
    expect(nextWrite(camera('pending'), inc('pending'))).toBe('skip');
  });

  it('แถวสงสัยรูปหรือจอ เจอแบบมั่นใจแต่ยังไม่ผ่านรอบ = ไม่แทน', () => {
    expect(nextWrite(camera('pending', 'spoof'), inc('present'))).toBe('skip');
  });

  it('แถวสงสัยรูปหรือจอ ผ่านครบรอบ = แทนที่', () => {
    expect(nextWrite(camera('pending', 'spoof'), inc('present', true))).toBe('replace');
  });

  it('แถวสงสัยรูปหรือจอ ผลใหม่ยังรอตรวจ = ไม่แทน', () => {
    expect(nextWrite(camera('pending', 'spoof'), inc('pending', true))).toBe('skip');
  });

  it('แถวที่อาจารย์แก้แล้ว กล้องไม่แตะ', () => {
    const teacher = (status: 'pending' | 'absent', reviewReason: 'spoof' | null = null) => ({
      status,
      byTeacher: true,
      reviewReason,
    });
    expect(nextWrite(teacher('pending'), inc('present'))).toBe('skip');
    expect(nextWrite(teacher('absent'), inc('present'))).toBe('skip');
    expect(nextWrite(teacher('pending', 'spoof'), inc('present', true))).toBe('skip');
  });

  it('แถวลาไม่ถูกกล้องทับ', () => {
    expect(
      nextWrite({ status: 'leave', byTeacher: false, reviewReason: null }, inc('present')),
    ).toBe('skip');
  });
});
