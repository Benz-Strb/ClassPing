// ชนิดข้อมูลตามที่ API ส่งกลับมา

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: 'student' | 'teacher' | 'admin';
  studentId: string | null;
  pdpaConsentAt: string | null;
}

export type Pose = 'front' | 'left' | 'right' | 'up' | 'down';

export interface FaceStatus {
  done: Pose[];
  complete: boolean;
}
