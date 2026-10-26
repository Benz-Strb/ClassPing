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

export interface LeaveRequestView {
  id: string;
  sessionId: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  attachments: { fileName: string; mime: string; size: number }[];
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
  reviewRequest(
    requestId: string,
    teacherId: string,
    decision: 'approved' | 'rejected',
    reviewNote: string | null,
  ): Promise<void>;
  listByStudent(studentId: string): Promise<LeaveRequestView[]>;
  listForTeacher(teacherId: string): Promise<LeaveRequestView[]>;
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

  async reviewRequest(
    requestId: string,
    teacherId: string,
    decision: 'approved' | 'rejected',
    reviewNote: string | null,
  ): Promise<void> {
    const { data: request, error: requestError } = await this.db
      .from('leave_requests')
      .select('student_id, session_id, status')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError) throw dbError();
    if (!request) throw new Error('LEAVE_REQUEST_NOT_FOUND');
    if (request.status !== 'pending') throw new Error('LEAVE_REQUEST_NOT_PENDING');

    const { data: session, error: sessionError } = await this.db
      .from('sessions')
      .select('course_id')
      .eq('id', request.session_id)
      .single();
    if (sessionError) throw dbError();

    const { data: course, error: courseError } = await this.db
      .from('courses')
      .select('teacher_id')
      .eq('id', session.course_id)
      .single();
    if (courseError) throw dbError();
    if (course.teacher_id !== teacherId) throw new Error('LEAVE_REQUEST_FORBIDDEN');

    const { error: updateError } = await this.db
      .from('leave_requests')
      .update({
        status: decision,
        reviewed_by: teacherId,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending');
    if (updateError) throw dbError();

    if (decision === 'approved') {
      const { error: attendanceError } = await this.db.from('attendance').upsert(
        {
          session_id: request.session_id,
          student_id: request.student_id,
          status: 'leave',
          updated_by: teacherId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,student_id' },
      );
      if (attendanceError) throw dbError();
    }
  }

  async listByStudent(studentId: string): Promise<LeaveRequestView[]> {
    const { data, error } = await this.db
      .from('leave_requests')
      .select(
        'id, session_id, reason, status, reviewed_by, reviewed_at, review_note, created_at, leave_attachments(file_name, mime_type, file_size)',
      )
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw dbError();

    return (data as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      reason: row.reason as string,
      status: row.status as LeaveRequestView['status'],
      reviewedBy: (row.reviewed_by as string | null) ?? null,
      reviewedAt: (row.reviewed_at as string | null) ?? null,
      reviewNote: (row.review_note as string | null) ?? null,
      createdAt: row.created_at as string,
      attachments: ((row.leave_attachments as Array<Record<string, unknown>> | null) ?? []).map(
        (file) => ({
          fileName: file.file_name as string,
          mime: file.mime_type as string,
          size: file.file_size as number,
        }),
      ),
    }));
  }

  async listForTeacher(teacherId: string): Promise<LeaveRequestView[]> {
    const { data: courses, error: coursesError } = await this.db
      .from('courses')
      .select('id')
      .eq('teacher_id', teacherId);
    if (coursesError) throw dbError();
    const courseIds = (courses as { id: string }[]).map((course) => course.id);
    if (!courseIds.length) return [];

    const { data: sessions, error: sessionsError } = await this.db
      .from('sessions')
      .select('id')
      .in('course_id', courseIds);
    if (sessionsError) throw dbError();
    const sessionIds = (sessions as { id: string }[]).map((session) => session.id);
    if (!sessionIds.length) return [];

    const { data, error } = await this.db
      .from('leave_requests')
      .select(
        'id, session_id, reason, status, reviewed_by, reviewed_at, review_note, created_at, leave_attachments(file_name, mime_type, file_size)',
      )
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false });
    if (error) throw dbError();

    return (data as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      reason: row.reason as string,
      status: row.status as LeaveRequestView['status'],
      reviewedBy: (row.reviewed_by as string | null) ?? null,
      reviewedAt: (row.reviewed_at as string | null) ?? null,
      reviewNote: (row.review_note as string | null) ?? null,
      createdAt: row.created_at as string,
      attachments: ((row.leave_attachments as Array<Record<string, unknown>> | null) ?? []).map(
        (file) => ({
          fileName: file.file_name as string,
          mime: file.mime_type as string,
          size: file.file_size as number,
        }),
      ),
    }));
  }
}
