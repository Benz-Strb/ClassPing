import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppUser } from '../users/users.service.js';
import { ROLES_KEY } from '../auth/auth.decorators.js';
import { StudentStudiesController } from './student-studies.controller.js';
import { StudentStudiesService } from './student-studies.service.js';

const student = { id: 'user-a', studentId: 'student-a', role: 'student' } as AppUser;
const course = { id: 'course-a', code: 'CS101', name: 'Programming', section: '1' };
const session = { id: 'session-a', course_id: course.id, kind: 'exam', title: 'Final', on_date: '2026-11-04', starts_at: '2026-11-04T02:00:00Z', ends_at: '2026-11-04T04:00:00Z', rooms: { name: 'A101' } };
function setup(enrollments: unknown[] = [{ courses: course }], sessions: unknown[] = [session]) {
  const enrollmentQuery = query(enrollments);
  const sessionQuery = query(sessions);
  const db = { from: vi.fn((table: string) => table === 'enrollments' ? enrollmentQuery : sessionQuery) };
  const service = new StudentStudiesService(db as unknown as SupabaseClient, () => new Date('2026-11-03T18:00:00Z'));
  return { service, db, enrollmentQuery, sessionQuery };
}
function query(rows: unknown[]) {
  const result = { data: rows, error: null };
  const builder = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(result),
  };
  return builder;
}

describe('Student studies', () => {
  it('requires the student role', () => {
    expect(Reflect.getMetadata(ROLES_KEY, StudentStudiesController)).toEqual(['student']);
  });

  it('scopes enrollment to the authenticated student and sessions to enrolled courses', async () => {
    const { service, enrollmentQuery, sessionQuery } = setup();
    const result = await service.get(student);
    expect(enrollmentQuery.eq).toHaveBeenCalledWith('student_code', 'student-a');
    expect(sessionQuery.in).toHaveBeenCalledWith('course_id', ['course-a']);
    expect(sessionQuery.gte).toHaveBeenCalledWith('on_date', '2026-11-04');
    expect(sessionQuery.lte).toHaveBeenCalledWith('on_date', '2026-11-10');
    expect(result.from).toBe('2026-11-04');
    expect(result.courses).toEqual([course]);
    expect(result.sessions).toEqual([{ id: 'session-a', courseId: course.id, kind: 'exam', title: 'Final', onDate: '2026-11-04', startsAt: session.starts_at, endsAt: session.ends_at, roomName: 'A101' }]);
  });

  it('does not query any data for a missing student code', async () => {
    const { service, db } = setup();
    expect((await service.get({ ...student, studentId: null })).courses).toEqual([]);
    expect(db.from).not.toHaveBeenCalled();
  });

  it('does not read sessions when there are no enrollments', async () => {
    const { service, db } = setup([]);
    expect((await service.get(student)).sessions).toEqual([]);
    expect(db.from).not.toHaveBeenCalledWith('sessions');
  });

  it('fails instead of returning an empty schedule on a database error', async () => {
    const { service, sessionQuery } = setup();
    sessionQuery.range.mockResolvedValueOnce({ data: null, error: { message: 'failed' } } as never);
    await expect(service.get(student)).rejects.toMatchObject({ code: 'DB_UNAVAILABLE' });
  });

  it('loads all session pages instead of silently dropping large schedules', async () => {
    const { service, sessionQuery } = setup();
    sessionQuery.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, index) => ({ ...session, id: String(index) })), error: null });
    expect((await service.get(student)).sessions).toHaveLength(501);
    expect(sessionQuery.range).toHaveBeenNthCalledWith(2, 500, 999);
  });
});
