import type { AppUser } from '../users/users.service.js';
import { canDownload, canWatch, type WatchableSession } from './video-access.js';

const person = (id: string, role: AppUser['role']): AppUser => ({
  id,
  email: `${id}@dpu.ac.th`,
  fullName: null,
  role,
  studentId: null,
  pdpaConsentAt: null,
  identityVerifiedAt: null,
});

const owner = person('owner', 'teacher');
const proctor = person('proctor', 'teacher');
const other = person('other', 'teacher');
const admin = person('admin', 'admin');
const student = person('student', 'student');

const session = (kind: 'class' | 'exam'): WatchableSession => ({
  id: 's1',
  kind,
  title: kind === 'exam' ? 'สอบกลางภาค' : null,
  courseId: 'c1',
  courseCode: 'CS101',
  courseName: 'ทดสอบ',
  teacherId: owner.id,
  roomId: 'r1',
  roomName: 'ห้อง 1',
  startsAt: new Date('2026-10-24T02:00:00Z'),
  endsAt: new Date('2026-10-24T04:00:00Z'),
  proctorIds: [proctor.id],
  cameraId: 'cam1',
});

describe('canWatch', () => {
  it('อาจารย์ประจำวิชาดูได้ทั้งคาบเรียนและคาบสอบ แอดมินดูได้ทุกคาบ', () => {
    for (const kind of ['class', 'exam'] as const) {
      expect(canWatch(owner, session(kind))).toBe(true);
      expect(canWatch(admin, session(kind))).toBe(true);
    }
  });

  it('คนคุมสอบดูได้เฉพาะคาบสอบที่คุม ดูคาบเรียนของวิชาเดียวกันไม่ได้', () => {
    expect(canWatch(proctor, session('exam'))).toBe(true);
    expect(canWatch(proctor, session('class'))).toBe(false);
    expect(canWatch(proctor, { ...session('exam'), proctorIds: [] })).toBe(false);
  });

  it('อาจารย์วิชาอื่นและนักศึกษาดูไม่ได้', () => {
    expect(canWatch(other, session('exam'))).toBe(false);
    expect(canWatch(student, session('class'))).toBe(false);
    expect(canWatch({ ...student, id: owner.id }, session('class'))).toBe(false);
  });
});

describe('canDownload', () => {
  it('อาจารย์ประจำวิชาและแอดมินดาวน์โหลดได้ คนคุมสอบไม่ได้', () => {
    expect(canDownload(owner, session('exam'))).toBe(true);
    expect(canDownload(admin, session('exam'))).toBe(true);
    expect(canDownload(proctor, session('exam'))).toBe(false);
    expect(canDownload(other, session('class'))).toBe(false);
  });
});
