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
from camera.loop import POLL_SECONDS, RETRY_SECONDS, STREAM_RETRY_SECONDS, CameraError, Streamer
from camera.stream import Streamer as FfmpegStreamer
from camera.webcam import Webcam

log = logging.getLogger("camera")

# ส่งไม่ผ่านเพราะเน็ต ลองซ้ำครั้งเดียวหลังเท่านี้ แล้วทิ้ง
RETRY_WAIT_SECONDS = 2
# ยังไม่มีภาพใหม่จากกล้อง รอก่อนถามอีกครั้ง
IDLE_SECONDS = 0.02
WINDOW = "door camera (q = quit)"
# ไม่มีคาบ ถามสถานะภายในโปรแกรมทุกเท่านี้
NO_SESSION_WAIT_SECONDS = 1
# log ความเร็วที่ประมวลผลได้ทุกเท่านี้ จะได้เห็นถ้าช้าลง
FPS_LOG_SECONDS = 30
MIN_FRAME_SECONDS = 1 / 15


def _cross(o, a, b) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _segments_cross(p1, p2, p3, p4) -> bool:
    d1, d2 = _cross(p3, p4, p1), _cross(p3, p4, p2)
    d3, d4 = _cross(p1, p2, p3), _cross(p1, p2, p4)
    return d1 * d2 < 0 and d3 * d4 < 0


def parse_quad(text: str) -> list[tuple[float, float]]:
    """DOOR_QUAD: 8 ตัวเลข x,y ละคู่ 4 มุม เป็นสัดส่วน 0..1 ของภาพ

    2 จุดแรกคือขอบในห้อง 2 จุดหลังคือขอบฝั่งออก มุมต้องเรียงต่อกันรอบกรอบ
    """
    try:
        values = [float(part) for part in text.split(",")]
    except ValueError:
        values = []
    if len(values) != 8 or not all(0 <= v <= 1 for v in values):
        raise ValueError("DOOR_QUAD ต้องเป็นตัวเลข 8 ตัว (x,y 4 มุม) ค่า 0 ถึง 1 คั่นด้วยจุลภาค")
    a, b, c, d = quad = [(values[i], values[i + 1]) for i in range(0, 8, 2)]
    area = abs(sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(quad, quad[1:] + quad[:1]))) / 2
    if area < 0.001 or _segments_cross(a, b, c, d) or _segments_cross(b, c, d, a):
        raise ValueError("DOOR_QUAD เรียงมุมไม่ถูก ต้องวนรอบกรอบ ไม่ไขว้ และไม่แบน")
    return quad


class SessionSource(Protocol):
    bad_token: bool

    def latest(self) -> Session | None: ...


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
            try:
                self.send(crossing)
            except Exception:
                # thread ต้องอยู่ต่อ ไม่งั้นข้ามเส้นต่อไปจะไม่ถูกส่งเลย
                log.exception("ส่งข้ามเส้น %s ไม่สำเร็จ ทิ้ง", crossing.direction)

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


class SessionPoller:
    """ถามคาบจาก API ใน thread แยก tick() ของ DoorLoop จะได้ไม่ต้องรอเน็ต

    ต่อ API ไม่ได้ก็ใช้คาบล่าสุดที่รู้ไว้ก่อน
    """

    def __init__(self, api):
        self.api = api
        self.bad_token = False
        self._session: Session | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def latest(self) -> Session | None:
        return self._session

    def poll_once(self) -> bool:
        """คืน True ถ้าถามสำเร็จ"""
        try:
            self._session = self.api.session()
        except BadToken:
            self.bad_token = True
            return False
        except ApiDown as error:
            log.warning("%s ใช้คาบล่าสุดไปก่อน ลองใหม่ใน %d วิ", error, RETRY_SECONDS)
            return False
        return True

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=15)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                ok = self.poll_once()
            except Exception:
                log.exception("ถามคาบผิดพลาด ลองใหม่ใน %d วิ", RETRY_SECONDS)
                ok = False
            self._stop.wait(POLL_SECONDS if ok else RETRY_SECONDS)


