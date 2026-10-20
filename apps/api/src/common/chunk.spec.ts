import { chunk } from './chunk.js';

describe('chunk', () => {
  it('แบ่งเป็นก้อนละ n ตัว ก้อนสุดท้ายเหลือเท่าที่มี', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('ลิสต์ว่างได้ลิสต์ว่าง', () => {
    expect(chunk([], 50)).toEqual([]);
  });
});
