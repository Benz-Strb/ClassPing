import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/config.js';
import { UsersService } from './users.service.js';

interface Row {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  student_id: string | null;
  pdpa_consent_at: string | null;
  identity_verified_at?: string | null;
  identity_score?: number | null;
}

// ตาราง users ปลอมในหน่วยความจำ รองรับเฉพาะคำสั่งที่ UsersService ใช้
function fakeDb(initial: Row[] = []) {
  const blank = { pdpa_consent_at: null, identity_verified_at: null, identity_score: null };
  const rows = new Map(initial.map((r) => [r.id, { ...blank, ...r }]));
  const upserts: { values: Partial<Row>; options: unknown }[] = [];

  const selectOne = (id: string) => ({
    single: async () => {
      const row = rows.get(id);
      return row ? { data: { ...row }, error: null } : { data: null, error: { message: 'not found' } };
    },
  });

  const table = {
    upsert: async (values: Partial<Row>, options: { ignoreDuplicates?: boolean }) => {
      upserts.push({ values, options });
      if (!rows.has(values.id!) || !options.ignoreDuplicates) {
        rows.set(values.id!, { ...blank, ...(values as Row) });
      }
      return { error: null };
    },
    select: () => ({ eq: (_col: string, id: string) => selectOne(id) }),
    update: (patch: Partial<Row>) => ({
      eq: (_col: string, id: string) => ({
        select: () => {
          rows.set(id, { ...rows.get(id)!, ...patch });
          return selectOne(id);
        },
        // update ... where id = ? and <col> is null
        is: async (col: keyof Row, value: null) => {
          const row = rows.get(id);
          if (row && row[col] === value) rows.set(id, { ...row, ...patch });
          return { error: null };
        },
      }),
    }),
  };

  const db = { from: () => table } as unknown as SupabaseClient;
  return { db, rows, upserts };
}

const config = (adminEmails: string[] = []) =>
  ({ adminEmails }) as unknown as AppConfig;

describe('UsersService.ensureUser', () => {
  it('login ครั้งแรกของ 66112106@dpu.ac.th สร้างแถวเป็นนักศึกษาพร้อมรหัส', async () => {
    const { db, rows } = fakeDb();
    const user = await new UsersService(db, config()).ensureUser({
      id: 'u1',
      email: '66112106@dpu.ac.th',
      fullName: 'ณัฐวุฒิ',
    });
    expect(user).toEqual({
      id: 'u1',
      email: '66112106@dpu.ac.th',
      fullName: 'ณัฐวุฒิ',
      role: 'student',
      studentId: '66112106',
      pdpaConsentAt: null,
      identityVerifiedAt: null,
    });
    expect(rows.get('u1')?.role).toBe('student');
  });

  it('แอดมินเคยเปลี่ยนบทบาทเป็น teacher แล้ว login ใหม่ต้องไม่ทับกลับเป็น student', async () => {
    const { db } = fakeDb([
      {
        id: 'u1',
        email: '66112106@dpu.ac.th',
        full_name: null,
        role: 'teacher',
        student_id: '66112106',
        pdpa_consent_at: null,
      },
    ]);
    const user = await new UsersService(db, config()).ensureUser({
      id: 'u1',
      email: '66112106@dpu.ac.th',
      fullName: null,
    });
    expect(user.role).toBe('teacher');
  });

  it('เมลอยู่ใน ADMIN_EMAILS ได้เป็นแอดมินแม้แถวเดิมเป็น teacher', async () => {
    const { db, rows } = fakeDb([
      {
        id: 'u2',
        email: 'somsak.kit@dpu.ac.th',
        full_name: null,
        role: 'teacher',
        student_id: null,
        pdpa_consent_at: null,
      },
    ]);
    const user = await new UsersService(db, config(['somsak.kit@dpu.ac.th'])).ensureUser({
      id: 'u2',
      email: 'somsak.kit@dpu.ac.th',
      fullName: null,
    });
    expect(user.role).toBe('admin');
    expect(rows.get('u2')?.role).toBe('admin');
  });

  it('ใช้ upsert onConflict id แบบ ignoreDuplicates กันสองแท็บสร้างแถวซ้ำ', async () => {
    const { db, upserts } = fakeDb();
    await new UsersService(db, config()).ensureUser({
      id: 'u3',
      email: 'somsak.kit@dpu.ac.th',
      fullName: null,
    });
    expect(upserts[0].options).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  });
});

describe('UsersService.ensureUser กับรหัสนักศึกษา', () => {
  it('แอดมินที่แถวเดิมยังไม่มีรหัสนักศึกษา login แล้วได้รหัสตามเมล', async () => {
    const { db, rows } = fakeDb([
      {
        id: 'u1',
        email: '66112106@dpu.ac.th',
        full_name: null,
        role: 'admin',
        student_id: null,
        pdpa_consent_at: null,
      },
    ]);
    const user = await new UsersService(db, config(['66112106@dpu.ac.th'])).ensureUser({
      id: 'u1',
      email: '66112106@dpu.ac.th',
      fullName: null,
    });
    expect(user.studentId).toBe('66112106');
    expect(user.role).toBe('admin');
    expect(rows.get('u1')?.student_id).toBe('66112106');
  });
});

describe('UsersService.setConsent', () => {
  const row: Row = {
    id: 'u1',
    email: '66112106@dpu.ac.th',
    full_name: null,
    role: 'student',
    student_id: '66112106',
    pdpa_consent_at: null,
  };

  it('ตั้งเวลายินยอมครั้งแรก', async () => {
    const { db } = fakeDb([row]);
    const user = await new UsersService(db, config()).setConsent('u1');
    expect(user.pdpaConsentAt).not.toBeNull();
  });

  it('กดยินยอมซ้ำ เวลาเดิมไม่เปลี่ยน', async () => {
    const { db } = fakeDb([{ ...row, pdpa_consent_at: '2026-10-01T00:00:00.000Z' }]);
    const user = await new UsersService(db, config()).setConsent('u1');
    expect(user.pdpaConsentAt).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('UsersService.clearConsent', () => {
  it('ล้างเวลายินยอม', async () => {
    const { db, rows } = fakeDb([
      {
        id: 'u1',
        email: '66112106@dpu.ac.th',
        full_name: null,
        role: 'student',
        student_id: '66112106',
        pdpa_consent_at: '2026-10-01T00:00:00.000Z',
      },
    ]);
    await new UsersService(db, config()).clearConsent('u1');
    expect(rows.get('u1')!.pdpa_consent_at).toBeNull();
  });
});

describe('UsersService.setIdentity', () => {
  const row: Row = {
    id: 'u1',
    email: '66112106@dpu.ac.th',
    full_name: null,
    role: 'student',
    student_id: '66112106',
    pdpa_consent_at: '2026-10-01T00:00:00.000Z',
  };

  it('ยืนยันแล้วเก็บเวลากับคะแนน', async () => {
    const { db, rows } = fakeDb([row]);
    await new UsersService(db, config()).setIdentity('u1', 0.52);
    expect(rows.get('u1')!.identity_verified_at).not.toBeNull();
    expect(rows.get('u1')!.identity_score).toBe(0.52);
  });

  it('ส่ง null ล้างการยืนยัน', async () => {
    const { db, rows } = fakeDb([
      { ...row, identity_verified_at: '2026-10-23T00:00:00.000Z', identity_score: 0.5 },
    ]);
    await new UsersService(db, config()).setIdentity('u1', null);
    expect(rows.get('u1')!.identity_verified_at).toBeNull();
    expect(rows.get('u1')!.identity_score).toBeNull();
  });
});
