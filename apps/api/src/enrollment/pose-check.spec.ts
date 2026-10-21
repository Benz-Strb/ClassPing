import {
  checkPose,
  cosine,
  isComplete,
  isPose,
  PITCH_UP_SIGN,
  POSES,
  YAW_LEFT_SIGN,
} from './pose-check.js';

// สร้างมุมจากทิศของผู้ใช้ ไม่ผูกกับเครื่องหมายของโมเดล
const turnLeft = (deg: number) => ({ pitch: 0, yaw: deg * YAW_LEFT_SIGN, roll: 0 });
const turnRight = (deg: number) => ({ pitch: 0, yaw: -deg * YAW_LEFT_SIGN, roll: 0 });
const lookUp = (deg: number) => ({ pitch: deg * PITCH_UP_SIGN, yaw: 0, roll: 0 });
const lookDown = (deg: number) => ({ pitch: -deg * PITCH_UP_SIGN, yaw: 0, roll: 0 });

describe('POSES', () => {
  it('เรียงหน้าตรงก่อน', () => {
    expect(POSES).toEqual(['front', 'left', 'right', 'up', 'down']);
  });

  it('isPose รับแค่ชื่อท่าที่มี', () => {
    expect(isPose('left')).toBe(true);
    expect(isPose('side')).toBe(false);
    expect(isPose('')).toBe(false);
  });
});

describe('isComplete', () => {
  it('ครบ 5 ท่าถึงนับว่าลงทะเบียนแล้ว', () => {
    expect(isComplete(['front', 'left', 'right'])).toBe(false);
    expect(isComplete(['down', 'up', 'right', 'left', 'front'])).toBe(true);
  });

  it('ท่าซ้ำหรือชื่อแปลกไม่นับ', () => {
    expect(isComplete(['front', 'front', 'left', 'right', 'up'])).toBe(false);
    expect(isComplete(['front', 'left', 'right', 'up', 'side'])).toBe(false);
  });
});

describe('checkPose', () => {
  it('หน้าตรง', () => {
    expect(checkPose('front', { pitch: -5, yaw: 5, roll: 0 })).toEqual({ ok: true });
    expect(checkPose('front', turnLeft(20))).toEqual({ ok: false, hint: 'มองตรงกล้อง' });
    expect(checkPose('front', lookUp(20))).toEqual({ ok: false, hint: 'มองตรงกล้อง' });
  });

  it('หันซ้าย', () => {
    expect(checkPose('left', turnLeft(25))).toEqual({ ok: true });
    expect(checkPose('left', turnLeft(5))).toEqual({ ok: false, hint: 'หันซ้ายอีกนิด' });
    expect(checkPose('left', turnRight(25))).toEqual({ ok: false, hint: 'หันซ้ายอีกนิด' });
    expect(checkPose('left', turnLeft(60))).toEqual({ ok: false, hint: 'หันมากไป' });
  });

  it('หันขวา', () => {
    expect(checkPose('right', turnRight(25))).toEqual({ ok: true });
    expect(checkPose('right', turnLeft(25))).toEqual({ ok: false, hint: 'หันขวาอีกนิด' });
  });

  it('หันข้างแต่เงยหรือก้มมากไป', () => {
    const pose = { ...turnLeft(25), pitch: 30 };
    expect(checkPose('left', pose)).toEqual({ ok: false, hint: 'มองระดับเดียวกับกล้อง' });
  });

  it('เงยและก้ม', () => {
    expect(checkPose('up', lookUp(20))).toEqual({ ok: true });
    expect(checkPose('down', lookDown(20))).toEqual({ ok: true });
    expect(checkPose('up', lookDown(20))).toEqual({ ok: false, hint: 'เงยหน้าอีกนิด' });
    expect(checkPose('down', lookDown(5))).toEqual({ ok: false, hint: 'ก้มหน้าอีกนิด' });
    expect(checkPose('up', lookUp(50))).toEqual({ ok: false, hint: 'เงยมากไป' });
    expect(checkPose('down', lookDown(50))).toEqual({ ok: false, hint: 'ก้มมากไป' });
  });

  it('เงยหรือก้มแต่หันข้างมากไป', () => {
    const pose = { ...lookUp(20), yaw: 30 };
    expect(checkPose('up', pose)).toEqual({ ok: false, hint: 'หันหน้าตรงกล้อง' });
  });

  it('ขอบของช่วงมุมนับว่าผ่าน', () => {
    expect(checkPose('up', lookUp(10)).ok).toBe(true);
    expect(checkPose('up', lookUp(35)).ok).toBe(true);
    expect(checkPose('up', lookUp(9.9)).ok).toBe(false);
    expect(checkPose('up', lookUp(35.1)).ok).toBe(false);
    expect(checkPose('left', turnLeft(15)).ok).toBe(true);
    expect(checkPose('left', turnLeft(45)).ok).toBe(true);
  });
});

describe('cosine', () => {
  it('เวกเตอร์เดียวกันได้ 1 ตั้งฉากได้ 0', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });

  it('ไม่ขึ้นกับความยาวเวกเตอร์', () => {
    expect(cosine([1, 1], [3, 3])).toBeCloseTo(1);
  });

  it('เวกเตอร์ศูนย์หรือยาวไม่เท่ากันได้ 0 ไม่ใช่ NaN', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(cosine([1, 2], [1, 2, 3])).toBe(0);
  });
});
