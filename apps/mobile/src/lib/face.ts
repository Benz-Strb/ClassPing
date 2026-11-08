import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { apiFetch } from './api';
import type { FaceStatus, Pose } from './types';

const MAX_SIDE = 1280;
// ภาพหน้าจอบัตรใหญ่กว่ารูปหน้า (iPhone 1290x2796) ย่อแค่พอไม่เกิน 5 MB ให้ตัวเลขยังคม
const CARD_MAX_SIDE = 1600;

export interface Photo {
  uri: string;
  width: number;
  height: number;
}

// ย่อรูปก่อนส่ง รูปเต็มจากกล้องหน้าใหญ่เกินลิมิต 5 MB ได้ ถ้าเล็กพออยู่แล้วส่งไปเลย
async function shrink(photo: Photo): Promise<string> {
  if (Math.max(photo.width, photo.height) <= MAX_SIDE) return photo.uri;
  const context = ImageManipulator.manipulate(photo.uri);
  context.resize(photo.width >= photo.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return result.uri;
}

export async function uploadPose(pose: Pose, photo: Photo): Promise<FaceStatus> {
  const uri = await shrink(photo);
  const form = new FormData();
  // fetch ของ Expo ไม่รับแบบ { uri, name, type } ต้องใช้ File ของ expo-file-system
  form.append('image', new File(uri));
  return apiFetch<FaceStatus>(`/me/face/${pose}`, { method: 'PUT', body: form });
}

// แปลงเป็น JPEG เสมอ (ภาพจากคลังอาจเป็น HEIC) และย่อถ้าใหญ่เกิน
async function toJpeg(image: Photo, maxSide: number, compress: number): Promise<string> {
  const context = ImageManipulator.manipulate(image.uri);
  if (Math.max(image.width, image.height) > maxSide) {
    context.resize(image.width >= image.height ? { width: maxSide } : { height: maxSide });
  }
  const rendered = await context.renderAsync();
  return (await rendered.saveAsync({ format: SaveFormat.JPEG, compress })).uri;
}

// ภาพบัตร: JPEG คุณภาพสูงพอให้อ่านตัวเลขได้ และไม่เกิน 5 MB แม้เป็นรูปถ่ายบัตร
export function prepareCard(image: Photo): Promise<string> {
  return toJpeg(image, CARD_MAX_SIDE, 0.92);
}

// ภาพหลักฐานลา: API รับแค่ JPG PNG PDF จึงแปลง HEIC เป็น JPEG ก่อนส่ง
export function prepareLeaveEvidence(image: Photo): Promise<string> {
  return toJpeg(image, 2400, 0.9);
}

// ลบสำเนาภาพบัตรในเครื่องหลังใช้เสร็จ ลบเฉพาะไฟล์ใน cache ของแอป ไม่แตะคลังรูป
export function discardCard(uri: string | null) {
  if (!uri || !uri.startsWith(Paths.cache.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // ลบไม่ได้ก็ไม่เป็นไร ระบบจะล้าง cache เอง
  }
}

// ส่งภาพบัตรคู่กับรูปหน้าตรง ผ่านแล้วรูปนี้เป็นท่าหน้าตรง
export async function verifyIdentity(cardUri: string, photo: Photo): Promise<FaceStatus> {
  const form = new FormData();
  form.append('card', new File(cardUri));
  form.append('face', new File(await shrink(photo)));
  // รอให้นานกว่าเวลาอ่านบัตรฝั่ง API (30 วิ) รวมเวลาตรวจหน้าและอัปโหลด
  return apiFetch<FaceStatus>('/me/identity', { method: 'POST', body: form }, 60_000);
}
