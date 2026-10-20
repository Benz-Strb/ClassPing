// เวลาปัจจุบันของเซิร์ฟเวอร์ ฉีดเข้ามาเพื่อให้เทสต์กำหนดเวลาเองได้
export const CLOCK = Symbol('CLOCK');
export type Clock = () => Date;
