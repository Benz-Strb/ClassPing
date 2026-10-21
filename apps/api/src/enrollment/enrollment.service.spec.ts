import { randomUUID } from 'node:crypto';
import type { AppUser, UsersService } from '../users/users.service.js';
import type { EnrollmentRepo, FaceRow } from './enrollment.repo.js';
import { EnrollmentService } from './enrollment.service.js';
import { POSES, type Pose } from './pose-check.js';

// face_profiles + users + Storage ปลอมในหน่วยความจำ
class InMemoryEnrollmentRepo implements EnrollmentRepo {
  rows = new Map<string, Map<Pose, FaceRow & { model: string }>>();
  files = new Map<string, Buffer>();
  userIds = new Set<string>();

  async listByUser(userId: string) {
    return [...(this.rows.get(userId)?.values() ?? [])].map(({ pose, imagePath, embedding }) => ({
      pose,
      imagePath,
      embedding,
    }));
  }
  async savePose(userId: string, row: FaceRow & { model: string }) {
    const poses = this.rows.get(userId) ?? new Map();
    poses.set(row.pose, row);
    this.rows.set(userId, poses);
  }
  async deleteByUser(userId: string) {
    const paths = [...(this.rows.get(userId)?.values() ?? [])].map((r) => r.imagePath);
    this.rows.delete(userId);
    return paths;
  }
  async uploadImage(path: string, bytes: Buffer) {
    this.files.set(path, bytes);
  }
  async removeImages(paths: string[]) {
    paths.forEach((p) => this.files.delete(p));
  }
  async userExists(userId: string) {
    return this.userIds.has(userId);
  }
}

const student = (patch: Partial<AppUser> = {}): AppUser => ({
  id: randomUUID(),
  email: '66112106@dpu.ac.th',
  fullName: null,
  role: 'student',
  studentId: '66112106',
  pdpaConsentAt: '2026-10-21T00:00:00.000Z',
  ...patch,
});

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const e = error as { getStatus(): number; code: string; message: string };
    return { status: e.getStatus(), code: e.code, message: e.message };
  }
  throw new Error('คาดว่าจะ throw แต่ไม่ throw');
}

function storeRow(repo: InMemoryEnrollmentRepo, userId: string, pose: Pose) {
  const imagePath = `${userId}/${pose}-old.jpg`;
  repo.files.set(imagePath, Buffer.from('x'));
  return repo.savePose(userId, { pose, imagePath, embedding: [1, 0], model: 'buffalo_l' });
}

function setup() {
  const repo = new InMemoryEnrollmentRepo();
  const consented: string[] = [];
  const users = {
    setConsent: async (userId: string) => {
      consented.push(userId);
      return student({ id: userId });
    },
  } as unknown as UsersService;
  return { repo, consented, service: new EnrollmentService(repo, users) };
}

describe('EnrollmentService.consent', () => {
  it('บัญชีที่ไม่มีรหัสนักศึกษาได้ 403 NOT_A_STUDENT', async () => {
    const { service, consented } = setup();
    const teacher = student({ role: 'teacher', studentId: null, pdpaConsentAt: null });
    expect(await rejection(service.consent(teacher))).toMatchObject({
      status: 403,
      code: 'NOT_A_STUDENT',
    });
    expect(consented).toEqual([]);
  });

  it('นักศึกษายินยอมได้', async () => {
    const { service, consented } = setup();
    const me = student({ pdpaConsentAt: null });
    await service.consent(me);
    expect(consented).toEqual([me.id]);
  });
});

describe('EnrollmentService.status', () => {
  it('ยังไม่มีท่าไหนเลย', async () => {
    const { service } = setup();
    expect(await service.status(student())).toEqual({ done: [], complete: false });
  });

  it('เรียงท่าตามลำดับ POSES ไม่ใช่ลำดับที่ถ่าย', async () => {
    const { service, repo } = setup();
    const me = student();
    await storeRow(repo, me.id, 'left');
    await storeRow(repo, me.id, 'front');
    expect(await service.status(me)).toEqual({ done: ['front', 'left'], complete: false });
  });

  it('ครบ 5 ท่าแล้ว complete', async () => {
    const { service, repo } = setup();
    const me = student();
    for (const pose of POSES) await storeRow(repo, me.id, pose);
    expect(await service.status(me)).toEqual({ done: [...POSES], complete: true });
  });

  it('บัญชีที่ไม่มีรหัสนักศึกษาได้ 403', async () => {
    const { service } = setup();
    expect(await rejection(service.status(student({ studentId: null })))).toMatchObject({
      code: 'NOT_A_STUDENT',
    });
  });
});

describe('EnrollmentService.reset', () => {
  it('ลบทุกท่าและไฟล์รูป', async () => {
    const { service, repo } = setup();
    const me = student();
    repo.userIds.add(me.id);
    await storeRow(repo, me.id, 'front');
    await storeRow(repo, me.id, 'left');

    await service.reset(me.id);

    expect(await repo.listByUser(me.id)).toEqual([]);
    expect(repo.files.size).toBe(0);
  });

  it('ยังไม่เคยลงทะเบียนก็รีเซ็ตได้', async () => {
    const { service, repo } = setup();
    const id = randomUUID();
    repo.userIds.add(id);
    await expect(service.reset(id)).resolves.toBeUndefined();
  });

  it('ลบไฟล์ไม่สำเร็จก็ยังนับว่ารีเซ็ตแล้ว', async () => {
    const { service, repo } = setup();
    const me = student();
    repo.userIds.add(me.id);
    await storeRow(repo, me.id, 'front');
    repo.removeImages = async () => {
      throw new Error('storage down');
    };
    await expect(service.reset(me.id)).resolves.toBeUndefined();
    expect(await repo.listByUser(me.id)).toEqual([]);
  });

  it.each(['not-a-uuid', randomUUID()])('ไม่มีผู้ใช้ %s ได้ 404 USER_NOT_FOUND', async (id) => {
    const { service } = setup();
    expect(await rejection(service.reset(id))).toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});
