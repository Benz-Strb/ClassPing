from dataclasses import dataclass
from typing import Protocol

import numpy as np


@dataclass(frozen=True)
class DetectedFace:
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2
    det_score: float
    embedding: np.ndarray  # float32 ขนาด embedding_size ผ่าน L2-normalize แล้ว
    pose: tuple[float, float, float] | None  # pitch, yaw, roll (องศา)
    kps: np.ndarray | None = None  # landmark 5 จุด (5x2) ไว้จัดหน้าให้โมเดล liveness


class FaceEngine(Protocol):
    """ชั้นเดียวที่รู้จักโมเดล ถ้าจะเปลี่ยนไลบรารีใบหน้า แก้แค่ตัวที่ implement นี้"""

    model_name: str
    embedding_size: int

    def analyze(self, image: np.ndarray) -> list[DetectedFace]: ...


PROVIDERS = {
    "cpu": ["CPUExecutionProvider"],
    "coreml": ["CoreMLExecutionProvider", "CPUExecutionProvider"],
}


def pad_small(image: np.ndarray, size: int) -> np.ndarray:
    """รูปที่เล็กกว่า det_size ทั้งสองด้าน วางมุมซ้ายบนของผืนดำ size x size

    InsightFace ย่อ/ขยายรูปให้พอดี det_size ภาพหน้าที่ตัดมาเล็ก ๆ จะถูกขยายจนหน้าใหญ่เกิน
    ที่ตัวตรวจจับหาเจอ วางบนผืนดำแทน พิกัดกรอบหน้าและ landmark จึงเท่ากับรูปเดิม
    รูปที่ด้านใดด้านหนึ่งถึง det_size แล้วคืนตัวเดิม
    """
    height, width = image.shape[:2]
    if height >= size or width >= size:
        return image
    canvas = np.zeros((size, size, *image.shape[2:]), dtype=image.dtype)
    canvas[:height, :width] = image
    return canvas


class InsightFaceEngine:
    """ใช้ชุดโมเดล InsightFace (ค่าเริ่มต้น buffalo_l: SCRFD + ArcFace 512 + landmark 3D)

    โมเดลใช้ได้เพื่อการศึกษา/วิจัยเท่านั้น เก็บที่ ~/.insightface ไม่อยู่ใน repo
    """

    embedding_size = 512

    def __init__(self, settings):
        # import ตรงนี้ เทสต์ที่ใช้ FakeEngine จะได้ไม่ต้องโหลดไลบรารีหนัก
        from insightface.app import FaceAnalysis

        self.model_name = settings.model
        self._app = FaceAnalysis(
            name=settings.model,
            allowed_modules=["detection", "recognition", "landmark_3d_68"],
            providers=PROVIDERS.get(settings.provider, PROVIDERS["cpu"]),
        )
        # ctx_id ติดลบ InsightFace จะบังคับทุกโมเดลกลับไปใช้ CPU แม้ตั้ง CoreML ไว้
        # วัดแล้ว CoreML ใช้ CPU 36 ms/ภาพ จาก 2,600 ms ค่าใบหน้า cosine >= 0.9998 กรอบหน้าเท่าเดิม
        ctx_id = -1 if settings.provider == "cpu" else 0
        self._app.prepare(ctx_id=ctx_id, det_size=(settings.det_size, settings.det_size))
        self._det_size = settings.det_size

    def analyze(self, image: np.ndarray) -> list[DetectedFace]:
        faces = []
        for face in self._app.get(pad_small(image, self._det_size)):
            pose = face.get("pose")
            faces.append(
                DetectedFace(
                    bbox=tuple(float(v) for v in face.bbox),
                    det_score=float(face.det_score),
                    embedding=face.normed_embedding.astype(np.float32),
                    pose=None if pose is None else tuple(float(v) for v in pose),
                    kps=None if face.kps is None else np.asarray(face.kps, dtype=np.float32),
                )
            )
        return faces
