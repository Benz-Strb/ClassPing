import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatRepository } from './chat.repo.js';
import { ChatService } from './chat.service.js';
import { CHAT_PROVIDER } from './chat.provider.js';
import { createChatProvider } from './gemini.provider.js';

@Module({
  exports: [CHAT_PROVIDER],
  controllers: [ChatController],
  providers: [ChatRepository, ChatService, { provide: CHAT_PROVIDER, useFactory: () => createChatProvider() }],
})
export class ChatModule {}
