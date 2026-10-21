import { classifyEmail } from './role-from-email.js';

describe('classifyEmail', () => {
  it('เมลเป็นตัวเลขล้วนเป็นนักศึกษา และใช้เลขนั้นเป็นรหัส', () => {
    expect(classifyEmail('66112106@dpu.ac.th', [])).toEqual({
      email: '66112106@dpu.ac.th',
      role: 'student',
      studentId: '66112106',
    });
  });

  it('เมลเป็นชื่อเป็นอาจารย์', () => {
    expect(classifyEmail('somsak.kit@dpu.ac.th', [])).toEqual({
      email: 'somsak.kit@dpu.ac.th',
      role: 'teacher',
      studentId: null,
    });
  });

  it('ตัดช่องว่างและแปลงเป็นตัวเล็ก', () => {
    expect(classifyEmail('  66112106@DPU.AC.TH ', [])?.email).toBe(
      '66112106@dpu.ac.th',
    );
  });

  it('เมลที่อยู่ในรายชื่อแอดมินเป็นแอดมิน ไม่สนตัวพิมพ์', () => {
    expect(
      classifyEmail('Somsak.Kit@dpu.ac.th', ['somsak.kit@dpu.ac.th'])?.role,
    ).toBe('admin');
  });

  it('แอดมินที่เมลเป็นตัวเลขยังได้รหัสนักศึกษา ลงทะเบียนใบหน้าได้', () => {
    expect(classifyEmail('66112106@dpu.ac.th', ['66112106@dpu.ac.th'])).toEqual({
      email: '66112106@dpu.ac.th',
      role: 'admin',
      studentId: '66112106',
    });
    expect(classifyEmail('somsak.kit@dpu.ac.th', ['somsak.kit@dpu.ac.th'])?.studentId).toBeNull();
  });

  it.each([
    'a@gmail.com',
    'x@dpu.ac.th.evil.com',
    'x@mail.dpu.ac.th',
    'a@b@dpu.ac.th',
    '@dpu.ac.th',
    'dpu.ac.th',
    '',
  ])('ปฏิเสธ %s', (email) => {
    expect(classifyEmail(email, [])).toBeNull();
  });

  it('ตัวเลขปนตัวอักษรไม่นับเป็นนักศึกษา', () => {
    expect(classifyEmail('66112106a@dpu.ac.th', [])?.role).toBe('teacher');
  });
});
