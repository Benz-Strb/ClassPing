import type { Bucket, CleanupRepo, StoredFile } from './cleanup.repo.js';
import { OrphanFilesRunner, sweepBucket } from './orphan-files.runner.js';

const LIVE = '11111111-1111-4111-8111-111111111111';
const GONE = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-23T12:00:00Z');
const OLD = new Date('2026-10-23T10:00:00Z');
const FRESH = new Date('2026-10-23T11:30:00Z');

function fakeRepo(
  tree: Record<string, StoredFile[]>,
  opts: {
    owners?: string[];
    refs?: Record<string, string[]>;
    failFolders?: Bucket;
  } = {},
) {
  const removed: { bucket: Bucket; paths: string[] }[] = [];
  const repo: CleanupRepo = {
    folders: async (bucket) => {
      if (opts.failFolders === bucket) throw new Error('storage down');
      return Object.keys(tree);
    },
    files: async (_bucket, folder) => tree[folder] ?? [],
    existingOwners: async (_bucket, ids) =>
      new Set(ids.filter((id) => (opts.owners ?? [LIVE]).includes(id))),
    referenced: async (_bucket, paths) =>
      new Set(
        paths.filter((p) =>
          Object.values(opts.refs ?? {})
            .flat()
            .includes(p),
        ),
      ),
    remove: async (bucket, paths) => void removed.push({ bucket, paths }),
  };
  return { repo, removed };
}

describe('sweepBucket', () => {
  it('เจ้าของหายไปแล้ว ลบทุกไฟล์ที่เก่ากว่าชั่วโมง', async () => {
    const { repo, removed } = fakeRepo({
      [GONE]: [
        { path: `${GONE}/a.jpg`, createdAt: OLD },
        { path: `${GONE}/b.jpg`, createdAt: FRESH },
      ],
    });
    expect(await sweepBucket(repo, 'captures', NOW)).toBe(1);
    expect(removed).toEqual([{ bucket: 'captures', paths: [`${GONE}/a.jpg`] }]);
  });

  it('เจ้าของยังอยู่ ลบเฉพาะไฟล์ที่ไม่มีแถวชี้ถึง', async () => {
    const { repo, removed } = fakeRepo(
      {
        [LIVE]: [
          { path: `${LIVE}/kept.jpg`, createdAt: OLD },
          { path: `${LIVE}/stray.jpg`, createdAt: OLD },
        ],
      },
      { refs: { [LIVE]: [`${LIVE}/kept.jpg`] } },
    );
    expect(await sweepBucket(repo, 'faces', NOW)).toBe(1);
    expect(removed).toEqual([{ bucket: 'faces', paths: [`${LIVE}/stray.jpg`] }]);
  });

  it('ไฟล์ที่เพิ่งอัปโหลดยังไม่ลบ แม้ยังไม่มีแถว', async () => {
    const { repo, removed } = fakeRepo({
      [LIVE]: [{ path: `${LIVE}/new.jpg`, createdAt: FRESH }],
    });
    expect(await sweepBucket(repo, 'captures', NOW)).toBe(0);
    expect(removed).toEqual([]);
  });

  it('โฟลเดอร์ที่ชื่อไม่ใช่ id ไม่แตะ', async () => {
    const { repo, removed } = fakeRepo(
      { test: [{ path: 'test/x.jpg', createdAt: OLD }] },
      { owners: [] },
    );
    expect(await sweepBucket(repo, 'captures', NOW)).toBe(0);
    expect(removed).toEqual([]);
  });
});

describe('OrphanFilesRunner', () => {
  it('bucket หนึ่งพัง อีก bucket ยังทำต่อ และไม่ throw ออกไป', async () => {
    const { repo, removed } = fakeRepo(
      { [GONE]: [{ path: `${GONE}/a.jpg`, createdAt: OLD }] },
      { failFolders: 'captures' },
    );
    await expect(new OrphanFilesRunner(repo, () => NOW).run()).resolves.toBeUndefined();
    expect(removed).toEqual([{ bucket: 'faces', paths: [`${GONE}/a.jpg`] }]);
  });
});
