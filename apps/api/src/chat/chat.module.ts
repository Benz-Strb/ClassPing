import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatRepository } from './chat.repo.js';
import { ChatService } from './chat.service.js';
import { CHAT_PROVIDER, MockChatProvider } from './chat.provider.js';

@Module({
  exports: [CHAT_PROVIDER],
  controllers: [ChatController],
  providers: [ChatRepository, ChatService, { provide: CHAT_PROVIDER, useClass: MockChatProvider }],
})
export class ChatModule {}
