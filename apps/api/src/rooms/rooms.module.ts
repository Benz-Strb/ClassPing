import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller.js';
import { RoomsRepo } from './rooms.repo.js';

@Module({
  controllers: [RoomsController],
  providers: [RoomsRepo],
  exports: [RoomsRepo],
})
export class RoomsModule {}
