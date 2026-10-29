import { ROLES_KEY } from '../auth/auth.decorators.js';
import { AdminController } from './admin.controller.js';
import type { AdminService } from './admin.service.js';

describe('AdminController', () => {
  it('จำกัดทุก endpoint ใน controller ให้เฉพาะ admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController)).toEqual(['admin']);
  });

  it('ส่งคำขอเปลี่ยน role ไป service พร้อม id และ body', async () => {
    const calls: unknown[] = [];
    const service = {
      changeRole: async (...args: unknown[]) => {
        calls.push(args);
        return { id: 'u1', role: 'teacher' };
      },
    } as unknown as AdminService;
    const controller = new AdminController(service);
    await expect(
      controller.changeRole('u1', { role: 'teacher' }),
    ).resolves.toMatchObject({
      role: 'teacher',
    });
    expect(calls).toEqual([['u1', { role: 'teacher' }]]);
  });

  it('ส่ง roomId ไปสร้าง token และคืน token จาก service', async () => {
    const service = {
      createCameraToken: async (roomId: string) => ({
        cameraId: 'camera-1',
        roomId,
        token: 'camera-token',
      }),
    } as unknown as AdminService;
    const controller = new AdminController(service);
    await expect(controller.createCameraToken('room-1')).resolves.toEqual({
      cameraId: 'camera-1',
      roomId: 'room-1',
      token: 'camera-token',
    });
  });

  it('ส่ง list และ create ไป service ที่ตรงกับ endpoint', async () => {
    const service = {
      listUsers: async () => [{ id: 'u1' }],
      listRooms: async () => [{ id: 'r1', name: 'ห้อง 1' }],
      createRoom: async (body: unknown) => ({ id: 'r2', ...(body as object) }),
      listCameras: async () => [{ id: 'c1', roomId: 'r1' }],
    } as unknown as AdminService;
    const controller = new AdminController(service);

    await expect(controller.listUsers()).resolves.toEqual([{ id: 'u1' }]);
    await expect(controller.listRooms()).resolves.toEqual([
      { id: 'r1', name: 'ห้อง 1' },
    ]);
    await expect(controller.createRoom({ name: 'ห้อง 2' })).resolves.toEqual({
      id: 'r2',
      name: 'ห้อง 2',
    });
    await expect(controller.listCameras()).resolves.toEqual([
      { id: 'c1', roomId: 'r1' },
    ]);
  });
});
