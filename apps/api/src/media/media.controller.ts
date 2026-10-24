import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { AppError } from '../common/app-error.js';
import { MediaService, type MediaAuthRequest } from './media.service.js';

// MediaMTX เรียกถามสิทธิ์ทุกครั้งที่กล้องส่งภาพหรือมีคนดู ตอบ 2xx = ผ่าน
@Controller('media')
@Public()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('auth')
  @HttpCode(204)
  async auth(@Body() body: MediaAuthRequest | undefined): Promise<void> {
    if (!(await this.media.authorize(body ?? {}))) {
      throw new AppError(401, 'MEDIA_DENIED', 'ไม่มีสิทธิ์');
    }
  }
}
