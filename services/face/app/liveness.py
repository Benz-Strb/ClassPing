from pathlib import Path
from typing import Protocol

import cv2
import numpy as np

from app.config import Settings
from app.engine import PROVIDERS, DetectedFace


class LivenessModel(Protocol):
    """ให้คะแนนว่าเป็นคนจริงหรือไม่ (0-1 ยิ่งสูงยิ่งจริง) คืน None ถ้าให้คะแนนไม่ได้"""

    name: str

    def score(self, frame: np.ndarray, face: DetectedFace) -> float | None: ...


# ตำแหน่ง landmark 5 จุดในภาพ 80x80 ที่โมเดลคาดหวัง
TEMPLATE = np.array(
    [[32.03, 38.06], [47.89, 37.98], [40.01, 47.08], [33.50, 56.36], [46.63, 56.29]], np.float32
)
SIZE = 80
# ถ้าส่วนที่จัดหน้าหลุดขอบภาพเกินนี้ ถือว่าให้คะแนนไม่ได้
MAX_OUTSIDE = 0.3


def similarity(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """หา affine แบบ similarity (หมุน+ขยาย+เลื่อน) ด้วยกำลังสองน้อยสุด"""
    a = np.zeros((10, 4))
    a[0::2] = np.stack([src[:, 0], -src[:, 1], np.ones(5), np.zeros(5)], 1)
    a[1::2] = np.stack([src[:, 1], src[:, 0], np.zeros(5), np.ones(5)], 1)
    p = np.linalg.lstsq(a, dst.reshape(-1), rcond=None)[0]
    return np.array([[p[0], -p[1], p[2]], [p[1], p[0], p[3]]], np.float32)


class InsightFaceLiveness:
    """liveness.onnx ของ InsightFace: รับหน้า 80x80 จัดจาก landmark ออกเป็นความน่าจะเป็นเลย"""

    name = "insightface-liveness"

    def __init__(self, settings: Settings):
        # import ตรงนี้ เทสต์ที่ใช้ของปลอมจะได้ไม่ต้องโหลด onnxruntime
        import onnxruntime as ort

        self._session = ort.InferenceSession(
            str(Path(settings.liveness_model).expanduser()),
            providers=PROVIDERS.get(settings.provider, PROVIDERS["cpu"]),
        )
        self._input = self._session.get_inputs()[0].name

    def score(self, frame: np.ndarray, face: DetectedFace) -> float | None:
        if face.kps is None:
            return None
        m = similarity(face.kps.astype(np.float64), TEMPLATE)
        height, width = frame.shape[:2]
        inside = cv2.warpAffine(
            np.ones((height, width), np.uint8), m, (SIZE, SIZE), flags=cv2.INTER_NEAREST
        )
        if (inside == 0).mean() > MAX_OUTSIDE:
            return None
        crop = cv2.warpAffine(
            frame, m, (SIZE, SIZE), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE
        )
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        x = rgb.transpose(2, 0, 1)[None]
        return float(self._session.run(None, {self._input: x})[0][0])
