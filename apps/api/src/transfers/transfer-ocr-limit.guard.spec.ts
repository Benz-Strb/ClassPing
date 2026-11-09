import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { TransfersController } from './transfers.controller.js';
import { TRANSFER_OCR_LIMIT, TransferOcrLimitGuard } from './transfer-ocr-limit.guard.js';

describe('TransferOcrLimitGuard', () => {
  it('ใส่ไว้ทุกทางที่ส่งเอกสารเข้า OCR', () => {
    const guards = (name: keyof TransfersController) =>
      Reflect.getMetadata('__guards__', TransfersController.prototype[name]) as unknown[];
    expect(guards('preview')).toEqual([TransferOcrLimitGuard]);
    expect(guards('uploadCurriculum')).toEqual([TransferOcrLimitGuard]);
  });
  it(`ให้อ่านได้ ${TRANSFER_OCR_LIMIT} ครั้งต่อนาทีต่อผู้ใช้`, () => {
    let now = new Date('2026-11-09T00:00:00Z');
    const guard = new TransferOcrLimitGuard(() => now);
    const context = (id: string) => ({ switchToHttp: () => ({ getRequest: () => ({ user: { id } }) }) }) as never;
    for (let i = 0; i < TRANSFER_OCR_LIMIT; i++) expect(guard.canActivate(context('u1'))).toBe(true);
    expect(() => guard.canActivate(context('u1'))).toThrow();
    expect(guard.canActivate(context('u2'))).toBe(true);
    now = new Date('2026-11-09T00:01:01Z');
    expect(guard.canActivate(context('u1'))).toBe(true);
  });
});
