import { Module } from '@nestjs/common';
import { CLOCK } from '../common/clock.js';
import { ChatController } from './chat.controller.js';
import { PublicChatLimitGuard } from './public-chat.guard.js';
import { StudyChatLimitGuard } from './study-chat.guard.js';
import { ChatRepository } from './chat.repo.js';
import { ChatService } from './chat.service.js';
import { CHAT_PROVIDER } from './chat.provider.js';
import { createChatProvider } from './gemini.provider.js';

@Module({
  exports: [CHAT_PROVIDER],
  controllers: [ChatController],
  providers: [{ provide: CLOCK, useValue: () => new Date() }, PublicChatLimitGuard, StudyChatLimitGuard, ChatRepository, ChatService, { provide: CHAT_PROVIDER, useFactory: () => createChatProvider() }],
})
export class ChatModule {}
