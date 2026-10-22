import type { ExecutionContext } from '@nestjs/common';
import { CameraGuard } from './camera.guard.js';
import type { CameraIdentity, CameraRepo } from './camera.repo.js';
import { hashToken } from './camera-token.js';

const camera: CameraIdentity = { id: 'cam1', roomId: 'r1', kind: 'front' };

function setup() {
  const touched: string[] = [];
  const repo: CameraRepo = {
    findByTokenHash: async (hash) => (hash === hashToken('good') ? camera : null),
    touch: async (id) => {
      touched.push(id);
    },
    liveSession: async () => null,
  };
  let now = new Date('2026-10-22T02:00:00Z');
  const guard = new CameraGuard(repo, () => now);
  const run = (token?: string) => {
    const req: { headers: Record<string, string | undefined>; camera?: CameraIdentity } = {
      headers: { 'x-camera-token': token },
    };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
    return guard.canActivate(ctx).then((ok) => ({ ok, req }));
  };
  return { run, touched, later: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe('CameraGuard', () => {
  it('ไม่มี token หรือ token ผิดได้ 401 BAD_CAMERA_TOKEN', async () => {
    const { run } = setup();
    await expect(run()).rejects.toMatchObject({ status: 401, code: 'BAD_CAMERA_TOKEN' });
    await expect(run('bad')).rejects.toMatchObject({ status: 401, code: 'BAD_CAMERA_TOKEN' });
  });

  it('token ถูกผูกกล้องกับ request', async () => {
    const { run } = setup();
    const { ok, req } = await run('good');
    expect(ok).toBe(true);
    expect(req.camera).toEqual(camera);
  });

  it('บันทึกเวลาที่กล้องติดต่อมาไม่เกินนาทีละครั้ง', async () => {
    const { run, touched, later } = setup();
    await run('good');
    await run('good');
    later(61_000);
    await run('good');
    expect(touched).toEqual(['cam1', 'cam1']);
  });
});
