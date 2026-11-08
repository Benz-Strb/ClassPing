import type {
  AdminRepo,
  AdminUser,
  CameraView,
  RoomView,
} from './admin.repo.js';
import type { AppConfig } from '../config/config.js';
import { AdminService } from './admin.service.js';

function fakeRepo() {
  const users: AdminUser[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      email: '66112106@dpu.ac.th',
      fullName: 'นักศึกษา ทดสอบ',
      role: 'student',
      studentId: '66112106',
      hasFace: true,
    },
  ];
  const rooms: RoomView[] = [
    { id: '22222222-2222-4222-8222-222222222222', name: 'ห้อง 101' },
  ];
  const cameras: CameraView[] = [];
  const repo: AdminRepo = {
    listUsers: async () => users,
    updateUserRole: async (id, role) => {
      const user = users.find((item) => item.id === id);
      if (!user) return null;
      user.role = role;
      return user;
    },
    listRooms: async () => rooms,
    createRoom: async (name) => {
      const room = { id: '33333333-3333-4333-8333-333333333333', name };
      rooms.push(room);
      return room;
    },
    findRoom: async (id) => rooms.find((room) => room.id === id) ?? null,
    listCameras: async () => cameras,
    findUser: async (id) => users.find((item) => item.id === id) ?? null,
    saveCameraToken: async (roomId) => ({
      id: '44444444-4444-4444-8444-444444444444',
      roomId,
    }),
  };
  return { repo, users, rooms };
}

describe('AdminService', () => {
  it('คืนรายชื่อผู้ใช้พร้อม role และสถานะลงทะเบียนใบหน้า', async () => {
    const { repo } = fakeRepo();
    await expect(new AdminService(repo).listUsers()).resolves.toEqual([
      expect.objectContaining({ role: 'student', hasFace: true }),
    ]);
  });

  it('เปลี่ยน role เฉพาะค่าที่อนุญาต', async () => {
    const { repo } = fakeRepo();
    const service = new AdminService(repo);
    await expect(
      service.changeRole('11111111-1111-4111-8111-111111111111', {
        role: 'teacher',
      }),
    ).resolves.toMatchObject({ role: 'teacher' });
    await expect(
      service.changeRole('11111111-1111-4111-8111-111111111111', {
        role: 'owner',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });

  it('เปลี่ยน role ของ id ที่ไม่มีอยู่ได้ USER_NOT_FOUND', async () => {
    const { repo } = fakeRepo();
    await expect(
      new AdminService(repo).changeRole(
        '99999999-9999-4999-8999-999999999999',
        {
          role: 'teacher',
        },
      ),
    ).rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
  });

  it('เพิ่มห้องโดยตัดช่องว่าง และไม่รับชื่อว่าง', async () => {
    const { repo } = fakeRepo();
    const service = new AdminService(repo);
    await expect(
      service.createRoom({ name: '  ห้อง 202  ' }),
    ).resolves.toMatchObject({
      name: 'ห้อง 202',
    });
    await expect(service.createRoom({ name: '   ' })).rejects.toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('สร้าง token ใหม่ เก็บเฉพาะ hash และคืน token จริงเพียงครั้งเดียว', async () => {
    const { repo } = fakeRepo();
    let savedHash = '';
    repo.saveCameraToken = async (roomId, tokenHash) => {
      savedHash = tokenHash;
      return { id: '44444444-4444-4444-8444-444444444444', roomId };
    };
    const result = await new AdminService(repo).createCameraToken(
      '22222222-2222-4222-8222-222222222222',
    );
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(savedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(savedHash).not.toBe(result.token);
  });

  it('ออก token กล้องประตูได้ และไม่ระบุชนิดคือกล้องหน้าห้อง', async () => {
    const { repo } = fakeRepo();
    const kinds: string[] = [];
    repo.saveCameraToken = async (roomId, _hash, kind) => {
      kinds.push(kind);
      return { id: '44444444-4444-4444-8444-444444444444', roomId };
    };
    const service = new AdminService(repo);
    const room = '22222222-2222-4222-8222-222222222222';
    await service.createCameraToken(room, { kind: 'door' });
    await service.createCameraToken(room, undefined);
    await service.createCameraToken(room, {});
    expect(kinds).toEqual(['door', 'front', 'front']);
  });

  it('ชนิดกล้องที่ไม่รู้จักได้ 400', async () => {
    const { repo } = fakeRepo();
    await expect(
      new AdminService(repo).createCameraToken(
        '22222222-2222-4222-8222-222222222222',
        { kind: 'side' },
      ),
    ).rejects.toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });

  it('ไม่เปลี่ยนบทบาทของเมลใน ADMIN_EMAILS เพราะจะถูกยกกลับเป็นแอดมินทุกคำขอ', async () => {
    const { repo, users } = fakeRepo();
    users[0].email = 'boss@dpu.ac.th';
    const service = new AdminService(repo, {
      adminEmails: ['boss@dpu.ac.th'],
    } as AppConfig);
    await expect(
      service.changeRole(users[0].id, { role: 'teacher' }),
    ).rejects.toMatchObject({ status: 400, code: 'ADMIN_EMAIL_LOCKED' });
    expect(users[0].role).toBe('student');
    await expect(
      service.changeRole(users[0].id, { role: 'admin' }),
    ).resolves.toMatchObject({ role: 'admin' });
  });

  it('ไม่สร้าง token ให้ห้องที่ไม่มีอยู่', async () => {
    const { repo } = fakeRepo();
    await expect(
      new AdminService(repo).createCameraToken(
        '99999999-9999-4999-8999-999999999999',
      ),
    ).rejects.toMatchObject({ status: 404, code: 'ROOM_NOT_FOUND' });
  });

  it('คืนรายชื่อห้องและกล้องจาก repo', async () => {
    const { repo, rooms } = fakeRepo();
    await expect(new AdminService(repo).listRooms()).resolves.toEqual(rooms);
    await expect(new AdminService(repo).listCameras()).resolves.toEqual([]);
  });
});
