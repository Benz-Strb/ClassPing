import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError } from '../common/app-error.js';
import { CurriculaController } from './curricula.controller.js';
import type { CatalogService } from './catalog.service.js';
import type { LeaveOcrClient } from '../leave/leave-ocr.client.js';

function setup() {
  const readLeaveDocument = vi.fn().mockResolvedValue({ lines: [{ text: ' หลักสูตรตัวอย่าง ' }, { text: '' }, { text: 'รายละเอียด' }] });
  const catalog = { create: vi.fn() };
  const controller = new CurriculaController(catalog as unknown as CatalogService, { readLeaveDocument } as unknown as LeaveOcrClient);
  return { controller, readLeaveDocument, catalog };
}

const teacher = { id: 'teacher-1', studentId: null, fullName: 'อาจารย์ทดสอบ' };
const file = (mime: string, buffer: Buffer) => ({ mimetype: mime, buffer, size: buffer.length });

it.each([
  file('application/pdf', Buffer.from('%PDF-1.7')),
  file('image/jpeg', Buffer.from([0xff, 0xd8, 0xff])),
  file('image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
])('returns a reviewable draft for $mimetype without saving it', async (upload) => {
  const { controller, readLeaveDocument, catalog } = setup();
  await expect(controller.previewDocument(teacher, upload)).resolves.toEqual({ content: 'หลักสูตรตัวอย่าง\nรายละเอียด' });
  expect(readLeaveDocument).toHaveBeenCalledWith(upload.buffer, upload.mimetype);
  expect(catalog.create).not.toHaveBeenCalled();
});

it('rejects a missing, disguised, or oversized file before OCR', async () => {
  const { controller, readLeaveDocument } = setup();
  await expect(controller.previewDocument(teacher)).rejects.toMatchObject({ status: 400 });
  await expect(controller.previewDocument(teacher, file('application/pdf', Buffer.from('not PDF')))).rejects.toMatchObject({ status: 400 });
  await expect(controller.previewDocument(teacher, { ...file('application/pdf', Buffer.from('%PDF-')), size: 11 * 1024 * 1024 })).rejects.toMatchObject({ status: 413 });
  expect(readLeaveDocument).not.toHaveBeenCalled();
});

it('reports unreadable documents and unavailable OCR', async () => {
  const { controller, readLeaveDocument } = setup();
  const upload = file('application/pdf', Buffer.from('%PDF-'));
  readLeaveDocument.mockResolvedValueOnce({ lines: [{ text: ' ' }] });
  await expect(controller.previewDocument(teacher, upload)).rejects.toMatchObject({ status: 400, code: 'CURRICULUM_OCR_EMPTY' });
  readLeaveDocument.mockResolvedValueOnce({ lines: [{ text: 'x'.repeat(50_001) }] });
  await expect(controller.previewDocument(teacher, upload)).rejects.toMatchObject({ status: 400, code: 'CURRICULUM_OCR_TOO_LONG' });
  readLeaveDocument.mockRejectedValueOnce(new AppError(503, 'LEAVE_OCR_UNAVAILABLE', 'Unavailable'));
  await expect(controller.previewDocument(teacher, upload)).rejects.toMatchObject({ status: 503, code: 'CURRICULUM_OCR_UNAVAILABLE' });
});

it('writes a successful curriculum preview as UTF-8 text without saving a catalog entry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'curriculum-ocr-'));
  vi.stubEnv('CURRICULUM_OCR_LOG_DIR', directory);
  const { controller, catalog } = setup();
  try {
    await controller.previewDocument(teacher, file('application/pdf', Buffer.from('%PDF-')));
    const [filename] = await readdir(directory);
    expect(filename).toBe('teacher-1_อาจารย์ทดสอบ_หลักสูตร.txt');
    expect(await readFile(join(directory, filename), 'utf8')).toContain('หลักสูตรตัวอย่าง\nรายละเอียด');
    expect(catalog.create).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true });
  }
});
