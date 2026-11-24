import logging
import threading
import time
from collections.abc import Callable
from datetime import datetime

import cv2
import numpy as np

from camera.board.analyze import FaceAnalyzer

log = logging.getLogger("camera")

# อ่านภาพไม่ได้ติดกันเท่านี้ (ราว 3 วิ) ถือว่าสายหลุด ปิดแล้วต่อใหม่
FAILS_BEFORE_RECONNECT = 30
RECONNECT_SECONDS = 5
CLOSE_JOIN_SECONDS = 10


def mask_url(url: str) -> str:
    """ซ่อนรหัสผ่านใน URL (rtsp://user:pass@ip) ก่อนเอาไปแสดงหรือ log

    รหัสผ่านมี @ / : ได้ จึงตัดที่ @ ตัวสุดท้าย (urlsplit ตัดที่ / ตัวแรกแล้วรหัสรั่ว)
    ถ้าอ่านรูปแบบไม่ออกให้คืนข้อความคงที่ ดีกว่าเสี่ยงโชว์รหัส
    """
    try:
        scheme, sep, rest = url.partition("://")
        if not sep or not scheme.isalnum():
            return "rtsp://***"
        at = rest.rfind("@")
        if at == -1:
            return url
        userinfo, tail = rest[:at], rest[at + 1 :]
        if ":" not in userinfo:
            return url
        return f"{scheme}://{userinfo.split(':', 1)[0]}:***@{tail}"
    except Exception:  # noqa: BLE001 ห้ามให้การซ่อนรหัสพังแล้ว log รั่ว
        return "rtsp://***"


class _Reader:
    """สถานะของ thread อ่านภาพหนึ่งตัว (กล้องที่เปิดอยู่ จำนวนครั้งที่อ่านพลาด ธงหยุด)

    เปิดใหม่แต่ละครั้งได้ตัวใหม่เสมอ thread เก่าที่ยังค้าง read() อยู่จะปิดกล้องของตัวเองแล้วจบไป
    """

    def __init__(self) -> None:
        self.cap = None
        self.fails = 0
        self.stop = threading.Event()
        # มี thread แล้ว thread เป็นคนปิดกล้องเอง (ตอนจบ) คนอื่นห้ามปิดให้
        self.thread: threading.Thread | None = None


