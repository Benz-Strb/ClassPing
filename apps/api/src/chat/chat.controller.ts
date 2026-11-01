import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { ChatService } from './chat.service.js';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}
  @Public()
  @Post('public')
  @HttpCode(200)
  publicAsk(@Body() body: unknown) { return this.chat.ask(body, null); }
  @Post('student')
  @HttpCode(200)
  studentAsk(@CurrentUser() user: AppUser, @Body() body: unknown) { return this.chat.ask(body, user); }
  @Roles('admin')
  @Post('knowledge')
  ingest(@Body() body: unknown) { return this.chat.ingest(body); }
  @Roles('admin')
  @Delete('knowledge/:key')
  remove(@Param('key') key: string) { return this.chat.remove(key); }
}
