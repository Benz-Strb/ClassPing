import { cosine, isComplete } from '../enrollment/pose-check.js';
import type { FaceEmbedding } from './attendance.repo.js';

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

export interface GalleryLoader {
  faceEmbeddings(userIds: string[], model: string): Promise<FaceEmbedding[]>;
}

export interface GalleryDeps {
  model(): Promise<string>;
  enrolledUserIds(courseId: string): Promise<string[]>;
}

// เทียบเฉพาะคนในวิชาที่ลงทะเบียนครบทุกท่า ด้วยโมเดลเดียวกับที่ service ใช้อยู่
// กล้องหน้าห้องและกล้องประตูใช้ตัวนี้ร่วมกัน เพื่อให้เทียบกับรายชื่อชุดเดียวกัน
export async function loadCourseGallery(
  repo: GalleryLoader,
  deps: GalleryDeps,
  courseId: string,
): Promise<GalleryEntry[]> {
  const userIds = await deps.enrolledUserIds(courseId);
  if (!userIds.length) return [];
  const rows = await repo.faceEmbeddings(userIds, await deps.model());

  const byUser = new Map<string, { poses: string[]; embeddings: number[][] }>();
  for (const row of rows) {
    const entry = byUser.get(row.userId) ?? { poses: [], embeddings: [] };
    entry.poses.push(row.pose);
    entry.embeddings.push(row.embedding);
    byUser.set(row.userId, entry);
  }
  return [...byUser]
    .filter(([, entry]) => isComplete(entry.poses))
    .map(([userId, entry]) => ({ userId, embeddings: entry.embeddings }));
}
