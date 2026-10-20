import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export interface StudentAccount {
  studentCode: string;
  userId: string;
  fullName: string | null;
}

export interface RosterRepo {
  listCodes(courseId: string): Promise<string[]>;
  addCodes(courseId: string, codes: string[]): Promise<void>;
  removeCode(courseId: string, code: string): Promise<boolean>;
  accountsByCodes(codes: string[]): Promise<StudentAccount[]>;
  faceEnrolledUserIds(userIds: string[]): Promise<string[]>;
}

export const ROSTER_REPO = Symbol('ROSTER_REPO');

@Injectable()
export class SupabaseRosterRepo implements RosterRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async listCodes(courseId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('enrollments')
      .select('student_code')
      .eq('course_id', courseId)
      .order('student_code');
    if (error) throw dbError();
    return (data as { student_code: string }[]).map((r) => r.student_code);
  }

  async addCodes(courseId: string, codes: string[]): Promise<void> {
    if (!codes.length) return;
    const { error } = await this.db.from('enrollments').upsert(
      codes.map((code) => ({ course_id: courseId, student_code: code })),
      { onConflict: 'course_id,student_code', ignoreDuplicates: true },
    );
    if (error) throw dbError();
  }

  async removeCode(courseId: string, code: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('enrollments')
      .delete()
      .eq('course_id', courseId)
      .eq('student_code', code)
      .select('student_code');
    if (error) throw dbError();
    return data.length > 0;
  }

  async accountsByCodes(codes: string[]): Promise<StudentAccount[]> {
    if (!codes.length) return [];
    const { data, error } = await this.db
      .from('users')
      .select('id, full_name, student_id')
      .in('student_id', codes);
    if (error) throw dbError();
    return (data as { id: string; full_name: string | null; student_id: string }[]).map((r) => ({
      studentCode: r.student_id,
      userId: r.id,
      fullName: r.full_name,
    }));
  }

  async faceEnrolledUserIds(userIds: string[]): Promise<string[]> {
    if (!userIds.length) return [];
    const { data, error } = await this.db
      .from('face_profiles')
      .select('user_id')
      .in('user_id', userIds);
    if (error) throw dbError();
    return [...new Set((data as { user_id: string }[]).map((r) => r.user_id))];
  }
}
