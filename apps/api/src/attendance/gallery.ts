import { cosine } from '../enrollment/pose-check.js';

// ค่าใบหน้าทุกท่าของนักศึกษาหนึ่งคน
export interface GalleryEntry {
  userId: string;
  embeddings: number[][];
}

export interface BestTwo {
  bestId: string | null;
  score: number | null;
  secondId: string | null;
  secondScore: number | null;
}

// คะแนนของแต่ละคน = ท่าที่ใกล้กับหน้านี้ที่สุด คืนคนที่ใกล้สุดกับอันดับสอง
export function bestTwo(probe: number[], gallery: GalleryEntry[]): BestTwo {
  const scores = gallery
    .filter((entry) => entry.embeddings.length > 0)
    .map((entry) => ({
      userId: entry.userId,
      score: Math.max(...entry.embeddings.map((e) => cosine(probe, e))),
    }))
    .sort((a, b) => b.score - a.score);

  const [first, second] = scores;
  return {
    bestId: first?.userId ?? null,
    score: first?.score ?? null,
    secondId: second?.userId ?? null,
    secondScore: second?.score ?? null,
  };
}
