import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { EnrollmentService, type FaceStatus, type UploadedImage } from './enrollment.service.js';
import { MAX_IMAGE_BYTES, UploadErrorsInterceptor } from './upload-errors.interceptor.js';

@Controller()
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Post('me/consent')
  @HttpCode(200)
  consent(@CurrentUser() user: AppUser): Promise<AppUser> {
    return this.enrollment.consent(user);
  }

  @Get('me/face')
  status(@CurrentUser() user: AppUser): Promise<FaceStatus> {
    return this.enrollment.status(user);
  }

  @Put('me/face/:pose')
  @UseInterceptors(
    UploadErrorsInterceptor,
    FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }),
  )
  savePose(
    @CurrentUser() user: AppUser,
    @Param('pose') pose: string,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<FaceStatus> {
    return this.enrollment.savePose(user, pose, file);
  }

  @Delete('users/:id/face')
  @Roles('admin')
  @HttpCode(200)
  async reset(@Param('id') id: string): Promise<{ reset: true }> {
    await this.enrollment.reset(id);
    return { reset: true };
  }
}
