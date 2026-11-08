import { Body, Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { SessionAttendance } from '../attendance/attendance.service.js';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AppUser } from '../users/users.service.js';
import { TripsService } from './trips.service.js';

@Controller('sessions/:id/trips')
@Roles('teacher', 'admin')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Patch(':tripId')
  setBack(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ): Promise<SessionAttendance> {
    return this.trips.setBack(user, id, tripId, body);
  }

  @Delete(':tripId')
  remove(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Param('tripId') tripId: string,
  ): Promise<SessionAttendance> {
    return this.trips.remove(user, id, tripId);
  }

  @Post(':tripId/review')
  @HttpCode(200)
  review(
    @CurrentUser() user: AppUser,
    @Param('id') id: string,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ): Promise<SessionAttendance> {
    return this.trips.review(user, id, tripId, body);
  }
}
