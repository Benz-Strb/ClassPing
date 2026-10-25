import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import {
  LiveService,
  type LiveFacesView,
  type LiveSessionView,
  type LiveTicket,
} from './live.service.js';

// อาจารย์ (รวมคนคุมสอบ) กับแอดมิน สิทธิ์รายคาบตรวจใน LiveService
@Controller()
@Roles('teacher')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Get('live/sessions')
  list(@CurrentUser() user: AppUser, @Query('date') date = ''): Promise<LiveSessionView[]> {
    return this.live.listForDate(user, String(date));
  }

  @Post('sessions/:id/live')
  @HttpCode(200)
  start(@CurrentUser() user: AppUser, @Param('id') id: string): Promise<LiveTicket> {
    return this.live.startLive(user, id);
  }

  @Get('sessions/:id/live/faces')
  faces(@CurrentUser() user: AppUser, @Param('id') id: string): Promise<LiveFacesView> {
    return this.live.faces(user, id);
  }
}
