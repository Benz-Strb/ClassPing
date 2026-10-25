import logging
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Protocol

from camera.api import ApiDown, Session

log = logging.getLogger("camera")

# ถามคาบทุกเท่านี้ แม้กำลังส่งภาพอยู่ เผื่ออาจารย์ย้ายห้องหรืองดสอน
POLL_SECONDS = 30
RETRY_SECONDS = 5
# วิดีโอหลุด (เน็ตหลุด, media server restart) เริ่มใหม่หลังจากนี้
STREAM_RETRY_SECONDS = 5


class CameraError(Exception):
    """เปิดกล้องไม่ได้"""


class Api(Protocol):
    def session(self) -> Session | None: ...
    def send(self, frame: bytes) -> str: ...


class Camera(Protocol):
    def open(self) -> None: ...
    def read(self) -> bytes | None: ...
    def close(self) -> None: ...


class Streamer(Protocol):
    @property
    def alive(self) -> bool: ...
    @property
    def running(self) -> bool: ...
    def start(self, url: str, fps: int, bitrate_kbps: int) -> bool: ...
    def stop(self) -> None: ...


class CameraLoop:
    """ถามคาบจาก API มีคาบก็เปิดกล้องส่งภาพตาม fps หมดคาบก็ปิดกล้อง

    tick() ทำหนึ่งรอบแล้วคืนจำนวนวินาทีที่ควรรอก่อนรอบถัดไป
    """

    def __init__(
        self,
        api: Api,
        camera: Camera,
        now: Callable[[], datetime],
        streamer: Streamer | None = None,
    ):
        self.api = api
        self.camera = camera
        self.now = now
        self.streamer = streamer
        self.session: Session | None = None
        self.next_poll: datetime | None = None
        self.next_stream_try: datetime | None = None
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
            except CameraError as error:
                # กล้องหลุดหรือมีโปรแกรมอื่นใช้อยู่ ลองใหม่เรื่อย ๆ ห้องจะได้ไม่พลาดทั้งคาบ
                log.warning("%s ลองใหม่ใน %d วิ", error, RETRY_SECONDS)
                self.next_poll = now + timedelta(seconds=RETRY_SECONDS)
                return RETRY_SECONDS
            self.next_poll = now + timedelta(seconds=POLL_SECONDS)

        if self.session is not None and now >= self.session.ends_at:
            self._switch(None)
        if self.session is None:
            return max((self.next_poll - now).total_seconds(), 0) if self.next_poll else 0

        self._keep_streaming(now)
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

    # วิดีโอแยกจากการส่งภาพเช็คชื่อ วิดีโอพังการเช็คชื่อยังทำงานต่อ
    def _keep_streaming(self, now: datetime):
        stream = self.session.stream if self.session else None
        if stream is None or self.streamer is None or self.streamer.alive:
            return
        if self.next_stream_try is not None and now < self.next_stream_try:
            return
        if self.streamer.running:
            self.streamer.stop()
        self.next_stream_try = now + timedelta(seconds=STREAM_RETRY_SECONDS)
        self.streamer.start(stream.url, stream.fps, stream.bitrate_kbps)

    def _switch(self, session: Session | None):
        if session is not None and self.session is None:
            try:
                self.camera.open()
            except Exception as error:
                raise CameraError(str(error)) from error
            log.info("เริ่มส่งภาพ %s (ถึง %s)", session.course, session.ends_at.astimezone())
            self.sent = 0
        elif session is None and self.session is not None:
            log.info("หยุดส่งภาพ %s (ส่งไป %d ภาพ)", self.session.course, self.sent)
            if self.streamer is not None:
                self.streamer.stop()
            self.next_stream_try = None
            self.camera.close()
        self.session = session