class DoorLoop:
    """มีคาบก็เปิดกล้องหาคนที่ประตู หมดคาบก็ปิดกล้อง

    ไม่แตะเครือข่ายเลย ใช้คาบล่าสุดจาก SessionPoller และปิดกล้องเองเมื่อถึงเวลาจบคาบ
    tick() ทำหนึ่งรอบแล้วคืนจำนวนวินาทีที่ควรรอก่อนรอบถัดไป
    """

    def __init__(
        self,
        poller: SessionSource,
        camera: Camera,
        counter: Counter,
        sender: Sender,
        now: Callable[[], datetime],
        streamer: Streamer | None = None,
    ):
        self.poller = poller
        self.camera = camera
        self.counter = counter
        self.sender = sender
        self.now = now
        self.streamer = streamer
        self.next_stream_try: datetime | None = None
        self.on_frame: Callable[[object], None] | None = None
        self.session: Session | None = None
        self.next_open: datetime | None = None
        self._last_frame = None
        self._fps_since = now()
        self._fps_frames = 0

    def tick(self) -> float:
        if self.sender.bad_token or self.poller.bad_token:
            raise BadToken("token กล้องไม่ถูกต้อง")
        now = self.now()
        session = self.poller.latest()
        if session is not None and now >= session.ends_at:
            session = None
        if session is None:
            if self.session is not None:
                self._close()
            return NO_SESSION_WAIT_SECONDS
        if self.session is None:
            if self.next_open is not None and now < self.next_open:
                return (self.next_open - now).total_seconds()
            try:
                self._open(session)
            except CameraError as error:
                # กล้องหลุดหรือมีโปรแกรมอื่นใช้อยู่ ลองใหม่เรื่อย ๆ
                log.warning("%s ลองใหม่ใน %d วิ", error, RETRY_SECONDS)
                self.next_open = now + timedelta(seconds=RETRY_SECONDS)
                return RETRY_SECONDS
            self._fps_since, self._fps_frames = now, 0
        self.session = session
        self._keep_streaming(now)

        frame = self.camera.latest_raw()
        if frame is None or frame is self._last_frame:
            return IDLE_SECONDS
        self._last_frame = frame
        for crossing in self.counter.feed(frame):
            self.sender.submit(crossing)
        if self.on_frame is not None:
            self.on_frame(frame)
        self._count_fps(now)
        return 0

    def _count_fps(self, now: datetime) -> None:
        self._fps_frames += 1
        elapsed = (now - self._fps_since).total_seconds()
        if elapsed >= FPS_LOG_SECONDS:
            log.info("ประมวลผล %.1f ภาพ/วินาที", self._fps_frames / elapsed)
            self._fps_since, self._fps_frames = now, 0

    # วิดีโอดูสด/อัดเก็บแยกจากการนับคน วิดีโอพังการนับคนยังทำงานต่อ
    def _keep_streaming(self, now: datetime) -> None:
        stream = self.session.stream if self.session else None
        if stream is None or self.streamer is None or self.streamer.alive:
            return
        if self.next_stream_try is not None and now < self.next_stream_try:
            return
        if self.streamer.running:
            self.streamer.stop()
        self.next_stream_try = now + timedelta(seconds=STREAM_RETRY_SECONDS)
        self.streamer.start(stream.url, stream.fps, stream.bitrate_kbps)

    def _open(self, session: Session) -> None:
        try:
            self.camera.open()
        except Exception as error:
            raise CameraError(str(error)) from error
        self.next_open = None
        log.info("เริ่มนับคนที่ประตู %s (ถึง %s)", session.course, session.ends_at.astimezone())

    def _close(self) -> None:
        log.info("หยุดนับคนที่ประตู %s", self.session.course)
        if self.streamer is not None:
            self.streamer.stop()
        self.next_stream_try = None
        self.camera.close()
        self.counter.reset()
        self._last_frame = None
        self.session = None


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
        cv2.imshow(WINDOW, cv2.resize(image, (640, round(height * 640 / width))))
        _pump_window()

    return show


