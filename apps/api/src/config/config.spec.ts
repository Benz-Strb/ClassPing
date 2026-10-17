import { loadConfig } from './config.js';

const base = (extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'secret',
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
});