class RtspCamera:
    """อ่านภาพจากกล้อง CCTV ผ่าน RTSP ใน thread แยก เก็บแค่ภาพล่าสุด

    หลุดแล้วต่อใหม่เอง read_frame() คืน None ระหว่างหลุด ไม่ raise
    ภาพอยู่ในหน่วยความจำเท่านั้น ไม่บันทึกลงดิสก์
    """

    def __init__(self, url: str, capture_factory: Callable = cv2.VideoCapture):
        self._url = url
        self._factory = capture_factory
        # _frame คือภาพล่าสุดให้วิดีโอ ไม่ถูกล้างตอนวิเคราะห์ _fresh บอกว่ายังไม่มีใครวิเคราะห์ภาพนี้
        self._frame: np.ndarray | None = None
        self._fresh = False
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._reader = _Reader()

    def open(self) -> None:
        # ต่อไม่ติดไม่ถือว่าพัง thread จะลองต่อใหม่เรื่อย ๆ กล้องเพิ่งบูตก็ไม่พลาดทั้งคาบ
        if self._thread is not None:
            self.close()
        # thread เก่าที่ปิดไม่ทัน (read() ของ FFmpeg ค้าง) ถูกสั่งหยุดแล้ว ปล่อยให้จบเอง
        # ตัวใหม่ใช้ธงหยุดกับกล้องของตัวเอง จึงไม่ชนกัน
        reader = _Reader()
        self._reader = reader
        self._reset_frame()
        self._connect(reader)
        self._thread = threading.Thread(target=self._grab, args=(reader,), daemon=True)
        reader.thread = self._thread
        self._thread.start()

    @staticmethod
    def _release(cap) -> None:
        try:
            cap.release()
        except Exception:  # noqa: BLE001 release พังก็ต้องไปต่อ ห้ามให้ thread ตาย
            log.warning("ปิดกล้องไม่สำเร็จ")

    def _drop_cap(self, reader: _Reader) -> None:
        cap, reader.cap = reader.cap, None
        if cap is not None:
            self._release(cap)

    def _publish(self, reader: _Reader, frame: np.ndarray | None) -> None:
        # thread ที่ถูกสั่งหยุดแล้วห้ามแตะภาพของ thread ตัวใหม่
        with self._lock:
            if not reader.stop.is_set():
                self._frame = frame
                self._fresh = frame is not None

    def _reset_frame(self) -> None:
        with self._lock:
            self._frame = None
            self._fresh = False

    def _connect(self, reader: _Reader | None = None) -> bool:
        reader = reader or self._reader
        try:
            cap = self._factory(self._url, cv2.CAP_FFMPEG)
            opened = cap.isOpened()
        except Exception:  # noqa: BLE001 OpenCV โยนได้หลายชนิด ห้ามให้ thread ตาย
            cap, opened = None, False
        if not opened:
            if cap is not None:
                self._release(cap)
            log.warning("ต่อกล้อง %s ไม่ได้ ลองใหม่ใน %d วิ", mask_url(self._url), RECONNECT_SECONDS)
            return False
        reader.cap = cap
        reader.fails = 0
        log.info("ต่อกล้อง %s แล้ว", mask_url(self._url))
        return True

    def _step(self, reader: _Reader | None = None) -> bool:
        """ทำหนึ่งรอบ คืน True ถ้ารอบนี้ควรพักก่อนรอบต่อไป"""
        reader = reader or self._reader
        if reader.cap is None:
            return not self._connect(reader)
        try:
            ok, frame = reader.cap.read()
        except Exception:  # noqa: BLE001 OpenCV โยนได้หลายชนิด ห้ามให้ thread ตาย
            ok, frame = False, None
        if ok and frame is not None:
            reader.fails = 0
            self._publish(reader, frame)
            return False
        reader.fails += 1
        if reader.fails < FAILS_BEFORE_RECONNECT:
            return True
        log.warning("อ่านภาพจากกล้อง %s ไม่ได้ ต่อใหม่", mask_url(self._url))
        self._drop_cap(reader)
        self._publish(reader, None)
        return True

    def _grab(self, reader: _Reader) -> None:
        try:
            while not reader.stop.is_set():
                if self._step(reader):
                    # หลุดแล้ว read() คืนทันที ถ้าไม่พักจะกิน CPU เต็ม (wait ปลุกได้ตอน close)
                    reader.stop.wait(RECONNECT_SECONDS if reader.cap is None else 0.1)
        finally:
            # ปิดกล้องใน thread เอง ไม่ปิดตอน read() ยังค้างอยู่
            self._drop_cap(reader)

    def latest_raw(self) -> np.ndarray | None:
        """ภาพล่าสุดแบบยังไม่ย่อ ไม่ล้างภาพ (ให้วิดีโอใช้ร่วมกับการวิเคราะห์)"""
        with self._lock:
            return self._frame

    def read_frame(self) -> np.ndarray | None:
        with self._lock:
            if not self._fresh:
                return None
            self._fresh = False
            return self._frame

    def close(self) -> None:
        reader = self._reader
        reader.stop.set()
        thread, self._thread = self._thread, None
        if thread is not None:
            thread.join(timeout=CLOSE_JOIN_SECONDS)
            if thread.is_alive():
                # read() ค้างอยู่ ปล่อยให้ thread ปิดกล้องของตัวเองตอนอ่านเสร็จ
                log.warning("thread อ่านภาพยังไม่หยุด ปล่อยให้จบเอง")
        elif reader.thread is None:
            # ไม่เคยมี thread ของ reader นี้ ปิดกล้องเองได้ ถ้ามี (แม้ยังค้าง read()) ปล่อยให้ thread ปิด
            self._drop_cap(reader)
        self._reset_frame()


class AnalyzingCamera:
    """ครอบ RtspCamera: อ่านภาพใหม่แล้วให้ตัววิเคราะห์หน้า คืนผลพร้อมเวลาถ่าย (ไว้ใช้ใน log)"""

    def __init__(self, source: RtspCamera, analyzer: FaceAnalyzer, now: Callable[[], datetime]):
        self.source = source
        self.analyzer = analyzer
        self.now = now

    def open(self) -> None:
        self.source.open()

    def read(self) -> dict | None:
        frame = self.source.read_frame()
        if frame is None:
            return None
        started = time.perf_counter()
        result = self.analyzer.analyze(frame)
        log.info(
            "วิเคราะห์ %d หน้า (เล็กเกิน %d) ใช้ %d ms",
            len(result["faces"]),
            result["skippedSmall"],
            (time.perf_counter() - started) * 1000,
        )
        result["capturedAt"] = self.now().astimezone().isoformat()
        return result

    def close(self) -> None:
        self.source.close()
