import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export interface LeaveRequestInput {
  studentId: string;
  sessionId: string;
  reason: string;
  ocrText: string;
  ocrStatus: 'completed' | 'failed';
}

export interface LeaveRequestRecord {
  id: string;
}

export interface LeaveSessionOption {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  section: string | null;
  kind: 'class' | 'exam';
  title: string | null;
  onDate: string;
  startsAt: string;
  endsAt: string;
  roomName: string;
}

export interface LeaveStudentView {
  id: string;
  studentId: string | null;
  fullName: string | null;
}

export interface LeaveRequestView {
  id: string;
  sessionId: string;
  session: LeaveSessionOption;
  student: LeaveStudentView;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  ocrText: string;
  ocrStatus: 'pending' | 'completed' | 'failed';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  attachments: { fileName: string; mime: string; size: number }[];
}

export interface LeaveRepo {
  listEligibleSessions(studentId: string): Promise<LeaveSessionOption[]>;
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
  signedEvidenceUrl(
    requestId: string,
    userId: string,
    role: 'student' | 'teacher',
  ): Promise<string>;
}

export const LEAVE_REPO = Symbol('LEAVE_REPO');
export const LEAVE_EVIDENCE_BUCKET = 'leave-evidence';

interface SessionRelationRow {
  id: string;
  course_id: string;
  kind: 'class' | 'exam';
  title: string | null;
  on_date: string;
  starts_at: string;
  ends_at: string;
  courses: {
    id: string;
    code: string;
    name: string;
    section: string | null;
  } | null;
  rooms: { name: string } | null;
}

interface LeaveRelationRow extends Record<string, unknown> {
  sessions: SessionRelationRow | null;
  users: {
    id: string;
    student_id: string | null;
    full_name: string | null;
  } | null;
}

const toSessionOption = (row: SessionRelationRow): LeaveSessionOption => ({
  id: row.id,
  courseId: row.course_id,
  courseCode: row.courses?.code ?? '',
  courseName: row.courses?.name ?? '',
  section: row.courses?.section ?? null,
  kind: row.kind,
  title: row.title,
  onDate: row.on_date,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  roomName: row.rooms?.name ?? '',
});

const toRequestView = (row: LeaveRelationRow): LeaveRequestView => ({
  id: row.id as string,
  sessionId: row.session_id as string,
  session: toSessionOption(row.sessions as SessionRelationRow),
  student: {
    id: row.users?.id ?? (row.student_id as string),
    studentId: row.users?.student_id ?? null,
    fullName: row.users?.full_name ?? null,
  },
  reason: row.reason as string,
  status: row.status as LeaveRequestView['status'],
  reviewedBy: (row.reviewed_by as string | null) ?? null,
  reviewedAt: (row.reviewed_at as string | null) ?? null,
  reviewNote: (row.review_note as string | null) ?? null,
  ocrText: (row.ocr_text as string | null) ?? '',
  ocrStatus: row.ocr_status as LeaveRequestView['ocrStatus'],
  createdAt: row.created_at as string,
  attachments: (
    (row.leave_attachments as Array<Record<string, unknown>> | null) ?? []
  ).map((file) => ({
    fileName: file.file_name as string,
    mime: file.mime_type as string,
    size: file.file_size as number,
  })),
});

@Injectable()
export class SupabaseLeaveRepo implements LeaveRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async listEligibleSessions(studentId: string): Promise<LeaveSessionOption[]> {
    const { data: student, error: studentError } = await this.db
      .from('users')
      .select('student_id')
      .eq('id', studentId)
      .maybeSingle();
    if (studentError) throw dbError();
    if (!student?.student_id) return [];

    const { data: enrollments, error: enrollmentError } = await this.db
      .from('enrollments')
      .select('course_id')
      .eq('student_code', student.student_id);
    if (enrollmentError) throw dbError();
    const courseIds = [
      ...new Set(
        (enrollments as { course_id: string }[]).map((row) => row.course_id),
      ),
    ];
    if (!courseIds.length) return [];

