import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

export interface LeaveOcrResult {
  lines: { text: string; score: number | null }[];
}

const unavailable = () => new AppError(503, 'LEAVE_OCR_UNAVAILABLE', 'บริการอ่านข้อความหลักฐานยังไม่พร้อม กรุณาลองใหม่หรือกรอกเหตุผลเอง');

@Injectable()
export class LeaveOcrClient {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async readTimetableDocument(image: Buffer, mime: string): Promise<LeaveOcrResult> {
    try { return await this.readLeaveDocument(image, mime, '/schedules/ocr'); }
    catch (error) {
      if (error instanceof AppError && error.getStatus() === 503) throw new AppError(503, 'TIMETABLE_OCR_UNAVAILABLE', 'บริการอ่านตารางเรียนยังไม่พร้อม กรุณาลองใหม่');
      throw error;
    }
  }

  async readTransferDocument(image: Buffer, mime: string): Promise<LeaveOcrResult> {
    try { return await this.readLeaveDocument(image, mime, '/transfers/ocr'); }
    catch (error) {
      if (error instanceof AppError && error.getStatus() === 503) throw new AppError(503, 'TRANSFER_OCR_UNAVAILABLE', 'บริการอ่านเอกสารเทียบโอนยังไม่พร้อม กรุณาลองใหม่');
      throw error;
    }
  }

  async readLeaveDocument(image: Buffer, mime: string, route = '/leave/ocr'): Promise<LeaveOcrResult> {
    if (!this.config.leaveOcrServiceToken) throw unavailable();
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(image)], { type: mime }), 'evidence');
    let response: Response;
    try {
      response = await fetch(`${this.config.leaveOcrServiceUrl ?? 'http://127.0.0.1:8002'}${route}`, {
        method: 'POST', body: form,
        headers: { 'X-OCR-Token': this.config.leaveOcrServiceToken },
        signal: AbortSignal.timeout(110_000),
      });
    } catch { throw unavailable(); }
    const payload = await response.json().catch(() => null) as {
      data?: LeaveOcrResult; error?: { code?: string; message?: string };
    } | null;
    if (!response.ok) {
      if ([400, 413].includes(response.status)) {
        throw new AppError(response.status, 'INVALID_EVIDENCE', payload?.error?.message ?? 'อ่านไฟล์หลักฐานไม่ได้ กรุณาเลือกไฟล์ใหม่');
      }
      throw unavailable();
    }
    const lines = payload?.data?.lines;
    if (!Array.isArray(lines) || !lines.every(line => typeof line?.text === 'string' &&
      (line.score === null || (typeof line.score === 'number' && Number.isFinite(line.score))))) throw unavailable();
    return { lines };
  }
}
