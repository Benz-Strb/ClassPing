import { AppError } from '../common/app-error.js';
import { parseFacesBody, readCapturedAt } from './faces-body.js';

const unit = (): number[] => Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0));
const jpegB64 = (size = 100) => {
  const b = Buffer.alloc(size, 1);
  b.set([0xff, 0xd8, 0xff]);
  return b.toString('base64');
};
const face = (over: Record<string, unknown> = {}) => ({
  bbox: [10, 10, 110, 110],
  detScore: 0.9,
  embedding: unit(),
  liveness: 0.8,
  crop: jpegB64(),
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({
  capturedAt: '2026-10-22T02:00:00Z',
  model: 'buffalo_l',
  width: 640,
  height: 480,
  skippedSmall: 2,
  faces: [face()],
  ...over,
});

const reject = (b: unknown) => {
  try {
    parseFacesBody(b, 'buffalo_l');
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).getStatus()).toBe(400);
    expect((e as AppError).code).toBe('INVALID_FACES');
    return;
  }
  throw new Error('ควรถูกปฏิเสธ');
};

describe('parseFacesBody', () => {
  it('body ถูกต้อง 1 หน้า ได้ DetectResult', () => {
    const result = parseFacesBody(body(), 'buffalo_l');
    expect(result.width).toBe(640);
    expect(result.skippedSmall).toBe(2);
    expect(result.faces).toHaveLength(1);
    expect(result.faces[0]).toMatchObject({ pose: null, liveness: 0.8, bbox: [10, 10, 110, 110] });
  });

  it('liveness null และ crop null ได้', () => {
    const result = parseFacesBody(
      body({ faces: [face({ liveness: null, crop: null })] }),
      'buffalo_l',
    );
    expect(result.faces[0].liveness).toBeNull();
    expect(result.faces[0].crop).toBeNull();
  });

  it('ไม่มี capturedAt ก็ได้', () => {
    expect(() => parseFacesBody(body({ capturedAt: undefined }), 'buffalo_l')).not.toThrow();
  });

  it('capturedAt เป็น ISO พร้อม timezone รับและอ่านได้', () => {
    expect(readCapturedAt(body({ capturedAt: '2026-10-22T09:00:00+07:00' }))).toBe(
      '2026-10-22T09:00:00+07:00',
    );
    expect(readCapturedAt(body())).toBe('2026-10-22T02:00:00Z');
  });

  it('ไม่มี capturedAt ได้ null', () => {
    expect(readCapturedAt(body({ capturedAt: undefined }))).toBeNull();
  });

  it('capturedAt เสีย ตัดทิ้ง ไม่ปฏิเสธเฟรม', () => {
    for (const bad of ['yesterday', '2026-10-22', '2026-10-22T02:00:00', 123]) {
      expect(() => parseFacesBody(body({ capturedAt: bad }), 'buffalo_l')).not.toThrow();
      expect(readCapturedAt(body({ capturedAt: bad }))).toBeNull();
    }
  });

  it('ไม่มีหน้าเลยได้', () => {
    expect(parseFacesBody(body({ faces: [] }), 'buffalo_l').faces).toEqual([]);
  });

  it('ปฏิเสธโมเดลไม่ตรง', () => reject(body({ model: 'other' })));
  it('ปฏิเสธ embedding 511 ค่า', () =>
    reject(body({ faces: [face({ embedding: unit().slice(1) })] })));
  it('ปฏิเสธ embedding ที่มี NaN', () => {
    const e = unit();
    e[3] = NaN;
    reject(body({ faces: [face({ embedding: e })] }));
    // JSON จริงส่ง NaN ไม่ได้ กลายเป็น null
    const n = unit() as (number | null)[];
    n[3] = null;
    reject(body({ faces: [face({ embedding: n })] }));
  });
  it('ปฏิเสธ norm 0.5', () =>
    reject(body({ faces: [face({ embedding: unit().map((v) => v * 0.5) })] })));
  it('ปฏิเสธ bbox นอกภาพ', () => reject(body({ faces: [face({ bbox: [10, 10, 641, 100] })] })));
  it('ปฏิเสธ bbox กลับด้าน', () => reject(body({ faces: [face({ bbox: [50, 10, 40, 100] })] })));
  it('ปฏิเสธ liveness 1.2', () => reject(body({ faces: [face({ liveness: 1.2 })] })));
  it('ปฏิเสธ crop ที่ไม่ใช่ JPEG', () =>
    reject(body({ faces: [face({ crop: Buffer.from('not a jpeg').toString('base64') })] })));
  it('ปฏิเสธ crop เกิน 64 KB', () =>
    reject(body({ faces: [face({ crop: jpegB64(64 * 1024 + 1) })] })));
  it('รับ crop ขนาด 64 KB พอดี', () =>
    expect(() =>
      parseFacesBody(body({ faces: [face({ crop: jpegB64(64 * 1024) })] }), 'buffalo_l'),
    ).not.toThrow());
  it('ปฏิเสธ 51 หน้า', () => reject(body({ faces: Array.from({ length: 51 }, () => face()) })));
  it('รับ 50 หน้า', () =>
    expect(
      parseFacesBody(body({ faces: Array.from({ length: 50 }, () => face()) }), 'buffalo_l').faces,
    ).toHaveLength(50));
  it('ปฏิเสธ body ที่ไม่ใช่ object', () => reject(null));
});
