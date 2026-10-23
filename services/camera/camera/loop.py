import logging
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Protocol

from camera.api import ApiDown, Session

log = logging.getLogger("camera")

# ถามคาบทุกเท่านี้ แม้กำลังส่งภาพอยู่ เผื่ออาจารย์ย้ายห้องหรืองดสอน
POLL_SECONDS = 30
RETRY_SECONDS = 5


class Api(Protocol):
    def session(self) -> Session | None: ...
    def send(self, frame: bytes) -> str: ...


class Camera(Protocol):
    def open(self) -> None: ...
    def read(self) -> bytes | None: ...
    def close(self) -> None: ...


class CameraLoop:
    """ถามคาบจาก API มีคาบก็เปิดกล้องส่งภาพตาม fps หมดคาบก็ปิดกล้อง

    tick() ทำหนึ่งรอบแล้วคืนจำนวนวินาทีที่ควรรอก่อนรอบถัดไป
    """

    def __init__(self, api: Api, camera: Camera, now: Callable[[], datetime]):
        self.api = api
        self.camera = camera
        self.now = now
        self.session: Session | None = None
        self.next_poll: datetime | None = None
        self.sent = 0

    def tick(self) -> float:
        now = self.now()
        if self.next_poll is None or now >= self.next_poll:
            try:
                self._switch(self.api.session())
            except ApiDown as error:
                log.warning("%s ลองใหม่ใน %d วิ", error, RETRY_SECONDS)
                self.next_poll = None
                return RETRY_SECONDS
            self.next_poll = now + timedelta(seconds=POLL_SECONDS)

        if self.session is not None and now >= self.session.ends_at:
            self._switch(None)
        if self.session is None:
            return max((self.next_poll - now).total_seconds(), 0) if self.next_poll else 0

        interval = 1 / self.session.fps
        started = self.now()
        frame = self.camera.read()
        if frame is None:
            return interval
        try:
            result = self.api.send(frame)
        except ApiDown as error:
            log.warning("%s ลองใหม่ใน %d วิ", error, RETRY_SECONDS)
            return RETRY_SECONDS
        if result == "queued":
            self.sent += 1
        if result == "no_session":
            self._switch(None)
            self.next_poll = None
            return 0
        # หักเวลาที่ใช้ส่งภาพ ให้ได้ภาพตาม fps จริง
        return max(interval - (self.now() - started).total_seconds(), 0)

    def _switch(self, session: Session | None):
        if session is not None and self.session is None:
            log.info("เริ่มส่งภาพ %s (ถึง %s)", session.course, session.ends_at.astimezone())
            self.sent = 0
            self.camera.open()
        elif session is None and self.session is not None:
            log.info("หยุดส่งภาพ %s (ส่งไป %d ภาพ)", self.session.course, self.sent)
            self.camera.close()
        self.session = session
