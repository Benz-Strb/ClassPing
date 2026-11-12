import { describe, expect, it } from 'vitest';
import { checkTimetableIdentity, documentCourses, inDocument, readTimetableIdentity, readTimetableProof, signTimetableIdentity, verifyTimetableIdentity } from './timetable-identity.js';
import type { AppUser } from '../users/users.service.js';

const user = { id: 'user-1', studentId: '66112126', fullName: 'กิตตินันท์ บุญคุ้ม' } as AppUser;
const identity = { studentId: '66112126', fullName: 'นายกิตตินันท์ บุญคุ้ม' };
describe('timetable owner verification', () => {
  it('separates registration number and name in both inline and detached PDF text', () => {
    expect(readTimetableIdentity('เลขทะเบียน : 66112126 นายกิตตินันท์ บุญคุ้ม')).toEqual(identity);
    expect(readTimetableIdentity('เลขทะเบียน :\nประเภทแผนการศึกษา :\n66112126 นายกิตตินันท์ บุญคุ้ม\nหลักสูตร :')).toEqual(identity);
  });
  it('accepts harmless titles and whitespace differences', () => {
    expect(() => checkTimetableIdentity(user, identity)).not.toThrow();
  });
  it('explains cross-language names without treating matching student numbers as matching names', () => {
    const account = { ...user, fullName: 'Kittinan Boomkoom' };
    const proof = signTimetableIdentity(user.id, identity, '2099-01-01T00:00:00Z', 'secret');
    expect(() => verifyTimetableIdentity(account, proof, 'secret')).toThrow('Kittinan Boomkoom');
    try { verifyTimetableIdentity(account, proof, 'secret'); }
    catch (error) { expect(error).toMatchObject({ code: 'TIMETABLE_NAME_MISMATCH' }); }
  });
  it('rejects documents combining multiple student identities', () => {
    expect(readTimetableIdentity('เลขทะเบียน : 66112126 นายกิตตินันท์ บุญคุ้ม\nเลขทะเบียน : 66112127 นายคนอื่น ใจดี')).toBeNull();
  });
  it.each([null, { ...identity, studentId: '66112127' }, { ...identity, fullName: 'นายคนอื่น นามสกุล' }])('rejects missing or mismatching identity: %j', value => {
    expect(() => checkTimetableIdentity(user, value)).toThrow();
  });
  it('rejects altered proofs, another user and expired proofs', () => {
    const proof = signTimetableIdentity(user.id, identity, '2099-01-01T00:00:00Z', 'secret');
    expect(verifyTimetableIdentity(user, proof, 'secret')).toEqual(identity);
    expect(() => verifyTimetableIdentity(user, proof + 'x', 'secret')).toThrow();
    expect(() => verifyTimetableIdentity({ ...user, id: 'other' }, proof, 'secret')).toThrow();
    expect(() => verifyTimetableIdentity(user, signTimetableIdentity(user.id, identity, '2020-01-01', 'secret'), 'secret')).toThrow();
  });
  it('accepts permanent server proofs while still rejecting forged permanent proofs', () => {
    const proof = signTimetableIdentity(user.id, identity, null, 'secret');
    expect(verifyTimetableIdentity(user, proof, 'secret')).toEqual(identity);
    expect(() => verifyTimetableIdentity({ ...user, id: 'other' }, proof, 'secret')).toThrow();
    expect(() => verifyTimetableIdentity(user, proof + 'x', 'secret')).toThrow();
  });
  it('signs the courses read from the document and accepts only those courses', () => {
    const courses = documentCourses([
      { courseCode: 'ce 360', section: '001' },
      { courseCode: 'CE360', section: '001' },
      { courseCode: 'CE498', section: '' },
    ]);
    expect(courses).toHaveLength(2);
    const proof = signTimetableIdentity(user.id, identity, '2099-01-01T00:00:00Z', 'secret', courses);
    const read = readTimetableProof(user, proof, 'secret').courses;
    expect(inDocument(read, 'CE360', '001')).toBe(true);
    expect(inDocument(read, 'CE360', '002')).toBe(false);
    expect(inDocument(read, 'CE452', '001')).toBe(false);
    // เอกสารไม่ระบุกลุ่ม รับทุกกลุ่มของรหัสนั้น
    expect(inDocument(read, 'CE498', '315')).toBe(true);
  });
});
