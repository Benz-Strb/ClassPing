import cv2
import numpy as np

# ตำแหน่ง landmark 5 จุดในภาพ 112x112 ของ ArcFace
ARCFACE_TEMPLATE = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    np.float32,
)
ARCFACE_SIZE = 112

# ตรงกับ services/face/app/liveness.py
LIVENESS_TEMPLATE = np.array(
    [[32.03, 38.06], [47.89, 37.98], [40.01, 47.08], [33.50, 56.36], [46.63, 56.29]], np.float32
)
LIVENESS_SIZE = 80
MAX_OUTSIDE = 0.3


def similarity(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """หา affine แบบ similarity (หมุน+ขยาย+เลื่อน) ด้วยกำลังสองน้อยสุด"""
    a = np.zeros((10, 4))
    a[0::2] = np.stack([src[:, 0], -src[:, 1], np.ones(5), np.zeros(5)], 1)
    a[1::2] = np.stack([src[:, 1], src[:, 0], np.zeros(5), np.ones(5)], 1)
    p = np.linalg.lstsq(a, dst.reshape(-1), rcond=None)[0]
    return np.array([[p[0], -p[1], p[2]], [p[1], p[0], p[3]]], np.float32)


def arcface_input(frame_bgr: np.ndarray, kps: np.ndarray) -> np.ndarray:
    """จัดหน้า 112x112 RGB สำหรับ ArcFace"""
    m = similarity(kps.astype(np.float64), ARCFACE_TEMPLATE)
    crop = cv2.warpAffine(frame_bgr, m, (ARCFACE_SIZE, ARCFACE_SIZE), borderValue=0)
    return cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)


def liveness_input(frame_bgr: np.ndarray, kps: np.ndarray) -> np.ndarray | None:
    """จัดหน้า 80x80 RGB สำหรับ liveness คืน None ถ้าส่วนที่จัดหลุดขอบภาพเกินกำหนด"""
    m = similarity(kps.astype(np.float64), LIVENESS_TEMPLATE)
    height, width = frame_bgr.shape[:2]
    size = (LIVENESS_SIZE, LIVENESS_SIZE)
    inside = cv2.warpAffine(np.ones((height, width), np.uint8), m, size, flags=cv2.INTER_NEAREST)
    if (inside == 0).mean() > MAX_OUTSIDE:
        return None
    crop = cv2.warpAffine(
        frame_bgr, m, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE
    )
    return cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
