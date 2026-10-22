import {
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../auth/auth.decorators.js';
import type { UploadedImage } from '../enrollment/enrollment.service.js';
import {
  MAX_IMAGE_BYTES,
  UploadErrorsInterceptor,
} from '../enrollment/upload-errors.interceptor.js';
import { CameraGuard } from './camera.guard.js';
import type { CameraIdentity } from './camera.repo.js';
import { CameraService, type CameraSession } from './camera.service.js';

const CurrentCamera = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CameraIdentity =>
    ctx.switchToHttp().getRequest<{ camera: CameraIdentity }>().camera,
);

// เรียกจากโปรแกรมกล้องในห้อง ไม่ใช่ผู้ใช้ที่ login
@Controller('camera')
@Public()
@UseGuards(CameraGuard)
export class CameraController {
  constructor(private readonly camera: CameraService) {}

  @Get('session')
  session(@CurrentCamera() camera: CameraIdentity): Promise<CameraSession> {
    return this.camera.currentSession(camera);
  }

  @Post('frames')
  @HttpCode(202)
  @UseInterceptors(
    UploadErrorsInterceptor,
    FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }),
  )
  frame(
    @CurrentCamera() camera: CameraIdentity,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<{ queued: true }> {
    return this.camera.acceptFrame(camera, file);
  }
}
