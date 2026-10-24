import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { Body, Controller, Get, HttpCode, Inject, Logger, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
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

// เปิดจาก <video> หรือการดาวน์โหลด ใช้ลิงก์อายุสั้นแทน login (ตรวจสิทธิ์ตอนออกลิงก์แล้ว)
@Controller('clips')
@Public()
export class ClipsController {
  private readonly logger = new Logger(ClipsController.name);

  constructor(
    private readonly recording: RecordingService,
    @Inject(PLAYBACK_CLIENT) private readonly playback: PlaybackClient,
  ) {}

  @Get(':token')
  async clip(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const clip = this.recording.openClip(token);
    const upstream = await this.playback.clip(
      clip.path,
      clip.start,
      clip.duration,
      clip.download ? 'mp4' : 'fmp4',
    );
    res.status(200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'private, no-store');
    if (clip.download) {
      res.setHeader('Content-Disposition', `attachment; filename="${clip.filename}"`);
    }
    if (!upstream.body) {
      res.end();
      return;
    }
    // ส่งต่อทีละก้อน ไม่พักทั้งไฟล์ในหน่วยความจำ คนดูปิดหน้าแล้วหยุดดึงจาก MediaMTX
    const stream = Readable.fromWeb(upstream.body as ReadableStream<Uint8Array>);
    res.on('close', () => stream.destroy());
    stream.on('error', (error) => {
      this.logger.warn(`ส่งคลิปไม่จบ: ${String(error)}`);
      res.destroy();
    });
    stream.pipe(res);
  }
}
