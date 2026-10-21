import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyEmail, Role } from '../auth/role-from-email.js';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export interface AppUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  studentId: string | null;
  pdpaConsentAt: string | null;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  student_id: string | null;
  pdpa_consent_at: string | null;
}

const toAppUser = (row: UserRow): AppUser => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  studentId: row.student_id,
  pdpaConsentAt: row.pdpa_consent_at,
});

const dbError = () =>
  new AppError(503, 'DB_UNAVAILABLE', 'เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง');

@Injectable()
export class UsersService {
  constructor(
    @Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // สร้างแถวผู้ใช้ตอน login ครั้งแรก ถ้ามีอยู่แล้วไม่แตะบทบาท (แอดมินอาจเปลี่ยนไว้)
  // ยกเว้นเมลที่อยู่ใน ADMIN_EMAILS จะถูกยกเป็นแอดมินเสมอ
  async ensureUser(authUser: {
    id: string;
    email: string;
    fullName: string | null;
  }): Promise<AppUser> {
    const classified = classifyEmail(authUser.email, this.config.adminEmails);
    if (!classified) {
      throw new AppError(403, 'DOMAIN_NOT_ALLOWED', 'ใช้ได้เฉพาะเมล @dpu.ac.th');
    }

    const users = this.db.from('users');
    const { error: upsertError } = await users.upsert(
      {
        id: authUser.id,
        email: classified.email,
        full_name: authUser.fullName,
        role: classified.role,
        student_id: classified.studentId,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (upsertError) throw dbError();

    const { data, error } = await users.select('*').eq('id', authUser.id).single();
    if (error || !data) throw dbError();
    const row = data as UserRow;

    // แถวที่สร้างไว้ก่อนแอดมินได้รหัสนักศึกษา ให้เติมรหัสตอน login ครั้งถัดไป
    const patch: Partial<UserRow> = {};
    if (classified.role === 'admin' && row.role !== 'admin') patch.role = 'admin';
    if (classified.studentId && !row.student_id) patch.student_id = classified.studentId;

    if (Object.keys(patch).length) {
      const updated = await users
        .update(patch)
        .eq('id', authUser.id)
        .select('*')
        .single();
      if (updated.error || !updated.data) throw dbError();
      return toAppUser(updated.data as UserRow);
    }

    return toAppUser(row);
  }

  // กดยินยอมซ้ำไม่ทับเวลาเดิม
  async setConsent(userId: string): Promise<AppUser> {
    const users = this.db.from('users');
    const { error } = await users
      .update({ pdpa_consent_at: new Date().toISOString() })
      .eq('id', userId)
      .is('pdpa_consent_at', null);
    if (error) throw dbError();

    const { data, error: selectError } = await users.select('*').eq('id', userId).single();
    if (selectError || !data) throw dbError();
    return toAppUser(data as UserRow);
  }

  // ถอนความยินยอม ครั้งหน้าเปิดแอปจะต้องกดยินยอมใหม่ก่อนถ่ายรูป
  async clearConsent(userId: string): Promise<void> {
    const { error } = await this.db
      .from('users')
      .update({ pdpa_consent_at: null })
      .eq('id', userId)
      .select('id')
      .single();
    if (error) throw dbError();
  }
}
