import json
import logging
import math
import os

from camera.api import CameraApi
from camera.board.analyze import face_size

log = logging.getLogger("camera")

DEFAULT_MODEL = "buffalo_l"
# API รับ JSON ไม่เกิน 2 MB (app.setup.ts) เผื่อไว้ให้ต่ำกว่านั้น
MAX_BODY_BYTES = 1_800_000


def _encode(value) -> bytes:
    return json.dumps(value, separators=(",", ":"), allow_nan=False).encode()


def _finite(value) -> bool:
    try:
        return all(math.isfinite(v) for v in value)
    except TypeError:
        return False


def finite_faces(faces: list[dict]) -> tuple[list[dict], int]:
    """ตัดหน้าที่ embedding / detScore / bbox เป็น NaN หรือ inf ทิ้ง (JSON ส่งค่าพวกนี้ไม่ได้)

    liveness ที่ไม่ใช่ตัวเลขปกติส่งเป็น None แทน คืน (หน้าที่เหลือ, จำนวนหน้าที่ตัด)
    """
    kept = []
    for face in faces:
        if not (
            _finite(face.get("embedding") or [math.nan])
            and _finite([face.get("detScore", math.nan)])
            and _finite(face.get("bbox") or [math.nan])
        ):
            continue
        liveness = face.get("liveness")
        if liveness is not None and not _finite([liveness]):
            face = {**face, "liveness": None}
        kept.append(face)
    return kept, len(faces) - len(kept)


def fit_faces(body: dict, budget: int = MAX_BODY_BYTES) -> tuple[dict, int, int]:
    """ตัดข้อมูลให้ JSON ไม่เกิน budget: เอาครอปของหน้าเล็กสุดออกก่อน แล้วค่อยตัดหน้าเล็กสุดทิ้ง

    คืน (body ใหม่, จำนวนครอปที่ตัด, จำนวนหน้าที่ตัด) หน้าใหญ่ได้เก็บครอปไว้ตรวจซ้ำก่อน
    """
    faces = list(body["faces"])
    sizes = [len(_encode(f)) for f in faces]
    base = len(_encode({**body, "faces": []}))

    def total() -> int:
        kept = [s for s in sizes if s is not None]
        return base + sum(kept) + max(len(kept) - 1, 0)

    if total() <= budget:
        return body, 0, 0
    smallest_first = sorted(range(len(faces)), key=lambda i: face_size(faces[i]["bbox"]))
    crops = faces_dropped = 0
    for i in smallest_first:
        if total() <= budget:
            break
        if faces[i].get("crop") is not None:
            faces[i] = {**faces[i], "crop": None}
            sizes[i] = len(_encode(faces[i]))
            crops += 1
    for i in smallest_first:
        if total() <= budget:
            break
        sizes[i] = None
        faces_dropped += 1
    kept = [f for f, s in zip(faces, sizes, strict=True) if s is not None]
    return {**body, "faces": kept}, crops, faces_dropped


class BoardApi(CameraApi):
    """ส่งผลหน้าที่บอร์ดวิเคราะห์เองให้ API (แทนการส่งภาพ)"""

    def __init__(self, *args, model: str | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.model = model or os.environ.get("FACE_MODEL", "").strip() or DEFAULT_MODEL

    def send(self, result: dict) -> str:  # type: ignore[override]
        """คืน queued, busy (คิวเต็ม ข้ามเฟรมนี้) หรือ no_session (คาบจบแล้ว)"""
        faces, bad = finite_faces(result["faces"])
        if bad:
            log.warning("ตัดหน้าที่ค่าไม่ใช่ตัวเลขปกติ (NaN/inf) ทิ้ง %d หน้า", bad)
        body = {
            "capturedAt": result["capturedAt"],
            "model": self.model,
            "width": result["width"],
            "height": result["height"],
            "skippedSmall": result["skippedSmall"],
            "faces": faces,
        }
        body, crops, faces = fit_faces(body)
        if crops or faces:
            log.warning(
                "ข้อมูลเฟรมเกิน %d KB ตัดครอปหน้าเล็ก %d หน้า ตัดหน้าเล็กทิ้ง %d หน้า",
                MAX_BODY_BYTES // 1000,
                crops,
                faces,
            )
        res = self._request(
            "POST",
            "/camera/faces",
            content=_encode(body),
            headers={"Content-Type": "application/json"},
        )
        return {409: "no_session", 429: "busy"}.get(res.status_code, "queued")
