import base64
import logging
import os
from dataclasses import dataclass
from typing import Protocol

import cv2
import numpy as np

from camera.board.align import arcface_input, liveness_input
from camera.board.scrfd import Detection, decode

log = logging.getLogger("camera")

MIN_FACE_SCORE = 0.5
# เหมือน services/face/app/crops.py
CROP_SCALE = 1.6
CROP_MAX_SIDE = 320
CROP_QUALITY = 85
# ครอปของบอร์ดขยายจนด้านสั้นของหน้าได้เท่านี้ก่อน encode
CROP_MIN_FACE_PX = 112
# API ปฏิเสธทั้งเฟรมถ้าครอปเกินนี้ ครอปที่ใหญ่เกินจึงไม่ส่ง (ส่งหน้านั้นไปแบบไม่มีรูป)
MAX_CROP_BYTES = 64 * 1024
EMBEDDING_DECIMALS = 6


class NpuRunner(Protocol):
    has_liveness: bool
    det_size: tuple[int, int]  # (กว้าง, สูง)

    def detect(self, image_rgb: np.ndarray) -> list[np.ndarray]: ...

    def embed(self, faces_rgb: np.ndarray) -> np.ndarray: ...

    def liveness(self, faces_rgb: np.ndarray) -> np.ndarray: ...


@dataclass(frozen=True)
class AnalyzerSettings:
    min_face_px: int = 40
    liveness_min_face_px: int = 40
    max_faces: int = 50

    @classmethod
    def from_env(cls) -> "AnalyzerSettings":
        def read(name: str, default: int) -> int:
            return int(os.environ.get(name, "").strip() or default)

        return cls(
            min_face_px=read("DETECT_MIN_FACE_PX", cls.min_face_px),
            liveness_min_face_px=read("LIVENESS_MIN_FACE_PX", cls.liveness_min_face_px),
        )


def face_size(bbox: tuple[float, float, float, float]) -> float:
    """ด้านสั้นของกรอบหน้า (พิกเซลของเฟรมเดิม)"""
    x1, y1, x2, y2 = bbox
    return min(x2 - x1, y2 - y1)


def letterbox(frame_bgr: np.ndarray, width: int, height: int) -> tuple[np.ndarray, float]:
    """ย่อ/ขยายเฟรมให้พอดีกรอบ det_size เติมขอบดำด้านขวา/ล่าง คืนภาพ RGB กับอัตราส่วน"""
    scale = min(width / frame_bgr.shape[1], height / frame_bgr.shape[0])
    new_w = min(max(round(frame_bgr.shape[1] * scale), 1), width)
    new_h = min(max(round(frame_bgr.shape[0] * scale), 1), height)
    padded = np.zeros((height, width, 3), np.uint8)
    padded[:new_h, :new_w] = cv2.resize(frame_bgr, (new_w, new_h))
    return cv2.cvtColor(padded, cv2.COLOR_BGR2RGB), scale


def face_crop(frame: np.ndarray, bbox: tuple[float, float, float, float]) -> bytes | None:
    """ครอปหน้าเป็น JPEG แบบเดียวกับ face service แต่ขยายจนหน้าด้านสั้น >= 112 px

    ถ้าขยายแล้วเกิน CROP_MAX_SIDE ให้ยึดกฎ 112 px ก่อน (เจอเฉพาะกรอบที่สัดส่วนแปลก)
    """
    x1, y1, x2, y2 = bbox
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    half = max(x2 - x1, y2 - y1) * CROP_SCALE / 2
    height, width = frame.shape[:2]
    left, top = max(round(cx - half), 0), max(round(cy - half), 0)
    right, bottom = min(round(cx + half), width), min(round(cy + half), height)
    if right <= left or bottom <= top:
        return None
    crop = frame[top:bottom, left:right]

    size = face_size(bbox)
    if size < CROP_MIN_FACE_PX:
        ratio = CROP_MIN_FACE_PX / max(size, 1.0)
        interpolation = cv2.INTER_CUBIC
    else:
        ratio = min(CROP_MAX_SIDE / max(crop.shape[:2]), 1.0)
        interpolation = cv2.INTER_AREA
    if ratio != 1.0:
        new_size = (max(round(crop.shape[1] * ratio), 1), max(round(crop.shape[0] * ratio), 1))
        crop = cv2.resize(crop, new_size, interpolation=interpolation)

    ok, buffer = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, CROP_QUALITY])
    if not ok:
        raise ValueError("encode JPEG ไม่สำเร็จ")
    return buffer.tobytes()


