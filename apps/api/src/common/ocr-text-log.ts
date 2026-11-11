import { Logger } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppUser } from '../users/users.service.js';

const logger = new Logger('OcrTextLog');
const defaultDirectory = '/Users/a1/Film/project classping/ClassPing/File-text-OCR-Log';
const safeName = (value: string) => value.normalize('NFC').replace(/[<>:"/\\|?*\p{Cc}]/gu, '_').replace(/\.{2,}/g, '_').trim().slice(0, 80) || 'unknown';

export function formatOcrText(type: 'ใบลา' | 'ตารางเรียน', text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim());
  if (type === 'ใบลา') return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  let course = 0;
  return lines.map((line) => {
    const readable = line.replace(/\s+(?=(?:จ\.|อ\.|พ\.|พฤ\.|ศ\.|ส\.|อา\.)\s*\d{1,2}:\d{2})/g, '\n');
    if (/^[A-Z]{2,}\s*\d{3,}\b/.test(line)) {
      course += 1;
      return `\nรายวิชา ${course}\n${readable}`;
    }
    if (/^(รายวิชาที่ลงทะเบียนทั้งหมด|หมายเหตุ\s*:)/.test(line)) return `\n${line}`;
    return readable;
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function writeOcrTextLog(
  user: Pick<AppUser, 'id' | 'studentId' | 'fullName'>,
  type: 'ใบลา' | 'ตารางเรียน',
  text: string,
): Promise<void> {
  try {
    const directory = process.env.OCR_TEXT_LOG_DIR || defaultDirectory;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = `${safeName(user.studentId || user.id)}_${safeName(user.fullName || 'ไม่ระบุชื่อ')}_${type}.txt`;
    const timestamp = new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'long', timeStyle: 'medium', timeZone: 'Asia/Bangkok',
    }).format(new Date());
    const entry = `\n=== ${type} | ${timestamp} (เวลาไทย) ===\n\nข้อมูลนักศึกษา\nเลขนักศึกษา: ${user.studentId || 'ไม่ระบุ'}\nชื่อ: ${user.fullName || 'ไม่ระบุ'}\nบัญชี: ${user.id}\n\nข้อความจาก OCR\n${'-'.repeat(60)}\n${formatOcrText(type, text)}\n${'-'.repeat(60)}\n`;
    await appendFile(join(directory, filename), entry, { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    logger.error('เขียนไฟล์ OCR log ไม่สำเร็จ', error instanceof Error ? error.stack : String(error));
  }
}
