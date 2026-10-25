import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { Body, Controller, Get, HttpCode, Inject, Logger, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { AppError } from '../common/app-error.js';
import { shiftTime, splitInit, timescale } from './fmp4.js';
import { hlsPlaylist, hlsSegments } from './hls.js';
import { PLAYBACK_CLIENT, type PlaybackClient } from './playback.client.js';
import { RecordingService, type RecordingView } from './recording.service.js';

@Controller('sessions/:id/recording')
@Roles('teacher')
export class RecordingController {
  constructor(private readonly recording: RecordingService) {}

  @Get()
  list(@CurrentUser() user: AppUser, @Param('id') id: string): Promise<RecordingView> {
    return this.recording.list(user, id);
  }

  @Post('link')
  @HttpCode(200)
  link(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ url: string }> {
    return this.recording.link(user, id, body);
  }
}

// เปิดจากตัวเล่นหรือการดาวน์โหลด ใช้ลิงก์อายุสั้นแทน login (ตรวจสิทธิ์ตอนออกลิงก์แล้ว)
@Controller('clips')
@Public()
export class ClipsController {
  private readonly logger = new Logger(ClipsController.name);

  constructor(
    private readonly recording: RecordingService,
    @Inject(PLAYBACK_CLIENT) private readonly playback: PlaybackClient,
  ) {}

  @Get(':token/index.m3u8')
  playlist(@Param('token') token: string, @Res() res: Response): void {
    const clip = this.recording.openClip(token);
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('application/vnd.apple.mpegurl').send(hlsPlaylist(clip.duration));
  }

  @Get(':token/init.mp4')
  async init(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const clip = this.recording.openClip(token);
    const first = await this.fetch(clip.path, clip.start, Math.min(1, clip.duration));
    this.sendMp4(res, splitInit(first).init);
  }

  @Get(':token/seg/:n')
  async segment(
    @Param('token') token: string,
    @Param('n') n: string,
    @Res() res: Response,
  ): Promise<void> {
    const clip = this.recording.openClip(token);
    const seg = /^\d+$/.test(n) ? hlsSegments(clip.duration)[Number(n)] : undefined;
    if (!seg) throw new AppError(404, 'NO_RECORDING', 'ไม่มีไฟล์อัดช่วงนี้');
    const start = new Date(clip.start.getTime() + seg.offset * 1000);
    const { init, media } = splitInit(await this.fetch(clip.path, start, seg.length));
    const ticks = BigInt(Math.round(seg.offset * timescale(init)));
    this.sendMp4(res, shiftTime(media, ticks));
  }

  @Get(':token')
  async download(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const clip = this.recording.openClip(token);
    // ลิงก์ดูย้อนหลังใช้ได้แค่ทีละท่อน คนที่ไม่มีสิทธิ์ดาวน์โหลดจะได้ไม่ได้ไฟล์ทั้งคลิป
    if (!clip.download) {
      throw new AppError(
        403,
        'DOWNLOAD_NOT_ALLOWED',
        'ดาวน์โหลดได้เฉพาะอาจารย์ประจำวิชาและผู้ดูแลระบบ',
      );
    }
    const upstream = await this.playback.clip(clip.path, clip.start, clip.duration, 'mp4');
    res.status(200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${clip.filename}"`);
    if (!upstream.body) {
      res.end();
      return;
    }
    // ส่งต่อทีละก้อน ไม่พักทั้งไฟล์ในหน่วยความจำ ยกเลิกดาวน์โหลดแล้วหยุดดึงจาก MediaMTX
    const stream = Readable.fromWeb(upstream.body as ReadableStream<Uint8Array>);
    res.on('close', () => stream.destroy());
    stream.on('error', (error) => {
      this.logger.warn(`ส่งคลิปไม่จบ: ${String(error)}`);
      res.destroy();
    });
    stream.pipe(res);
  }

  private async fetch(path: string, start: Date, duration: number): Promise<Buffer> {
    const res = await this.playback.clip(path, start, duration, 'fmp4');
    return Buffer.from(await res.arrayBuffer());
  }

  private sendMp4(res: Response, body: Buffer) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('video/mp4').send(body);
  }
}
