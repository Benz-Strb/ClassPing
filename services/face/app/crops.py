import cv2
import numpy as np

# เผื่อขอบรอบหน้าให้อาจารย์ดูออกว่าเป็นใคร แต่ไม่ติดคนข้าง ๆ มาด้วย
CROP_SCALE = 1.6
CROP_MAX_SIDE = 320
CROP_QUALITY = 85


def face_crop(frame: np.ndarray, bbox: tuple[float, float, float, float]) -> bytes | None:
    """ครอปหน้าจากเฟรมเป็น JPEG ด้านยาวไม่เกิน CROP_MAX_SIDE กรอบอยู่นอกภาพคืน None"""
    x1, y1, x2, y2 = bbox
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    half = max(x2 - x1, y2 - y1) * CROP_SCALE / 2
    height, width = frame.shape[:2]
    left, top = max(round(cx - half), 0), max(round(cy - half), 0)
    right, bottom = min(round(cx + half), width), min(round(cy + half), height)
    if right <= left or bottom <= top:
        return None
    crop = frame[top:bottom, left:right]

    longest = max(crop.shape[:2])
    if longest > CROP_MAX_SIDE:
        ratio = CROP_MAX_SIDE / longest
        size = (max(round(crop.shape[1] * ratio), 1), max(round(crop.shape[0] * ratio), 1))
        crop = cv2.resize(crop, size, interpolation=cv2.INTER_AREA)

    ok, buffer = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, CROP_QUALITY])
    if not ok:
        raise ValueError("encode JPEG ไม่สำเร็จ")
    return buffer.tobytes()
