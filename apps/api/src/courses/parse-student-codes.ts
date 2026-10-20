const STUDENT_CODE = /^[0-9]{1,20}$/;

export function parseStudentCodes(text: string): { valid: string[]; invalid: string[] } {
  const tokens = [...new Set(text.split(/[\s,]+/).filter(Boolean))];
  return {
    valid: tokens.filter((t) => STUDENT_CODE.test(t)),
    invalid: tokens.filter((t) => !STUDENT_CODE.test(t)),
  };
}
