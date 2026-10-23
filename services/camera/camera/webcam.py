import logging
import sys
import threading

import cv2

log = logging.getLogger("camera")

JPEG_QUALITY = 85


class Webcam:
    """อ่านภาพจากกล้องตลอดใน thread แยก read() ได้ภาพล่าสุดเสมอ ไม่ใช่ภาพเก่าที่ค้างใน buffer

    ภาพอยู่ในหน่วยความจำเท่านั้น ไม่บันทึกลงดิสก์
    """

    def __init__(self, index: int, max_width: int):
        self.index = index
        self.max_width = max_width
        self._cap: cv2.VideoCapture | None = None
        self._frame = None
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None

    def open(self) -> None:
        backend = cv2.CAP_AVFOUNDATION if sys.platform == "darwin" else cv2.CAP_ANY
        cap = cv2.VideoCapture(self.index, backend)
        if not cap.isOpened():
            raise RuntimeError(f"เปิดกล้องหมายเลข {self.index} ไม่ได้")
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
        self._cap = cap
        self._running = True
        self._thread = threading.Thread(target=self._grab, daemon=True)
        self._thread.start()

    def _grab(self) -> None:
        while self._running and self._cap is not None:
            ok, frame = self._cap.read()
            if ok:
                with self._lock:
                    self._frame = frame

    def read(self) -> bytes | None:
        with self._lock:
            frame, self._frame = self._frame, None
        if frame is None:
            return None
        height, width = frame.shape[:2]
        if width > self.max_width:
            size = (self.max_width, round(height * self.max_width / width))
            frame = cv2.resize(frame, size, interpolation=cv2.INTER_AREA)
        ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        return buffer.tobytes() if ok else None

    def close(self) -> None:
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=2)
        if self._cap is not None:
            self._cap.release()
        self._cap = None
        self._frame = None
