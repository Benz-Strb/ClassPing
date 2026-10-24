import { loadConfig } from './config.js';

const base = (extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'secret',
  FACE_SERVICE_TOKEN: 'f'.repeat(32),
  ...extra,
});

describe('loadConfig', () => {
  it('ขาด SUPABASE_URL ต้อง throw และบอกชื่อตัวแปร', () => {
    expect(() => loadConfig({ SUPABASE_SERVICE_ROLE_KEY: 'k' })).toThrow(
      'SUPABASE_URL',
    );
  });

  it('ขาด SUPABASE_SERVICE_ROLE_KEY ต้อง throw และบอกชื่อตัวแปร', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'https://x.supabase.co' })).toThrow(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
  });

  it('แยก ADMIN_EMAILS ด้วยคอมมา ตัดช่องว่าง และแปลงเป็นตัวเล็ก', () => {
    expect(
      loadConfig(base({ ADMIN_EMAILS: 'A@dpu.ac.th, b@dpu.ac.th,' })).adminEmails,
    ).toEqual(['a@dpu.ac.th', 'b@dpu.ac.th']);
  });

  it('ค่าเริ่มต้น PORT 3001 และไม่มีแอดมิน', () => {
    const config = loadConfig(base({}));
    expect(config.port).toBe(3001);
    expect(config.adminEmails).toEqual([]);
  });

  it('อ่าน ALLOWED_ORIGINS เป็นรายการ', () => {
    expect(
      loadConfig(
        base({ ALLOWED_ORIGINS: 'http://localhost:3000, http://a.test' }),
      ).allowedOrigins,
    ).toEqual(['http://localhost:3000', 'http://a.test']);
  });

  it('ขาด FACE_SERVICE_TOKEN หรือสั้นกว่า 32 ตัวต้อง throw และบอกชื่อตัวแปร', () => {
    expect(() => loadConfig(base({ FACE_SERVICE_TOKEN: '' }))).toThrow(
      'FACE_SERVICE_TOKEN',
    );
    expect(() => loadConfig(base({ FACE_SERVICE_TOKEN: 'short' }))).toThrow(
      'FACE_SERVICE_TOKEN',
    );
  });

  it('FACE_SERVICE_URL ค่าเริ่มต้นเป็น face service ในเครื่อง', () => {
    const config = loadConfig(base({}));
    expect(config.faceServiceUrl).toBe('http://127.0.0.1:8001');
    expect(config.faceServiceToken).toBe('f'.repeat(32));
  });

  it('FACE_SERVICE_URL ตัด / ท้ายออก', () => {
    expect(
      loadConfig(base({ FACE_SERVICE_URL: 'http://face.test:8001/' })).faceServiceUrl,
    ).toBe('http://face.test:8001');
  });

  it('ค่าเริ่มต้นของ Redis เกณฑ์คะแนน และกล้อง', () => {
    const config = loadConfig(base({}));
    expect(config.redisHost).toBe('127.0.0.1');
    expect(config.redisPort).toBe(6379);
    expect(config.matchAcceptMin).toBe(0.5);
    expect(config.matchReviewMin).toBe(0.36);
    expect(config.cameraOpenBeforeMin).toBe(20);
    expect(config.matchLog).toBe(false);
  });

  it('อ่านเกณฑ์คะแนนและ MATCH_LOG จาก env', () => {
    const config = loadConfig(
      base({ MATCH_ACCEPT_MIN: '0.55', MATCH_REVIEW_MIN: '0.4', MATCH_LOG: '1' }),
    );
    expect(config.matchAcceptMin).toBe(0.55);
    expect(config.matchReviewMin).toBe(0.4);
    expect(config.matchLog).toBe(true);
  });

  it('เกณฑ์คะแนนไม่ใช่ตัวเลข นอกช่วง 0-1 หรือเกณฑ์รอตรวจไม่ต่ำกว่าเกณฑ์บันทึก ต้อง throw', () => {
    expect(() => loadConfig(base({ MATCH_ACCEPT_MIN: 'abc' }))).toThrow('MATCH_ACCEPT_MIN');
    expect(() => loadConfig(base({ MATCH_ACCEPT_MIN: '1.2' }))).toThrow('MATCH_ACCEPT_MIN');
    expect(() =>
      loadConfig(base({ MATCH_ACCEPT_MIN: '0.5', MATCH_REVIEW_MIN: '0.6' })),
    ).toThrow('MATCH_REVIEW_MIN');
  });

  it('CAMERA_OPEN_BEFORE_MIN และ REDIS_PORT ต้องเป็นจำนวนเต็มไม่ติดลบ', () => {
    expect(loadConfig(base({ CAMERA_OPEN_BEFORE_MIN: '10' })).cameraOpenBeforeMin).toBe(10);
    expect(() => loadConfig(base({ CAMERA_OPEN_BEFORE_MIN: '-1' }))).toThrow(
      'CAMERA_OPEN_BEFORE_MIN',
    );
    expect(() => loadConfig(base({ REDIS_PORT: 'x' }))).toThrow('REDIS_PORT');
  });

  it('media server: ไม่ตั้ง secret = ปิดกล้องสด ค่า URL เริ่มต้นเป็นเครื่องตัวเอง', () => {
    const config = loadConfig(base({}));
    expect(config.mediaTokenSecret).toBeNull();
    expect(config.mediaPlaybackSecret).toBeNull();
    expect(config.mediaRtspUrl).toBe('rtsp://127.0.0.1:8554');
    expect(config.mediaWebrtcUrl).toBe('http://localhost:8889');
    expect(config.mediaPlaybackUrl).toBe('http://127.0.0.1:9996');
  });

  it('media secret ที่ตั้งไว้ต้องยาวอย่างน้อย 32 ตัว และ URL ตัด / ท้าย', () => {
    const config = loadConfig(
      base({
        MEDIA_TOKEN_SECRET: 'm'.repeat(32),
        MEDIA_PLAYBACK_SECRET: 'p'.repeat(32),
        MEDIA_WEBRTC_URL: 'http://BMac.local:8889/',
      }),
    );
    expect(config.mediaTokenSecret).toBe('m'.repeat(32));
    expect(config.mediaPlaybackSecret).toBe('p'.repeat(32));
    expect(config.mediaWebrtcUrl).toBe('http://BMac.local:8889');
    expect(() => loadConfig(base({ MEDIA_TOKEN_SECRET: 'short' }))).toThrow('MEDIA_TOKEN_SECRET');
    expect(() => loadConfig(base({ MEDIA_PLAYBACK_SECRET: 'short' }))).toThrow(
      'MEDIA_PLAYBACK_SECRET',
    );
  });
});
