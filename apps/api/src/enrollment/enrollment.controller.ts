import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { EnrollmentService, type FaceStatus, type UploadedImage } from './enrollment.service.js';
import { MAX_CARD_BYTES, MAX_IMAGE_BYTES, CardUploadErrorsInterceptor, UploadErrorsInterceptor } from './upload-errors.interceptor.js';
import { AppError } from '../common/app-error.js';
import { IdentityLimitGuard } from './identity-limit.guard.js';

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

  // ภาพบัตรอยู่ในหน่วยความจำของ request นี้เท่านั้น (multer เก็บใน memory เป็นค่าเริ่มต้น)
  @Post('me/identity')
  @HttpCode(200)
  @UseGuards(IdentityLimitGuard)
  @UseInterceptors(
    CardUploadErrorsInterceptor,
    FileFieldsInterceptor(
      [
        { name: 'card', maxCount: 1 },
        { name: 'face', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_CARD_BYTES, files: 2 } },
    ),
  )
  verifyIdentity(
    @CurrentUser() user: AppUser,
    @UploadedFiles() files: { card?: UploadedImage[]; face?: UploadedImage[] } | undefined,
  ): Promise<FaceStatus> {
    if ((files?.face?.[0]?.buffer.length ?? 0) > MAX_IMAGE_BYTES) {
      throw new AppError(413, 'IMAGE_TOO_LARGE', 'รูปหน้าใหญ่เกิน 5 MB');
    }
    return this.enrollment.verifyIdentity(user, files?.card?.[0], files?.face?.[0]);
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
  async reset(
    @Param('id') id: string,
    @Query('withdraw') withdraw?: string,
  ): Promise<{ reset: true; withdrawn: boolean }> {
    const withdrawn = withdraw === '1';
    await this.enrollment.reset(id, { withdraw: withdrawn });
    return { reset: true, withdrawn };
  }
}