class FaceAnalyzer:
    """ตรวจหน้า -> จัดหน้า -> embedding/liveness -> ครอป จากเฟรมเดียว"""

    def __init__(self, runner: NpuRunner, settings: AnalyzerSettings | None = None):
        self._runner = runner
        self._settings = settings or AnalyzerSettings()

    def analyze(self, frame_bgr: np.ndarray) -> dict:
        height, width = frame_bgr.shape[:2]
        det_w, det_h = self._runner.det_size
        image, scale = letterbox(frame_bgr, det_w, det_h)
        found = decode(self._runner.detect(image), det_h, det_w, MIN_FACE_SCORE)

        faces: list[Detection] = []
        skipped = 0
        for det in found:
            x1, y1, x2, y2 = (v / scale for v in det.bbox)
            bbox = (
                float(np.clip(x1, 0, width)),
                float(np.clip(y1, 0, height)),
                float(np.clip(x2, 0, width)),
                float(np.clip(y2, 0, height)),
            )
            if face_size(bbox) < self._settings.min_face_px:
                skipped += 1
                continue
            faces.append(Detection(bbox, det.score, det.kps / scale))
        faces.sort(key=lambda f: face_size(f.bbox), reverse=True)
        faces = faces[: self._settings.max_faces]

        result: dict = {"width": width, "height": height, "skippedSmall": skipped, "faces": []}
        if not faces:
            return result

        aligned = np.stack([arcface_input(frame_bgr, f.kps) for f in faces])
        embeddings = np.asarray(self._runner.embed(aligned), np.float32).reshape(len(faces), -1)
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        # embedding เป็น NaN/inf หรือเป็นศูนย์ API จะปฏิเสธทั้งเฟรม ข้ามหน้านั้นไปเลย
        good = np.isfinite(norms[:, 0]) & (norms[:, 0] > 1e-6)
        if not good.all():
            log.warning("ข้าม %d หน้าที่ embedding ใช้ไม่ได้", int((~good).sum()))
            faces = [f for f, ok in zip(faces, good, strict=True) if ok]
            embeddings, norms = embeddings[good], norms[good]
            if not faces:
                return result
        embeddings = embeddings / norms

        liveness: list[float | None] = [None] * len(faces)
        if self._runner.has_liveness:
            inputs: dict[int, np.ndarray] = {}
            for i, f in enumerate(faces):
                if face_size(f.bbox) >= self._settings.liveness_min_face_px:
                    crop = liveness_input(frame_bgr, f.kps)
                    if crop is not None:
                        inputs[i] = crop
            if inputs:
                scores = self._runner.liveness(np.stack(list(inputs.values())))
                for i, s in zip(inputs, scores, strict=True):
                    # NaN/inf ส่งไป API จะปฏิเสธทั้งเฟรม ให้เป็น "ไม่ได้ตรวจ" แทน
                    liveness[i] = float(s) if np.isfinite(s) else None

        for f, emb, live in zip(faces, embeddings, liveness, strict=True):
            crop = face_crop(frame_bgr, f.bbox)
            if crop is not None and len(crop) > MAX_CROP_BYTES:
                log.warning("ครอปหน้าใหญ่เกิน %d KB ส่งไปโดยไม่มีรูป", MAX_CROP_BYTES // 1024)
                crop = None
            result["faces"].append(
                {
                    "bbox": [round(v, 1) for v in f.bbox],
                    "detScore": float(f.score),
                    # 6 ตำแหน่งพอ (cosine คลาดไม่ถึง 1e-5) และทำให้ JSON เล็กลงราวครึ่ง
                    "embedding": [round(v, EMBEDDING_DECIMALS) for v in emb.tolist()],
                    "liveness": live,
                    "crop": base64.b64encode(crop).decode("ascii") if crop else None,
                }
            )
        return result
