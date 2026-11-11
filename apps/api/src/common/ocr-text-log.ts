import { Logger } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppUser } from '../users/users.service.js';

const logger = new Logger('OcrTextLog');
const defaultDirectory = '/Users/a1/Film/project classping/ClassPing/File-text-OCR-Log';
const safeName = (value: string) => value.normalize('NFC').replace(/[<>:"/\\|?*\p{Cc}]/gu, '_').replace(/\.{2,}/g, '_').trim().slice(0, 80) || 'unknown';

export async function writeOcrTextLog(
  user: Pick<AppUser, 'id' | 'studentId' | 'fullName'>,
  type: 'ใบลา' | 'ตารางเรียน',
  text: string,
): Promise<void> {
  try {
    const directory = process.env.OCR_TEXT_LOG_DIR || defaultDirectory;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = `${safeName(user.studentId || user.id)}_${safeName(user.fullName || 'ไม่ระบุชื่อ')}_${type}.txt`;
    const entry = `\n=== ${new Date().toISOString()} | ${type} ===\nเลขนักศึกษา: ${user.studentId || 'ไม่ระบุ'}\nชื่อ: ${user.fullName || 'ไม่ระบุ'}\nบัญชี: ${user.id}\n${text}\n`;
    await appendFile(join(directory, filename), entry, { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    logger.error('เขียนไฟล์ OCR log ไม่สำเร็จ', error instanceof Error ? error.stack : String(error));
  }
}
