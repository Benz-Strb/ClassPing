import { AppError } from './app-error.js';

export const dbError = () =>
  new AppError(503, 'DB_UNAVAILABLE', 'ฐานข้อมูลไม่พร้อมใช้งาน ลองใหม่อีกครั้ง');
