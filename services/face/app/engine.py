from dataclasses import dataclass
from typing import Protocol

import numpy as np


@dataclass(frozen=True)
class DetectedFace:
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2
    det_score: float
    embedding: np.ndarray  # float32 ขนาด embedding_size ผ่าน L2-normalize แล้ว
    pose: tuple[float, float, float] | None  # pitch, yaw, roll (องศา)


class FaceEngine(Protocol):
    """ชั้นเดียวที่รู้จักโมเดล ถ้าจะเปลี่ยนไลบรารีใบหน้า แก้แค่ตัวที่ implement นี้"""

    model_name: str
    embedding_size: int

    def analyze(self, image: np.ndarray) -> list[DetectedFace]: ...


PROVIDERS = {
    "cpu": ["CPUExecutionProvider"],
    "coreml": ["CoreMLExecutionProvider", "CPUExecutionProvider"],
}


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
        self._app.prepare(ctx_id=-1, det_size=(settings.det_size, settings.det_size))

    def analyze(self, image: np.ndarray) -> list[DetectedFace]:
        faces = []
        for face in self._app.get(image):
            pose = face.get("pose")
            faces.append(
                DetectedFace(
                    bbox=tuple(float(v) for v in face.bbox),
                    det_score=float(face.det_score),
                    embedding=face.normed_embedding.astype(np.float32),
                    pose=None if pose is None else tuple(float(v) for v in pose),
                )
            )
        return faces
