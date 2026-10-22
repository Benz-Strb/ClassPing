import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard.js';
import { CameraModule } from './camera/camera.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { EnrollmentModule } from './enrollment/enrollment.module.js';
import { RolesGuard } from './auth/roles.guard.js';
import { FaceModule } from './face/face.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { SchedulesModule } from './schedules/schedules.module.js';
import { SupabaseModule } from './supabase/supabase.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    SupabaseModule,
    FaceModule,
    UsersModule,
    RoomsModule,
    CoursesModule,
    SchedulesModule,
    EnrollmentModule,
    CameraModule,
  ],
  providers: [
    // ลำดับสำคัญ: ตรวจ login ก่อน แล้วค่อยตรวจบทบาท
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
