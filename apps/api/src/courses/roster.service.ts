import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error.js';
import { parseBody } from '../common/validate.js';
import type { AppUser } from '../users/users.service.js';
import { CoursesService } from './courses.service.js';
import { parseStudentCodes } from './parse-student-codes.js';
import { ROSTER_REPO, type RosterRepo } from './roster.repo.js';

export interface RosterEntry {
  studentCode: string;
  fullName: string | null;
  hasLoggedIn: boolean;
  faceEnrolled: boolean;
}

export interface AddResult {
  added: string[];
  alreadyEnrolled: string[];
  invalid: string[];
}

const MAX_CODES_PER_ADD = 500;

const addSchema = z.object({
  codes: z.string({ error: 'กรุณาวางรหัสนักศึกษา' }).max(20_000, {
    error: `วางได้ครั้งละไม่เกิน ${MAX_CODES_PER_ADD} รหัส`,
  }),
});

@Injectable()
export class RosterService {
  constructor(
    private readonly courses: CoursesService,
    @Inject(ROSTER_REPO) private readonly repo: RosterRepo,
  ) {}

  async list(user: AppUser, courseId: string): Promise<RosterEntry[]> {
    await this.courses.getOwned(user, courseId);
    return (await this.entries(courseId)).map(({ userId: _userId, ...entry }) => entry);
  }

  // ใช้ภายใน ไม่ได้ตรวจสิทธิ์ userId = null คือยังไม่เคย login
  async entries(courseId: string): Promise<(RosterEntry & { userId: string | null })[]> {
    const codes = await this.repo.listCodes(courseId);
    const accounts = await this.repo.accountsByCodes(codes);
    const verified = accounts.filter((a) => a.identityVerified).map((a) => a.userId);
    const faces = new Set(await this.repo.faceEnrolledUserIds(verified));
    const byCode = new Map(accounts.map((a) => [a.studentCode, a]));

    return [...codes].sort().map((code) => {
      const account = byCode.get(code);
      return {
        studentCode: code,
        userId: account?.userId ?? null,
        fullName: account?.fullName ?? null,
        hasLoggedIn: Boolean(account),
        faceEnrolled: account ? faces.has(account.userId) : false,
      };
    });
  }

  async add(user: AppUser, courseId: string, body: unknown): Promise<AddResult> {
    await this.courses.getOwned(user, courseId);
    const { valid, invalid } = parseStudentCodes(parseBody(addSchema, body).codes);
    if (valid.length + invalid.length > MAX_CODES_PER_ADD) {
      throw new AppError(400, 'BAD_REQUEST', `วางได้ครั้งละไม่เกิน ${MAX_CODES_PER_ADD} รหัส`);
    }

    const existing = new Set(await this.repo.listCodes(courseId));
    const added = valid.filter((c) => !existing.has(c));
    await this.repo.addCodes(courseId, added);
    return { added, alreadyEnrolled: valid.filter((c) => existing.has(c)), invalid };
  }

  async remove(user: AppUser, courseId: string, code: string): Promise<void> {
    await this.courses.getOwned(user, courseId);
    if (!(await this.repo.removeCode(courseId, code))) {
      throw new AppError(404, 'STUDENT_NOT_IN_COURSE', 'ไม่มีรหัสนี้ในรายชื่อวิชา');
    }
  }

  // ใช้ภายใน ไม่ได้ตรวจสิทธิ์
  async enrolledUserIds(courseId: string): Promise<string[]> {
    const accounts = await this.repo.accountsByCodes(await this.repo.listCodes(courseId));
    return accounts.filter((a) => a.identityVerified).map((a) => a.userId);
  }
}
