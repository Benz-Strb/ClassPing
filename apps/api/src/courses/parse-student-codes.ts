// รหัสนักศึกษาเป็นตัวเลขล้วน (กฎเดียวกับ login ที่ดูว่าเมลเป็นตัวเลขไหม)
const STUDENT_CODE = /^[0-9]{1,20}$/;

// แยกรหัสที่อาจารย์วางมา คั่นด้วยขึ้นบรรทัด ช่องว่าง tab หรือจุลภาค ตัดซ้ำและคงลำดับ
export function parseStudentCodes(text: string): { valid: string[]; invalid: string[] } {
  const tokens = [...new Set(text.split(/[\s,]+/).filter(Boolean))];
  return {
    valid: tokens.filter((t) => STUDENT_CODE.test(t)),
    invalid: tokens.filter((t) => !STUDENT_CODE.test(t)),
  };
}
