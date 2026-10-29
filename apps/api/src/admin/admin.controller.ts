import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import type { AdminUser, CameraView, RoomView } from './admin.repo.js';
import { AdminService } from './admin.service.js';

@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(): Promise<AdminUser[]> {
    return this.admin.listUsers();
  }

  @Patch('users/:id/role')
  changeRole(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminUser> {
    return this.admin.changeRole(id, body);
  }

  @Get('rooms')
  listRooms(): Promise<RoomView[]> {
    return this.admin.listRooms();
  }

  @Post('rooms')
  createRoom(@Body() body: unknown): Promise<RoomView> {
    return this.admin.createRoom(body);
  }

  @Get('cameras')
  listCameras(): Promise<CameraView[]> {
    return this.admin.listCameras();
  }

  @Post('cameras/:roomId/token')
  createCameraToken(
    @Param('roomId') roomId: string,
  ): Promise<{ cameraId: string; roomId: string; token: string }> {
    return this.admin.createCameraToken(roomId);
  }
}
