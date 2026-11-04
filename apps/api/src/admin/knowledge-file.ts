import { extname } from 'node:path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { AppError } from '../common/app-error.js';

export const KNOWLEDGE_FILE_LIMIT = 25 * 1024 * 1024;
export async function extractKnowledgeFile(file?: { originalname: string; buffer: Buffer }) {
  if (!file?.buffer.length) throw new AppError(400, 'FILE_REQUIRED', 'กรุณาเลือกไฟล์ที่มีเนื้อหา');
  if (file.buffer.length > KNOWLEDGE_FILE_LIMIT) throw new AppError(413, 'FILE_TOO_LARGE', 'ไฟล์ต้องไม่เกิน 25 MB');
  const extension = extname(file.originalname).toLowerCase();
  if (!['.pdf', '.docx', '.txt', '.md', '.csv'].includes(extension)) {
    throw new AppError(400, 'FILE_TYPE', 'รองรับเฉพาะ PDF, DOCX, TXT, Markdown และ CSV');
  }
  let content: string;
  try {
    if (extension === '.pdf') {
      const parser = new PDFParse({ data: file.buffer });
      try {
        const info = await parser.getInfo();
        if (info.total > 100) throw new AppError(400, 'TOO_MANY_PAGES', 'PDF ต้องไม่เกิน 100 หน้า กรุณาแบ่งไฟล์');
        content = (await parser.getText({ pageJoiner: '' })).text;
      } finally { await parser.destroy(); }
    } else if (extension === '.docx') {
      content = (await mammoth.extractRawText({ buffer: file.buffer })).value;
    } else {
      content = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'FILE_UNREADABLE', 'อ่านไฟล์ไม่ได้ กรุณาตรวจว่าไฟล์ไม่เสีย ไม่ติดรหัสผ่าน และไฟล์ข้อความเป็น UTF-8');
  }
  content = content.replace(/\r\n?/g, '\n').replaceAll('\u0000', '').trim();
  if (!content) throw new AppError(400, 'FILE_EMPTY', 'ไม่พบข้อความในไฟล์ หากเป็นเอกสารสแกน กรุณาแปลงภาพเป็นข้อความด้วย OCR ก่อน');
  if (content.length > 50_000) throw new AppError(400, 'CONTENT_TOO_LONG', 'เนื้อหาเกิน 50,000 ตัวอักษร กรุณาแบ่งไฟล์');
  return { name: file.originalname.replace(/\.[^.]+$/, '').slice(0, 200), content };
}
