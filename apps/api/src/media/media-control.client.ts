import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

// สายที่ต่อกับ MediaMTX อยู่ state: publish = กล้องส่งภาพ, read = มีคนดู, idle = ยังไม่เริ่ม
export interface MediaConn {
  kind: 'rtsp' | 'webrtc';
  id: string;
  path: string;
  state: string;
}

export interface MediaControl {
  list(): Promise<MediaConn[]>;
  kick(conn: MediaConn): Promise<void>;
}

export const MEDIA_CONTROL = Symbol('MEDIA_CONTROL');

// control API ของ MediaMTX (compose ผูกพอร์ตไว้กับ 127.0.0.1) ส่ง secret เป็น Bearer
@Injectable()
export class HttpMediaControl implements MediaControl {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async list(): Promise<MediaConn[]> {
    const lists = await Promise.all(
      (['rtsp', 'webrtc'] as const).map(async (kind) => {
        const res = await this.call('GET', `/v3/${kind}/sessions/list`);
        if (!res.ok) throw new Error(`MediaMTX ตอบ ${res.status}`);
        const body = (await res.json()) as {
          items?: { id: string; path: string; state: string }[];
        };
        return (body.items ?? []).map(({ id, path, state }) => ({ kind, id, path, state }));
      }),
    );
    return lists.flat();
  }

  async kick(conn: MediaConn): Promise<void> {
    const res = await this.call('POST', `/v3/${conn.kind}/sessions/kick/${conn.id}`);
    // 404 = สายหลุดไปเองแล้ว
    if (!res.ok && res.status !== 404) throw new Error(`MediaMTX ตอบ ${res.status}`);
  }

  private call(method: string, path: string) {
    return fetch(`${this.config.mediaApiUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.config.mediaServerSecret ?? ''}` },
      signal: AbortSignal.timeout(5000),
    });
  }
}
