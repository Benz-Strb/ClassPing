import type { Rules } from '../courses/courses.repo.js';
import { classify, nextWrite, statusAt, type Thresholds } from './decide.js';
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

describe('nextWrite', () => {
  const camera = (status: 'present' | 'late' | 'absent' | 'pending') => ({
    status,
    byTeacher: false,
  });

  it('ยังไม่มีแถว = เพิ่ม', () => {
    expect(nextWrite(null, { status: 'pending' })).toBe('insert');
    expect(nextWrite(null, { status: 'present' })).toBe('insert');
  });

  it('รอตรวจแล้วเจอแบบมั่นใจ = แทนที่', () => {
    expect(nextWrite(camera('pending'), { status: 'late' })).toBe('replace');
  });

  it('ผลมั่นใจแล้วไม่ถูกทับ ทั้งด้วยรอตรวจและผลใหม่', () => {
    expect(nextWrite(camera('present'), { status: 'pending' })).toBe('skip');
    expect(nextWrite(camera('present'), { status: 'late' })).toBe('skip');
    expect(nextWrite(camera('pending'), { status: 'pending' })).toBe('skip');
  });

  it('แถวที่อาจารย์แก้แล้ว กล้องไม่แตะ', () => {
    expect(nextWrite({ status: 'pending', byTeacher: true }, { status: 'present' })).toBe(
      'skip',
    );
    expect(nextWrite({ status: 'absent', byTeacher: true }, { status: 'present' })).toBe('skip');
  });

  it('แถวลาไม่ถูกกล้องทับ', () => {
    expect(nextWrite({ status: 'leave', byTeacher: false }, { status: 'present' })).toBe('skip');
  });
});
