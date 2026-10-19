"""รูปสำหรับเทสต์ สร้างในหน่วยความจำ ไม่มีรูปหน้าคนจริงอยู่ใน repo"""

import cv2
import numpy as np


def noise_image(size: int = 480, seed: int = 0) -> np.ndarray:
    """ภาพมีรายละเอียดเยอะ ค่าความคมชัดสูง"""
    return np.random.default_rng(seed).integers(0, 256, (size, size, 3), dtype=np.uint8)


def flat_image(size: int = 480) -> np.ndarray:
    """ภาพสีเรียบ ค่าความคมชัดเกือบศูนย์ (ใช้แทนรูปเบลอ)"""
    return np.full((size, size, 3), 128, dtype=np.uint8)


def jpeg(image: np.ndarray) -> bytes:
    ok, buffer = cv2.imencode(".jpg", image)
    assert ok
    return buffer.tobytes()


def crop_with_margin(image, bbox, margin: float = 0.6, size: int = 320) -> np.ndarray:
    """ครอปหน้าจากรูปหมู่โดยเผื่อขอบ ได้รูปหน้าเดียวแบบที่มือถือจะส่งมา

    ขยายแค่ราว 1.3 เท่า ถ้าขยายมากกว่านี้ภาพจะเบลอจนเกณฑ์ความคมชัดปฏิเสธ (ซึ่งถูกต้อง)
    """
    x1, y1, x2, y2 = bbox
    w, h = x2 - x1, y2 - y1
    left = max(int(x1 - w * margin), 0)
    top = max(int(y1 - h * margin), 0)
    right = min(int(x2 + w * margin), image.shape[1])
    bottom = min(int(y2 + h * margin), image.shape[0])
    return cv2.resize(image[top:bottom, left:right], (size, size))
