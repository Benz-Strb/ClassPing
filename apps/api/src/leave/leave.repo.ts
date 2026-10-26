import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export interface LeaveRequestInput {
  studentId: string;
  sessionId: string;
  reason: string;
}

export interface LeaveRequestRecord {
  id: string;
}

export interface LeaveRepo {
  studentCanRequest(studentId: string, sessionId: string): Promise<boolean>;
  createRequest(input: LeaveRequestInput): Promise<LeaveRequestRecord>;
  deleteRequest(id: string): Promise<void>;
  uploadEvidence(path: string, bytes: Buffer, mime: string): Promise<void>;
  deleteEvidence(path: string): Promise<void>;
  createAttachment(input: {
    requestId: string;
    path: string;
    fileName: string;
    mime: string;
    size: number;
  }): Promise<void>;
}

export const LEAVE_REPO = Symbol('LEAVE_REPO');
export const LEAVE_EVIDENCE_BUCKET = 'leave-evidence';

@Injectable()
export class SupabaseLeaveRepo implements LeaveRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async studentCanRequest(studentId: string, sessionId: string): Promise<boolean> {
    const { data: session, error: sessionError } = await this.db
      .from('sessions')
      .select('course_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) throw dbError();
    if (!session) return false;

    const { data: enrollment, error: enrollmentError } = await this.db
      .from('enrollments')
      .select('student_id')
      .eq('course_id', session.course_id)
      .eq('student_id', studentId)
      .maybeSingle();
    if (enrollmentError) throw dbError();
    return enrollment !== null;
  }

  async createRequest(input: LeaveRequestInput): Promise<LeaveRequestRecord> {
    const { data, error } = await this.db
      .from('leave_requests')
      .insert({ student_id: input.studentId, session_id: input.sessionId, reason: input.reason })
      .select('id')
      .single();
    if (error) throw dbError();
    return data as LeaveRequestRecord;
  }

  async deleteRequest(id: string): Promise<void> {
    const { error } = await this.db.from('leave_requests').delete().eq('id', id);
    if (error) throw dbError();
  }

  async uploadEvidence(path: string, bytes: Buffer, mime: string): Promise<void> {
    const { error } = await this.db.storage
      .from(LEAVE_EVIDENCE_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw dbError();
  }

  async deleteEvidence(path: string): Promise<void> {
    const { error } = await this.db.storage.from(LEAVE_EVIDENCE_BUCKET).remove([path]);
    if (error) throw dbError();
  }

  async createAttachment(input: {
    requestId: string;
    path: string;
    fileName: string;
    mime: string;
    size: number;
  }): Promise<void> {
    const { error } = await this.db.from('leave_attachments').insert({
      leave_request_id: input.requestId,
      storage_path: input.path,
      file_name: input.fileName,
      mime_type: input.mime,
      file_size: input.size,
    });
    if (error) throw dbError();
  }
}