def _pump_window() -> None:
    """ให้หน้าต่างตอบสนอง กด q เพื่อออก"""
    if cv2.waitKey(1) & 0xFF == ord("q"):
        raise KeyboardInterrupt


def _wait(seconds: float, preview: bool) -> None:
    if not preview:
        time.sleep(seconds)
        return
    # ระหว่างรอ (เช่นไม่มีคาบ) ยังต้องวนรับปุ่มของหน้าต่าง ไม่งั้นค้าง
    end = time.monotonic() + seconds
    while (left := end - time.monotonic()) > 0:
        time.sleep(min(left, 0.03))
        _pump_window()


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

    # ต้องตั้งเอง ไม่งั้นจะไปเปิดกล้องหมายเลข 0 ซึ่งมักเป็นกล้องหน้าห้อง
    try:
        index = int(os.environ.get("DOOR_CAMERA_INDEX", "").strip())
    except ValueError:
        log.error("ยังไม่ได้ตั้ง DOOR_CAMERA_INDEX หรือไม่ใช่ตัวเลข (หมายเลขกล้องประตู)")
        return 1

    # โหลดตอนนี้ (ไม่ใช่ตอน import) เพื่อให้เทสต์ไม่ต้องใช้โมเดล
    from camera.person import ByteTrack, YoloxDetector

    api_url = os.environ.get("API_URL", "").strip() or "http://127.0.0.1:3001"
    camera = Webcam(index=index, max_width=1280, size=(1280, 720))
    counter = DoorCounter(YoloxDetector(model_path), ByteTrack(), quad)
    api = CameraApi(api_url, token)
    sender = DoorSender(api)
    poller = SessionPoller(api)
    # วิดีโอส่งเมื่อ API บอกที่ส่งมาเท่านั้น ตั้ง DOOR_CAMERA_MIRROR=1 ถ้ากล้องให้ภาพกลับด้าน
    streamer = FfmpegStreamer(
        source=camera.latest_raw,
        max_width=1280,
        mirror=os.environ.get("DOOR_CAMERA_MIRROR", "").strip() == "1",
    )
    loop = DoorLoop(poller, camera, counter, sender, lambda: datetime.now(UTC), streamer)
    preview = os.environ.get("DOOR_PREVIEW", "").strip() == "1"
    if preview:
        loop.on_frame = _preview(counter)
    sender.start()
    poller.start()

    log.info("รอคาบจาก %s (กล้องประตูหมายเลข %d)", api_url, index)
    try:
        while True:
            started = time.monotonic()
            try:
                wait = loop.tick()
            except BadToken:
                raise
            except Exception:
                log.exception("เกิดข้อผิดพลาด ลองใหม่ใน %d วิ", RETRY_SECONDS)
                wait = RETRY_SECONDS
            # ไม่ประมวลผลเร็วเกิน 15 ภาพ/วินาที ที่วัดความแม่นยำไว้ เครื่องจะได้ไม่ร้อนเกินจำเป็น
            # จำกัดเฉพาะตอนเพิ่งประมวลผลภาพ ตอนรอภาพใหม่ต้องรอสั้นเท่าเดิม ไม่งั้นพลาดภาพถัดไป
            if wait == 0:
                wait = max(0, MIN_FRAME_SECONDS - (time.monotonic() - started))
            _wait(wait, preview)
    except BadToken as error:
        log.error("%s", error)
        return 1
    except KeyboardInterrupt:
        return 0
    finally:
        # ปล่อยกล้องก่อน การรอ API ตอบต้องไม่ทำให้กล้องเปิดค้าง
        streamer.stop()
        camera.close()
        poller.stop()
        sender.stop()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    sys.exit(main())
