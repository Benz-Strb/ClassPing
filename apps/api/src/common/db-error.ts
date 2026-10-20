import { AppError } from './app-error.js';

export const dbError = () =>
  new AppError(503, 'DB_UNAVAILABLE', 'เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง');
