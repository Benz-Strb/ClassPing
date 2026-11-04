import {
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  HttpCode,
  Body,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Public } from '../auth/auth.decorators.js';
import type { UploadedImage } from '../enrollment/enrollment.service.js';
import {
  MAX_IMAGE_BYTES,
  UploadErrorsInterceptor,
} from '../enrollment/upload-errors.interceptor.js';
import { CameraGuard } from './camera.guard.js';
import type { CameraIdentity } from './camera.repo.js';
import type { TripResult } from '../door/door.processor.js';
import { CameraService, type CameraSession } from './camera.service.js';

// รูปจากกล้องประตูเล็กกว่ารูปทั่วไป: JPEG ไม่เกิน 1 MB ต่อรูป ไม่เกิน 3 รูป
const DOOR_IMAGE_BYTES = 1024 * 1024;
const DOOR_MAX_IMAGES = 3;

class DoorUploadErrorsInterceptor extends UploadErrorsInterceptor {
  protected override maxBytes = DOOR_IMAGE_BYTES;
}

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

  @Post('door')
  @UseInterceptors(
    DoorUploadErrorsInterceptor,
    FilesInterceptor('images', DOOR_MAX_IMAGES, { limits: { fileSize: DOOR_IMAGE_BYTES } }),
  )
  door(
    @CurrentCamera() camera: CameraIdentity,
    @Body('direction') direction: string | undefined,
    @UploadedFiles() files: UploadedImage[] | undefined,
  ): Promise<{ trip: TripResult | null }> {
    return this.camera.acceptDoorCrossing(camera, direction, files ?? []);
  }
}
