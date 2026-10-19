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
