import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import NamedTuple, Protocol

import cv2
import numpy as np

log = logging.getLogger("camera")

JPEG_QUALITY = 85
# กรอบคนเล็กกว่านี้ (พิกเซล) ไม่เก็บเป็นรูป ใช้หน้าไม่ได้
MIN_CROP = 20
# API รับรูปไม่เกินนี้ต่อรูป รูปที่ใหญ่กว่านี้ทิ้ง แต่ยังส่งการข้ามเส้น
MAX_IMAGE_BYTES = 1024 * 1024
# track ที่หายไปนานกว่านี้ ลืมทั้งรูปและตำแหน่ง
STALE_SECONDS = 60


class Box(NamedTuple):
    x1: float
    y1: float
    x2: float
    y2: float
    score: float


class PersonDetector(Protocol):
    def detect(self, frame) -> list[Box]: ...


class Tracker(Protocol):
    def update(self, boxes: list[Box]) -> list[tuple[int, Box]]: ...
    def reset(self) -> None: ...


@dataclass
class Crossing:
    direction: str  # "out" หรือ "in"
    images: list[bytes]  # JPEG ครอปตัวคน มีเฉพาะตอน out


class QuadCounter:
    """นับเมื่อจุดของ track เดินจากหลังขอบหนึ่ง ผ่านในกรอบ ไปพ้นอีกขอบ

    quad เป็นสัดส่วนของภาพ 4 มุม 2 จุดแรกคือขอบในห้อง 2 จุดหลังคือขอบฝั่งออก
    อยู่ในกรอบเฉย ๆ หรือหันกลับในกรอบไม่นับ
    """

    def __init__(self, quad: list[tuple[float, float]]):
        a, b, c, d = quad
        self.quad = np.array(quad, dtype=np.float32)
        self.room = self._edge(a, b, c, d)
        self.exit = self._edge(c, d, a, b)
        self.sides: dict[int, str] = {}
        self.passed: dict[int, bool] = {}

    @staticmethod
    def _edge(p, q, o1, o2):
        # เวกเตอร์ตั้งฉากชี้เข้าหาขอบตรงข้าม ระยะบวก = อยู่ฝั่งในกรอบ
        nx, ny = -(q[1] - p[1]), q[0] - p[0]
        mx, my = (o1[0] + o2[0]) / 2, (o1[1] + o2[1]) / 2
        sign = 1 if nx * (mx - p[0]) + ny * (my - p[1]) >= 0 else -1
        return p, (sign * nx, sign * ny)

    @staticmethod
    def _dist(edge, x: float, y: float) -> float:
        p, n = edge
        return n[0] * (x - p[0]) + n[1] * (y - p[1])

    def update(self, tid: int, x: float, y: float) -> str | None:
        """คืน "out" หรือ "in" เมื่อ track นี้ข้ามกรอบครบ"""
        if self._dist(self.room, x, y) < 0:
            side = "room"
        elif self._dist(self.exit, x, y) < 0:
            side = "exit"
        else:
            if cv2.pointPolygonTest(self.quad, (float(x), float(y)), False) >= 0:
                self.passed[tid] = True
            return None
        before = self.sides.get(tid)
        self.sides[tid] = side
        counted = before is not None and before != side and self.passed.get(tid, False)
        self.passed[tid] = False
        if not counted:
            return None
        return "out" if side == "exit" else "in"

    def forget(self, tid: int | None = None) -> None:
        if tid is None:
            self.sides.clear()
            self.passed.clear()
        else:
            self.sides.pop(tid, None)
            self.passed.pop(tid, None)


class DoorCounter:
    """หาคน ตามคน แล้วนับคนที่เดินข้ามกรอบพื้นหน้าประตู

    ใช้จุดกึ่งกลางขอบล่างของกรอบคน (จุดเท้า) รูปครอปเก็บในหน่วยความจำเท่านั้น
    """

    def __init__(
        self,
        detector: PersonDetector,
        tracker: Tracker,
        quad: list[tuple[float, float]],
        keep: int = 3,
        now: Callable[[], float] = time.monotonic,
    ):
        self.detector = detector
        self.tracker = tracker
        self.counter = QuadCounter(quad)
        self.keep = keep
        self.now = now
        # track -> [(พื้นที่, ภาพ)] ใหญ่สุดก่อน
        self._crops: dict[int, list[tuple[int, np.ndarray]]] = {}
        self._seen: dict[int, float] = {}
        # กรอบที่ track อยู่ล่าสุด ไว้วาดดู
        self.tracks: list[tuple[int, Box]] = []

    @property
    def quad(self) -> np.ndarray:
        return self.counter.quad

    @property
    def crop_tracks(self) -> set[int]:
        return set(self._crops)

    def feed(self, frame) -> list[Crossing]:
        height, width = frame.shape[:2]
        self.tracks = self.tracker.update(self.detector.detect(frame))
        now = self.now()
        crossings: list[Crossing] = []
        for tid, box in self.tracks:
            self._seen[tid] = now
            self._keep_crop(tid, box, frame)
            direction = self.counter.update(tid, (box.x1 + box.x2) / 2 / width, box.y2 / height)
            if direction == "in":
                # รูปตอนเดินเข้าเห็นแต่หลัง ทิ้งไป ไม่ให้ไปปนกับตอนออก
                self._crops.pop(tid, None)
                crossings.append(Crossing("in", []))
            elif direction == "out":
                crops = self._crops.pop(tid, [])
                images = [self._jpeg(image) for _, image in crops]
                crossings.append(
                    Crossing("out", [i for i in images if 0 < len(i) <= MAX_IMAGE_BYTES])
                )
        self._drop_stale(now)
        return crossings

    def reset(self) -> None:
        """จบคาบ ลืมทุกคน"""
        self.tracker.reset()
        self.counter.forget()
        self._crops.clear()
        self._seen.clear()
        self.tracks = []

    def _keep_crop(self, tid: int, box: Box, frame) -> None:
        height, width = frame.shape[:2]
        x1, y1 = max(int(box.x1), 0), max(int(box.y1), 0)
        x2, y2 = min(int(box.x2), width), min(int(box.y2), height)
        if x2 - x1 < MIN_CROP or y2 - y1 < MIN_CROP:
            return
        area = (x2 - x1) * (y2 - y1)
        crops = self._crops.setdefault(tid, [])
        if len(crops) < self.keep or area > min(a for a, _ in crops):
            crops.append((area, frame[y1:y2, x1:x2].copy()))
            crops.sort(key=lambda item: -item[0])
            del crops[self.keep :]

    def _drop_stale(self, now: float) -> None:
        for tid in [t for t, seen in self._seen.items() if now - seen > STALE_SECONDS]:
            del self._seen[tid]
            self._crops.pop(tid, None)
            self.counter.forget(tid)

    @staticmethod
    def _jpeg(image: np.ndarray) -> bytes:
        ok, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        return buffer.tobytes() if ok else b""
