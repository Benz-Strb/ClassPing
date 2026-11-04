import type { Liveness } from './decide.js';

interface Streak {
  count: number;
  since: Date | null;
}

interface SessionStreaks {
  endsAt: Date;
  byUser: Map<string, Streak>;
}

// นับจำนวนภาพที่เป็นคนจริงติดกันของแต่ละคนในแต่ละคาบ เก็บในหน่วยความจำ
export class LiveStreaks {
  private readonly sessions = new Map<string, SessionStreaks>();

  see(sessionId: string, userId: string, liveness: Liveness, seenAt: Date, endsAt: Date): Streak {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { endsAt, byUser: new Map() };
      this.sessions.set(sessionId, session);
    }
    const streak = session.byUser.get(userId) ?? { count: 0, since: null };
    // ภาพที่ไม่ได้ตรวจไม่นับและไม่ล้าง
    if (liveness === 'live') {
      streak.since ??= seenAt;
      streak.count++;
    } else if (liveness === 'spoof') {
      streak.count = 0;
      streak.since = null;
    }
    session.byUser.set(userId, streak);
    return { count: streak.count, since: streak.since };
  }

  forgetEnded(now: Date): void {
    for (const [id, session] of this.sessions) {
      if (session.endsAt <= now) this.sessions.delete(id);
    }
  }
}
