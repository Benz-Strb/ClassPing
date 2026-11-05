import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { TripsService, type OutOfRoomReportRow } from './trips.service.js';

@Controller('courses/:id/out-of-room')
@Roles('teacher', 'admin')
export class OutOfRoomController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  report(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ): Promise<OutOfRoomReportRow[]> {
    return this.trips.report(user, id, query);
  }
}
