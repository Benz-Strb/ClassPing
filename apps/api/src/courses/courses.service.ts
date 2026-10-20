import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error.js';
import { parseBody } from '../common/validate.js';
import type { AppUser } from '../users/users.service.js';
import { COURSES_REPO, type Course, type CoursesRepo, type Rules } from './courses.repo.js';

// ค่าตาม spec: ตัดสาย 15 นาที ยังไม่ตั้งเวลาตัดขาด นอกห้องเกิน 15 นาทีถือว่าโดด
export const DEFAULT_RULES: Rules = {
  lateAfterMin: 15,
  absentAfterMin: null,
  outOfRoomLimitMin: 15,
};

const code = z
  .string({ error: 'กรุณาใส่รหัสวิชา' })
  .trim()
  .min(1, { error: 'กรุณาใส่รหัสวิชา' })
  .max(30, { error: 'รหัสวิชายาวเกิน 30 ตัว' })
  .transform((v) => v.toUpperCase());
const name = z
  .string({ error: 'กรุณาใส่ชื่อวิชา' })
  .trim()
  .min(1, { error: 'กรุณาใส่ชื่อวิชา' })
  .max(200, { error: 'ชื่อวิชายาวเกิน 200 ตัว' });
// กลุ่มเรียนว่างเก็บเป็น null
const section = z
  .string()
  .trim()
  .max(30, { error: 'กลุ่มเรียนยาวเกิน 30 ตัว' })
  .nullish()
  .transform((v) => v || null);

const createSchema = z.object({ code, name, section });
// แก้ได้เฉพาะรหัส ชื่อ กลุ่ม (ช่องอื่นเช่น teacherId ถูกตัดทิ้ง)
const updateSchema = z.object({
  code: code.optional(),
  name: name.optional(),
  section: section.optional(),
});

const minutes = (label: string, min: number) =>
  z
    .number({ error: `${label}ต้องเป็นตัวเลข` })
    .int({ error: `${label}ต้องเป็นจำนวนเต็มนาที` })
    .min(min, { error: `${label}ต้องอยู่ระหว่าง ${min}–240 นาที` })
    .max(240, { error: `${label}ต้องอยู่ระหว่าง ${min}–240 นาที` });

const rulesSchema = z
  .object({
    lateAfterMin: minutes('เวลาตัดสาย', 0),
    absentAfterMin: minutes('เวลาตัดขาด', 1).nullable(),
    outOfRoomLimitMin: minutes('เวลานอกห้อง', 1),
  })
  .refine((r) => r.absentAfterMin === null || r.absentAfterMin > r.lateAfterMin, {
    error: 'เวลาตัดขาดต้องมากกว่าเวลาตัดสาย',
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new AppError(404, 'COURSE_NOT_FOUND', 'ไม่พบวิชานี้');

@Injectable()
export class CoursesService {
  constructor(@Inject(COURSES_REPO) private readonly repo: CoursesRepo) {}

  listFor(user: AppUser): Promise<Course[]> {
    return user.role === 'admin' ? this.repo.listAll() : this.repo.listByTeacher(user.id);
  }

  async create(user: AppUser, body: unknown): Promise<Course> {
    const input = parseBody(createSchema, body);
    const course = await this.repo.insert({ ...input, teacherId: user.id });
    await this.repo.saveRules(course.id, DEFAULT_RULES);
    return course;
  }

  // ทุก route ที่รับ courseId ต้องผ่านตัวนี้ก่อน
  // วิชาของคนอื่นตอบเหมือนไม่มีวิชานี้ ไม่บอกว่ามีอยู่
  async getOwned(user: AppUser, courseId: string): Promise<Course> {
    if (!UUID.test(courseId)) throw notFound();
    const course = await this.repo.findById(courseId);
    if (!course || (user.role !== 'admin' && course.teacherId !== user.id)) throw notFound();
    return course;
  }

  async update(user: AppUser, courseId: string, body: unknown): Promise<Course> {
    await this.getOwned(user, courseId);
    return this.repo.update(courseId, parseBody(updateSchema, body));
  }

  async getRules(user: AppUser, courseId: string): Promise<Rules> {
    await this.getOwned(user, courseId);
    return (await this.repo.getRules(courseId)) ?? DEFAULT_RULES;
  }

  async setRules(user: AppUser, courseId: string, body: unknown): Promise<Rules> {
    await this.getOwned(user, courseId);
    return this.repo.saveRules(courseId, parseBody(rulesSchema, body));
  }
}
