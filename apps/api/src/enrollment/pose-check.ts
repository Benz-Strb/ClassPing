import type { FacePose } from '../face/face.client.js';

export const POSES = ['front', 'left', 'right', 'up', 'down'] as const;
export type Pose = (typeof POSES)[number];

export function isPose(value: string): value is Pose {
  return (POSES as readonly string[]).includes(value);
}

// เครื่องหมายของ yaw/pitch ตอนผู้ใช้หันซ้าย (ซ้ายของตัวเอง) / เงยหน้า วัดจากกล้อง MacBook
// เงย = pitch บวก แน่นอน ส่วนซ้าย = yaw ลบ ยังไม่ชัวร์ ต้องเช็กกับมือถือจริงอีกรอบ
export const YAW_LEFT_SIGN = -1;
export const PITCH_UP_SIGN = 1;

// องศา ปรับได้หลังลองกับมือถือจริง
const FRONT_MAX = 12;
const TURN_MIN = 15;
const TURN_MAX = 45;
const TILT_MIN = 10;
const TILT_MAX = 35;
// ตอนหันข้างหรือเงย/ก้ม แกนอีกแกนเอียงได้ไม่เกินนี้
const OTHER_AXIS_MAX = 20;

// มุมต่างกันแต่เป็นคนเดียวกันได้คะแนนต่ำกว่าตอนเช็คชื่อ (หน้าตรงคนเดียวกันได้ > 0.6, คนอื่น < 0.35)
export const SAME_PERSON_MIN = 0.4;

export type PoseCheck = { ok: true } | { ok: false; hint: string };

const pass: PoseCheck = { ok: true };
const fail = (hint: string): PoseCheck => ({ ok: false, hint });

export function checkPose(expected: Pose, { yaw, pitch }: FacePose): PoseCheck {
  if (expected === 'front') {
    return Math.abs(yaw) <= FRONT_MAX && Math.abs(pitch) <= FRONT_MAX
      ? pass
      : fail('มองตรงกล้อง');
  }

  if (expected === 'left' || expected === 'right') {
    if (Math.abs(pitch) > OTHER_AXIS_MAX) return fail('มองระดับเดียวกับกล้อง');
    const turned = yaw * YAW_LEFT_SIGN * (expected === 'left' ? 1 : -1);
    if (turned < TURN_MIN) return fail(expected === 'left' ? 'หันซ้ายอีกนิด' : 'หันขวาอีกนิด');
    if (turned > TURN_MAX) return fail('หันมากไป');
    return pass;
  }

  if (Math.abs(yaw) > OTHER_AXIS_MAX) return fail('หันหน้าตรงกล้อง');
  const up = expected === 'up';
  const tilted = pitch * PITCH_UP_SIGN * (up ? 1 : -1);
  if (tilted < TILT_MIN) return fail(up ? 'เงยหน้าอีกนิด' : 'ก้มหน้าอีกนิด');
  if (tilted > TILT_MAX) return fail(up ? 'เงยมากไป' : 'ก้มมากไป');
  return pass;
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}
