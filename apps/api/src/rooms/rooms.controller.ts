import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import { RoomsRepo, type Room } from './rooms.repo.js';

@Controller('rooms')
@Roles('teacher')
export class RoomsController {
  constructor(private readonly rooms: RoomsRepo) {}

  @Get()
  list(): Promise<Room[]> {
    return this.rooms.list();
  }
}
