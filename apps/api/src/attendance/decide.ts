import type { Rules } from '../courses/courses.repo.js';
import type { BestTwo } from './gallery.js';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'leave' | 'pending';

export interface Thresholds {
  acceptMin: number;
  reviewMin: number;
}

export type Verdict =
  | { kind: 'match'; userId: string; score: number }
  | { kind: 'review'; userId: string; score: number }
  | { kind: 'unknown' };

// ไม่แน่ใจต้องส่งให้อาจารย์ตรวจเสมอ รวมถึงตอนที่สองคนคะแนนสูงพอ ๆ กัน
export function classify(best: BestTwo, t: Thresholds): Verdict {
  const { bestId, score, secondScore } = best;
  if (bestId === null || score === null || score < t.reviewMin) return { kind: 'unknown' };
  const confident = score >= t.acceptMin && (secondScore === null || secondScore < t.acceptMin);
  return { kind: confident ? 'match' : 'review', userId: bestId, score };
}

const MINUTE = 60_000;

// นับเป็นนาทีเต็ม ตัดสาย 15 นาทีของคาบ 9:00 คือถึง 9:15:59 ยังไม่สาย
export function statusAt(
  seenAt: Date,
  startsAt: Date,
  endsAt: Date,
  rules: Rules,
): 'present' | 'late' | 'absent' {
  const minutesLate = Math.floor((seenAt.getTime() - startsAt.getTime()) / MINUTE);
  if (minutesLate <= rules.lateAfterMin) return 'present';
  if (rules.absentAfterMin === null) return seenAt < endsAt ? 'late' : 'absent';
  return minutesLate <= rules.absentAfterMin ? 'late' : 'absent';
}

export interface SessionRules {
  kind: 'class' | 'exam';
  lateAfterMin: number | null;
  absentAfterMin: number | null;
  outOfRoomLimitMin: number | null;
}

// คาบสอบตั้งเกณฑ์สาย/ขาด/เวลานอกห้องเองในแถวคาบ ส่วนคาบเรียนใช้เกณฑ์ของวิชา
export function rulesFor(session: SessionRules, course: Rules): Rules {
  const outOfRoomLimitMin = session.outOfRoomLimitMin ?? course.outOfRoomLimitMin;
  if (session.kind !== 'exam') return { ...course, outOfRoomLimitMin };
  return {
    lateAfterMin: session.lateAfterMin ?? course.lateAfterMin,
    absentAfterMin: session.absentAfterMin,
    outOfRoomLimitMin,
  };
}

export type Liveness = 'live' | 'spoof' | 'unchecked';

// ปิดระบบหรือไม่มีคะแนน = ไม่ตรวจ · คะแนนเท่าเกณฑ์ถือว่าเป็นคนจริง
export function livenessOf(score: number | null | undefined, min: number | null): Liveness {
  if (min === null || score === null || score === undefined) return 'unchecked';
  return score < min ? 'spoof' : 'live';
}

export interface Current {
  status: AttendanceStatus;
  byTeacher: boolean;
  reviewReason: 'spoof' | null;
}

// ผลที่กล้องบันทึกไว้แล้วจะถูกแทนได้กรณีเดียว คือรอตรวจแล้วมาเจอแบบมั่นใจ
// แถวที่สงสัยว่าเป็นรูปหรือจอ ต้องผ่านคนจริงติดกันครบรอบ (clearsSpoof) ถึงจะแทน
export function nextWrite(
  current: Current | null,
  incoming: { status: AttendanceStatus; clearsSpoof: boolean },
): 'insert' | 'replace' | 'skip' {
  if (!current) return 'insert';
  if (current.byTeacher) return 'skip';
  if (current.status !== 'pending' || incoming.status === 'pending') return 'skip';
  if (current.reviewReason === 'spoof' && !incoming.clearsSpoof) return 'skip';
  return 'replace';
}