    const { data, error } = await this.db
      .from('sessions')
      .select(
        'id, course_id, kind, title, on_date, starts_at, ends_at, courses(id, code, name, section), rooms(name)',
      )
      .in('course_id', courseIds)
      .order('starts_at', { ascending: false })
      .limit(100);
    if (error) throw dbError();
    return (data as unknown as SessionRelationRow[]).map(toSessionOption);
  }

  async studentCanRequest(
    studentId: string,
    sessionId: string,
  ): Promise<boolean> {
    const { data: session, error: sessionError } = await this.db
      .from('sessions')
      .select('course_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) throw dbError();
    if (!session) return false;

    const { data: student, error: studentError } = await this.db
      .from('users')
      .select('student_id')
      .eq('id', studentId)
      .maybeSingle();
    if (studentError) throw dbError();
    if (!student?.student_id) return false;

    const { data: enrollment, error: enrollmentError } = await this.db
      .from('enrollments')
      .select('student_code')
      .eq('course_id', session.course_id)
      .eq('student_code', student.student_id)
      .maybeSingle();
    if (enrollmentError) throw dbError();
    return enrollment !== null;
  }

  async createRequest(input: LeaveRequestInput): Promise<LeaveRequestRecord> {
    const { data, error } = await this.db
      .from('leave_requests')
      .insert({
        student_id: input.studentId,
        session_id: input.sessionId,
        reason: input.reason,
        ocr_text: input.ocrText,
        ocr_status: input.ocrStatus,
      })
      .select('id')
      .single();
    if (error?.code === '23505') throw new Error('LEAVE_REQUEST_DUPLICATE');
    if (error) throw dbError();
    return data as LeaveRequestRecord;
  }

  async deleteRequest(id: string): Promise<void> {
    const { error } = await this.db
      .from('leave_requests')
      .delete()
      .eq('id', id);
    if (error) throw dbError();
  }

  async uploadEvidence(
    path: string,
    bytes: Buffer,
    mime: string,
  ): Promise<void> {
    const { error } = await this.db.storage
      .from(LEAVE_EVIDENCE_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw dbError();
  }

  async deleteEvidence(path: string): Promise<void> {
    const { error } = await this.db.storage
      .from(LEAVE_EVIDENCE_BUCKET)
      .remove([path]);
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
    const { error } = await this.db.rpc('review_leave_request', {
      p_request_id: requestId,
      p_teacher_id: teacherId,
      p_decision: decision,
      p_review_note: reviewNote,
    });
    if (!error) return;
    if (
      error.message === 'LEAVE_REQUEST_NOT_FOUND' ||
      error.message === 'LEAVE_REQUEST_FORBIDDEN' ||
      error.message === 'LEAVE_REQUEST_NOT_PENDING'
    ) {
      throw new Error(error.message);
    }
    throw dbError();
  }

  async listByStudent(studentId: string): Promise<LeaveRequestView[]> {
    const { data, error } = await this.db
      .from('leave_requests')
      .select(
        'id, student_id, session_id, reason, status, ocr_text, ocr_status, reviewed_by, reviewed_at, review_note, created_at, leave_attachments(file_name, mime_type, file_size), sessions!inner(id, course_id, kind, title, on_date, starts_at, ends_at, courses(id, code, name, section), rooms(name)), users!leave_requests_student_id_fkey(id, student_id, full_name)',
      )
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw dbError();

    return (data as unknown as LeaveRelationRow[]).map(toRequestView);
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
    const sessionIds = (sessions as { id: string }[]).map(
      (session) => session.id,
    );
    if (!sessionIds.length) return [];

    const { data, error } = await this.db
      .from('leave_requests')
      .select(
        'id, student_id, session_id, reason, status, ocr_text, ocr_status, reviewed_by, reviewed_at, review_note, created_at, leave_attachments(file_name, mime_type, file_size), sessions!inner(id, course_id, kind, title, on_date, starts_at, ends_at, courses(id, code, name, section), rooms(name)), users!leave_requests_student_id_fkey(id, student_id, full_name)',
      )
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false });
    if (error) throw dbError();

    return (data as unknown as LeaveRelationRow[]).map(toRequestView);
  }

  async signedEvidenceUrl(
    requestId: string,
    userId: string,
    role: 'student' | 'teacher',
  ): Promise<string> {
    const { data: request, error: requestError } = await this.db
      .from('leave_requests')
      .select('student_id, session_id')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError) throw dbError();
    if (!request) throw new Error('LEAVE_REQUEST_NOT_FOUND');

    if (role === 'student') {
      if (request.student_id !== userId)
        throw new Error('LEAVE_REQUEST_FORBIDDEN');
    } else {
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
      if (course.teacher_id !== userId)
        throw new Error('LEAVE_REQUEST_FORBIDDEN');
    }

    const { data: attachment, error: attachmentError } = await this.db
      .from('leave_attachments')
      .select('storage_path')
      .eq('leave_request_id', requestId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (attachmentError) throw dbError();
    if (!attachment) throw new Error('EVIDENCE_NOT_FOUND');

    const { data, error } = await this.db.storage
      .from(LEAVE_EVIDENCE_BUCKET)
      .createSignedUrl(attachment.storage_path, 600);
    if (error || !data?.signedUrl) throw dbError();
    return data.signedUrl;
  }
}
