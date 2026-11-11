import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeOcrTextLog } from './ocr-text-log.js';

it('เก็บข้อความไทยต่อท้าย แยกนักศึกษาและประเภท พร้อมป้องกันชื่อไฟล์ออกนอกโฟลเดอร์', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ocr-log-'));
  vi.stubEnv('OCR_TEXT_LOG_DIR', directory);
  const student = { id: 'user-1', studentId: '650001', fullName: '../สมชาย/ใจดี' };
  try {
    await writeOcrTextLog(student, 'ใบลา', 'ลาป่วย\nวันที่ 11');
    await writeOcrTextLog(student, 'ใบลา', 'ข้อความครั้งที่สอง');
    await writeOcrTextLog(student, 'ตารางเรียน', 'CE360 จันทร์');
    await writeOcrTextLog({ ...student, studentId: '650002' }, 'ใบลา', 'อีกคน');
    const files = await readdir(directory);
    expect(files).toHaveLength(3);
    const leave = files.find((file) => file.startsWith('650001_') && file.endsWith('_ใบลา.txt'))!;
    const text = await readFile(join(directory, leave), 'utf8');
    expect(text).toContain('ลาป่วย\nวันที่ 11');
    expect(text).toContain('ข้อความครั้งที่สอง');
    expect(text).toContain('เลขนักศึกษา: 650001');
    expect(text.match(/===/g)).toHaveLength(4);
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

it('ไม่บันทึกถ้าไม่ได้ตั้ง OCR_TEXT_LOG_DIR หรือรันแบบ production', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ocr-log-'));
  const student = { id: 'user-1', studentId: '650001', fullName: 'สมชาย ใจดี' };
  try {
    vi.stubEnv('OCR_TEXT_LOG_DIR', '');
    await expect(writeOcrTextLog(student, 'ใบลา', 'ลาป่วย')).resolves.toBeUndefined();
    vi.stubEnv('OCR_TEXT_LOG_DIR', directory);
    vi.stubEnv('NODE_ENV', 'production');
    await writeOcrTextLog(student, 'ใบลา', 'ลาป่วย');
    expect(await readdir(directory)).toEqual([]);
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
