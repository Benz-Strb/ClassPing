import { bestTwo, type GalleryEntry } from './gallery.js';

const gallery: GalleryEntry[] = [
  { userId: 'a', embeddings: [[0, 1], [1, 1]] },
  { userId: 'b', embeddings: [[2, 0]] },
  { userId: 'c', embeddings: [[-1, 0]] },
];

describe('bestTwo', () => {
  it('คะแนนของแต่ละคนมาจากท่าที่ใกล้สุด และเรียงคนที่ใกล้สุดก่อน', () => {
    const result = bestTwo([3, 0], gallery);
    expect(result.bestId).toBe('b');
    expect(result.score).toBeCloseTo(1, 10);
    expect(result.secondId).toBe('a');
    expect(result.secondScore).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it('เวกเตอร์ที่ยาวต่างกันได้คะแนนเท่าแบบ normalize แล้ว', () => {
    expect(bestTwo([0.5, 0.5], gallery).score).toBeCloseTo(
      bestTwo([40, 40], gallery).score!,
      12,
    );
  });

  it('มีคนเดียวในรายชื่อ ไม่มีอันดับสอง', () => {
    expect(bestTwo([1, 0], [gallery[1]])).toEqual({
      bestId: 'b',
      score: 1,
      secondId: null,
      secondScore: null,
    });
  });

  it('รายชื่อว่าง ทุกค่าเป็น null', () => {
    expect(bestTwo([1, 0], [])).toEqual({
      bestId: null,
      score: null,
      secondId: null,
      secondScore: null,
    });
  });

  it('คนที่ไม่มี embedding ไม่ถูกนับ', () => {
    const result = bestTwo([1, 0], [{ userId: 'x', embeddings: [] }, gallery[1]]);
    expect(result.bestId).toBe('b');
    expect(result.secondId).toBeNull();
  });
});
