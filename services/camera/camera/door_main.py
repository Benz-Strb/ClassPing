"""โปรแกรมกล้องประตู รันบนเครื่องที่ต่อเว็บแคมที่ประตู: npm run dev:door"""

import logging
import os
import queue
import signal
import sys
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Protocol

import cv2

from camera.api import ApiDown, BadToken, CameraApi, Session
from camera.door import Crossing, DoorCounter
from camera.loop import POLL_SECONDS, RETRY_SECONDS, CameraError
from camera.webcam import Webcam

log = logging.getLogger("camera")

# ส่งไม่ผ่านเพราะเน็ต ลองซ้ำครั้งเดียวหลังเท่านี้ แล้วทิ้ง
RETRY_WAIT_SECONDS = 2
# ยังไม่มีภาพใหม่จากกล้อง รอก่อนถามอีกครั้ง
IDLE_SECONDS = 0.02


def parse_quad(text: str) -> list[tuple[float, float]]:
    """DOOR_QUAD: 8 ตัวเลข x,y ละคู่ 4 มุม เป็นสัดส่วน 0..1 ของภาพ"""
    try:
        values = [float(part) for part in text.split(",")]
    except ValueError:
        values = []
    if len(values) != 8 or not all(0 <= v <= 1 for v in values):
        raise ValueError("DOOR_QUAD ต้องเป็นตัวเลข 8 ตัว (x,y 4 มุม) ค่า 0 ถึง 1 คั่นด้วยจุลภาค")
    return [(values[i], values[i + 1]) for i in range(0, 8, 2)]


class Api(Protocol):
    def session(self) -> Session | None: ...


class Camera(Protocol):
    def open(self) -> None: ...
    def latest_raw(self): ...
    def close(self) -> None: ...


class Counter(Protocol):
    def feed(self, frame) -> list[Crossing]: ...
    def reset(self) -> None: ...


class Sender(Protocol):
    bad_token: bool

    def submit(self, crossing: Crossing) -> None: ...


class DoorSender:
    """ส่งการข้ามเส้นให้ API ใน thread แยก ไม่ให้การส่งทำให้ตกเฟรม"""

    def __init__(self, api, sleep: Callable[[float], None] = time.sleep):
        self.api = api
        self.sleep = sleep
        self.bad_token = False
        self._queue: queue.Queue[Crossing | None] = queue.Queue()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def submit(self, crossing: Crossing) -> None:
        self._queue.put(crossing)

    def stop(self) -> None:
        """ส่งที่ค้างให้หมดก่อนปิด"""
        self._queue.put(None)
        if self._thread is not None:
            self._thread.join(timeout=30)

    def _run(self) -> None:
        while (crossing := self._queue.get()) is not None:
            self.send(crossing)

    def send(self, crossing: Crossing) -> None:
        for attempt in (1, 2):
            try:
                trip = self.api.door(crossing.direction, crossing.images)
            except BadToken:
                self.bad_token = True
                return
            except ApiDown as error:
                if attempt == 1:
                    log.warning("%s ลองใหม่ใน %d วิ", error, RETRY_WAIT_SECONDS)
                    self.sleep(RETRY_WAIT_SECONDS)
                    continue
                log.warning("ข้ามเส้น %s ส่งไม่ได้ ทิ้ง", crossing.direction)
                return
            log.info("ข้ามเส้น %s ผล %s", crossing.direction, trip or "-")
            return


