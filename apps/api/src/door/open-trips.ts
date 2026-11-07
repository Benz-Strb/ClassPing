import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { DOOR_REPO, type DoorRepo } from './door.repo.js';

const CACHE_MS = 60_000;

interface Loaded {
  userIds: Set<string>;
  loadedAt: number;
}

// คนที่มีรอบนอกห้องที่ยังไม่กลับในแต่ละคาบ (ทั้ง confirmed และ pending เพราะ unique index นับทุกแถวที่รู้ตัวคน)
// โหลดจากฐานข้อมูลครั้งเดียวต่อคาบ แล้วใช้ add/remove ตามเหตุการณ์ ครบ 60 วินาทีโหลดใหม่
@Injectable()
export class OpenTrips {
  private readonly sessions = new Map<string, Loaded>();

  constructor(
    @Inject(DOOR_REPO) private readonly repo: DoorRepo,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async has(sessionId: string, userId: string): Promise<boolean> {
    return (await this.load(sessionId)).userIds.has(userId);
  }

  async add(sessionId: string, userId: string): Promise<void> {
    (await this.load(sessionId)).userIds.add(userId);
  }

  async remove(sessionId: string, userId: string): Promise<void> {
    (await this.load(sessionId)).userIds.delete(userId);
  }

  private async load(sessionId: string): Promise<Loaded> {
    const now = this.now().getTime();
    // คาบที่จบแล้วไม่มีใครถามต่อ จึงหมดอายุแล้วถูกลบทิ้งตรงนี้
    for (const [key, loaded] of this.sessions) {
      if (now - loaded.loadedAt >= CACHE_MS) this.sessions.delete(key);
    }
    const hit = this.sessions.get(sessionId);
    if (hit) return hit;
    const loaded = { userIds: new Set(await this.repo.openTripUserIds(sessionId)), loadedAt: now };
    this.sessions.set(sessionId, loaded);
    return loaded;
  }
}
