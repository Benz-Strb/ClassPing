import { classifyEmail } from './role-from-email.js';

describe('classifyEmail', () => {
  it('เมลเป็นตัวเลขล้วนเป็นนักศึกษา และใช้เลขนั้นเป็นรหัส', () => {
    expect(classifyEmail('66112106@dpu.ac.th', [])).toEqual({
      email: '66112106@dpu.ac.th',
      role: 'student',
      studentId: '66112106',
    });
  });

  it('เมลที่ไม่มีตัวเลขเป็นอาจารย์', () => {
    expect(classifyEmail('Somsak.Kit@dpu.ac.th', [])).toEqual({
      email: 'somsak.kit@dpu.ac.th',
      role: 'teacher',
      studentId: null,
    });
  });

  it.each(['somsak', 'somsak.kitt', 'som.sak.kit', 'somsak_k'])('%s เป็นอาจารย์', (local) => {
    expect(classifyEmail(`${local}@dpu.ac.th`, [])?.role).toBe('teacher');
  });

  it.each(['s0msak.kit', 'somsak2'])('%s มีตัวเลขปน เป็นนักศึกษาไว้ก่อน', (local) => {
    expect(classifyEmail(`${local}@dpu.ac.th`, [])?.role).toBe('student');
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

  it('ตัวเลขปนตัวอักษรไม่ได้รหัสนักศึกษาหรือสิทธิ์อาจารย์', () => {
    expect(classifyEmail('66112106a@dpu.ac.th', [])).toMatchObject({ role: 'student', studentId: null });
  });
});
