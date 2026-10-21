import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { apiFetch } from './api';
import type { FaceStatus, Pose } from './types';

const MAX_SIDE = 1280;

interface Photo {
  uri: string;
  width: number;
  height: number;
}

// ย่อรูปก่อนส่ง รูปเต็มจากกล้องหน้าใหญ่เกินลิมิต 5 MB ได้
async function shrink(photo: Photo): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > MAX_SIDE) {
    context.resize(photo.width >= photo.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
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
