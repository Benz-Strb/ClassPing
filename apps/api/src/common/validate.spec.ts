import { z } from 'zod';
import { parseBody } from './validate.js';

const schema = z.object({
  name: z.string().trim().min(1, { error: 'กรุณาใส่ชื่อวิชา' }),
  count: z.number().int(),
});

function rejection(body: unknown) {
  try {
    parseBody(schema, body);
  } catch (error) {
    const e = error as { getStatus(): number; code: string; message: string };
    return { status: e.getStatus(), code: e.code, message: e.message };
  }
  throw new Error('คาดว่าจะ throw แต่ไม่ throw');
}

describe('parseBody', () => {
  it('ผ่านแล้วคืนค่าที่แปลงแล้ว', () => {
    expect(parseBody(schema, { name: '  ฟิสิกส์ ', count: 2 })).toEqual({
      name: 'ฟิสิกส์',
      count: 2,
    });
  });

  it('ใช้ข้อความไทยที่ schema กำหนด', () => {
    expect(rejection({ name: ' ', count: 1 })).toEqual({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'กรุณาใส่ชื่อวิชา',
    });
  });

  it('ช่องที่ไม่ได้กำหนดข้อความ ได้ข้อความกลางภาษาไทย ไม่หลุดข้อความอังกฤษ', () => {
    for (const body of [undefined, 'x', { name: 'a', count: 1.5 }, { name: 'a' }]) {
      expect(rejection(body).message).toBe('ข้อมูลที่ส่งมาไม่ถูกต้อง');
    }
  });
});
