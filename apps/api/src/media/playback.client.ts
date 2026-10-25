import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

export interface Segment {
  start: Date;
  // วินาที
  duration: number;
}

export interface PlaybackClient {
  list(path: string, from: Date, to: Date): Promise<Segment[]>;
  clip(path: string, start: Date, duration: number, format: 'mp4' | 'fmp4'): Promise<Response>;
}

export const PLAYBACK_CLIENT = Symbol('PLAYBACK_CLIENT');

const unavailable = () =>
  new AppError(503, 'RECORDING_UNAVAILABLE', 'ตอนนี้เปิดไฟล์อัดไม่ได้ ลองใหม่อีกครั้ง');

// playback server ของ MediaMTX (compose ผูกพอร์ตไว้กับ 127.0.0.1) ส่ง secret เป็น Bearer
@Injectable()
export class HttpPlaybackClient implements PlaybackClient {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async list(path: string, from: Date, to: Date): Promise<Segment[]> {
    const res = await this.call('/list', {
      path,
      start: from.toISOString(),
      end: to.toISOString(),
    });
    // ยังไม่มีไฟล์ของ path นี้ MediaMTX ตอบ 400 (ไม่มีโฟลเดอร์) หรือ 404
    if (res.status === 400 || res.status === 404) return [];
    if (!res.ok) throw unavailable();
    const items = (await res.json()) as { start: string; duration: number }[];
    return items.map((i) => ({ start: new Date(i.start), duration: i.duration }));
  }

  // mp4 สำหรับดาวน์โหลด (ไฟล์บอกความยาวครบ) fmp4 สำหรับท่อน HLS
  async clip(
    path: string,
    start: Date,
    duration: number,
    format: 'mp4' | 'fmp4',
  ): Promise<Response> {
    const res = await this.call('/get', {
      path,
      start: start.toISOString(),
      duration: String(duration),
      format,
    });
    if (res.status === 404) throw new AppError(404, 'NO_RECORDING', 'ไม่มีไฟล์อัดช่วงนี้');
    if (!res.ok) throw unavailable();
    return res;
  }

  private async call(path: string, params: Record<string, string>): Promise<Response> {
    const url = `${this.config.mediaPlaybackUrl}${path}?${new URLSearchParams(params)}`;
    try {
      return await fetch(url, {
        headers: { authorization: `Bearer ${this.config.mediaServerSecret ?? ''}` },
      });
    } catch {
      throw unavailable();
    }
  }
}