class DoorLoop:
    """ถามคาบทุก 30 วิ มีคาบก็เปิดกล้องหาคนที่ประตู หมดคาบก็ปิดกล้อง

    tick() ทำหนึ่งรอบแล้วคืนจำนวนวินาทีที่ควรรอก่อนรอบถัดไป
    """

    def __init__(
        self,
        api: Api,
        camera: Camera,
        counter: Counter,
        sender: Sender,
        now: Callable[[], datetime],
    ):
        self.api = api
        self.camera = camera
        self.counter = counter
        self.sender = sender
        self.now = now
        self.on_frame: Callable[[object], None] | None = None
        self.session: Session | None = None
        self.next_poll: datetime | None = None
        self._last_frame = None

    def tick(self) -> float:
        if self.sender.bad_token:
            raise BadToken("token กล้องไม่ถูกต้อง")
        now = self.now()
        if self.next_poll is None or now >= self.next_poll:
            try:
                self._switch(self.api.session())
            except ApiDown as error:
                log.warning("%s ลองใหม่ใน %d วิ", error, RETRY_SECONDS)
                return RETRY_SECONDS
            except CameraError as error:
                # เปิดกล้องไม่ได้ ลองใหม่เรื่อย ๆ
                log.warning("%s ลองใหม่ใน %d วิ", error, RETRY_SECONDS)
                self.next_poll = now + timedelta(seconds=RETRY_SECONDS)
                return RETRY_SECONDS
            self.next_poll = now + timedelta(seconds=POLL_SECONDS)

        if self.session is not None and now >= self.session.ends_at:
            self._switch(None)
        if self.session is None:
            return max((self.next_poll - now).total_seconds(), 0) if self.next_poll else 0

        frame = self.camera.latest_raw()
        if frame is None or frame is self._last_frame:
            return IDLE_SECONDS
        self._last_frame = frame
        for crossing in self.counter.feed(frame):
            self.sender.submit(crossing)
        if self.on_frame is not None:
            self.on_frame(frame)
        return 0

    def _switch(self, session: Session | None) -> None:
        if session is not None and self.session is None:
            try:
                self.camera.open()
            except Exception as error:
                raise CameraError(str(error)) from error
            log.info("เริ่มนับคนที่ประตู %s (ถึง %s)", session.course, session.ends_at.astimezone())
        elif session is None and self.session is not None:
            log.info("หยุดนับคนที่ประตู %s", self.session.course)
            self.camera.close()
            self.counter.reset()
            self._last_frame = None
        self.session = session


def _preview(counter: DoorCounter) -> Callable[[object], None]:
    """หน้าต่างดูสด กรอบพื้นสีเหลือง กรอบคนสีเขียว กด q เพื่อออก ต้องเรียกจาก main thread"""

    def show(frame) -> None:
        height, width = frame.shape[:2]
        image = frame.copy()
        quad = (counter.quad * (width, height)).astype("int32")
        cv2.polylines(image, [quad], True, (0, 255, 255), 2)
        for tid, box in counter.tracks:
            p1, p2 = (int(box.x1), int(box.y1)), (int(box.x2), int(box.y2))
            cv2.rectangle(image, p1, p2, (0, 255, 0), 2)
            cv2.putText(
                image,
                str(tid),
                (p1[0], max(p1[1] - 8, 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0),
                2,
            )
        cv2.imshow("door camera (q = ออก)", cv2.resize(image, (640, round(height * 640 / width))))
        if cv2.waitKey(1) & 0xFF == ord("q"):
            raise KeyboardInterrupt

    return show


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    signal.signal(signal.SIGINT, signal.default_int_handler)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    token = os.environ.get("DOOR_CAMERA_TOKEN", "").strip()
    if not token:
        log.error("ยังไม่ได้ตั้ง DOOR_CAMERA_TOKEN ใน services/camera/.env")
        return 1
    model_path = os.environ.get("DOOR_MODEL_PATH", "").strip()
    if not model_path or not os.path.isfile(model_path):
        log.error("ยังไม่ได้ตั้ง DOOR_MODEL_PATH หรือหาไฟล์ yolox_s.onnx ไม่เจอ")
        return 1
    try:
        quad = parse_quad(os.environ.get("DOOR_QUAD", "").strip())
    except ValueError as error:
        log.error("%s", error)
        return 1

    # โหลดตอนนี้ (ไม่ใช่ตอน import) เพื่อให้เทสต์ไม่ต้องใช้โมเดล
    from camera.person import ByteTrack, YoloxDetector

    api_url = os.environ.get("API_URL", "").strip() or "http://127.0.0.1:3001"
    index = int(os.environ.get("DOOR_CAMERA_INDEX", "").strip() or 0)
    camera = Webcam(index=index, max_width=1920)
    counter = DoorCounter(YoloxDetector(model_path), ByteTrack(), quad)
    api = CameraApi(api_url, token)
    sender = DoorSender(api)
    loop = DoorLoop(api, camera, counter, sender, lambda: datetime.now(UTC))
    if os.environ.get("DOOR_PREVIEW", "").strip() == "1":
        loop.on_frame = _preview(counter)
    sender.start()

    log.info("รอคาบจาก %s (กล้องประตูหมายเลข %d)", api_url, index)
    try:
        while True:
            try:
                wait = loop.tick()
            except BadToken:
                raise
            except Exception:
                log.exception("เกิดข้อผิดพลาด ลองใหม่ใน %d วิ", RETRY_SECONDS)
                wait = RETRY_SECONDS
            time.sleep(wait)
    except BadToken as error:
        log.error("%s", error)
        return 1
    except KeyboardInterrupt:
        return 0
    finally:
        camera.close()
        sender.stop()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    sys.exit(main())
