import logging
import re
import subprocess
import threading
import time
from collections import deque
from collections.abc import Callable
from datetime import datetime

import cv2

log = logging.getLogger("camera")

_TOKEN = re.compile(r"token=[^&\s]+")


def _hide(text: str) -> str:
    return _TOKEN.sub("token=***", text)


def _path_of(url: str) -> str:
    return _hide(url.split("?", 1)[0])


_JOIN_S = 2


_WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def stamp_text(at: datetime) -> str:
    """วัน-เดือน-ปี ค.ศ. ชื่อวัน และเวลา 24 ชม. ชื่อวันเป็นอังกฤษเพราะฟอนต์ของ OpenCV เขียนไทยไม่ได้"""
    return f"{at:%d-%m-%Y} {_WEEKDAYS[at.weekday()]} {at:%H:%M:%S}"


def stamp(frame, at: datetime) -> None:
    """เขียนวันเวลามุมขวาบนแบบกล้องวงจรปิด ขอบดำให้อ่านได้ทั้งพื้นสว่างและมืด
    มุมซ้ายบนเว็บใช้แสดงป้ายสด/ย้อนหลัง มุมขวาล่างเป็นชื่อกล้อง"""
    text = stamp_text(at)
    scale = frame.shape[0] / 720 * 0.8
    font = cv2.FONT_HERSHEY_SIMPLEX
    outline = max(1, round(6 * scale))
    (width, _), _ = cv2.getTextSize(text, font, scale, outline)
    origin = (frame.shape[1] - width - round(16 * scale), round(40 * scale))
    cv2.putText(frame, text, origin, font, scale, (0, 0, 0), outline, cv2.LINE_AA)
    cv2.putText(frame, text, origin, font, scale, (255, 255, 255), max(1, round(2 * scale)), cv2.LINE_AA)


class Streamer:
    """ส่งภาพจากกล้องเข้า ffmpeg เข้ารหัส H.264 แล้ว publish RTSP ให้ media server

    ไม่บันทึกอะไรลงดิสก์ในเครื่องนี้ (media server เป็นคนอัด) ไม่มีเสียง
    ทุกภาพมีวันเวลาตอนส่งติดไว้ ภาพย้อนหลังจะได้บอกเวลาเองได้
    mirror กลับซ้ายขวาสำหรับกล้องที่ให้ภาพกลับด้าน (ต้องกลับก่อนเขียนเวลา ไม่งั้นตัวหนังสือกลับด้าน)
    """

    def __init__(
        self,
        source: Callable[[], object],
        max_width: int,
        popen: Callable[..., subprocess.Popen] = subprocess.Popen,
        feed: bool = True,
        mirror: bool = False,
        clock: Callable[[], datetime] = lambda: datetime.now().astimezone(),
    ):
        self.source = source
        self.max_width = max_width
        self.mirror = mirror
        self._clock = clock
        self._popen = popen
        self._feed = feed
        self._proc: subprocess.Popen | None = None
        self._size: tuple[int, int] | None = None
        self._broken = False
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._tail: deque[str] = deque(maxlen=5)
        self._url = ""

    @property
    def running(self) -> bool:
        return self._proc is not None

    @property
    def alive(self) -> bool:
        return self._proc is not None and not self._broken and self._proc.poll() is None

    def start(self, url: str, fps: int, bitrate_kbps: int) -> bool:
        frame = self.source()
        if frame is None:
            return False
        height, width = frame.shape[:2]
        out_w = min(width, self.max_width)
        out_h = round(height * out_w / width)
        # libx264 + yuv420p ต้องการด้านกว้าง/สูงเป็นเลขคู่
        self._size = (out_w - out_w % 2, out_h - out_h % 2)
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "-s",
            f"{self._size[0]}x{self._size[1]}",
            # ใช้เวลาจริงตอนรับภาพ เครื่องส่งช้ากว่า fps แล้ววิดีโอไม่ช้ากว่านาฬิกา (MediaMTX ฟ้อง drift)
            "-use_wallclock_as_timestamps",
            "1",
            "-i",
            "-",
            "-fps_mode",
            "cfr",
            "-r",
            str(fps),
            "-c:v",
            "libx264",
            "-profile:v",
            "baseline",
            "-tune",
            "zerolatency",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-b:v",
            f"{bitrate_kbps}k",
            "-maxrate",
            f"{bitrate_kbps}k",
            "-bufsize",
            f"{bitrate_kbps * 2}k",
            # keyframe ทุก 2 วิพอดี ไม่ให้ x264 แทรกเองตอนภาพเปลี่ยน (ไฟล์ใหญ่ขึ้น และดูย้อนหลังตัดท่อนไม่ตรง)
            "-g",
            str(fps * 2),
            "-sc_threshold",
            "0",
            "-an",
            "-f",
            "rtsp",
            "-rtsp_transport",
            "tcp",
            url,
        ]
        try:
            self._proc = self._popen(
                cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
            )
        except FileNotFoundError:
            log.error("ไม่เจอ ffmpeg ติดตั้งก่อน: brew install ffmpeg")
            return False
        self._url = url
        self._broken = False
        self._tail.clear()
        self._stop.clear()
        threading.Thread(target=self._read_errors, args=(self._proc,), daemon=True).start()
        if self._feed:
            self._thread = threading.Thread(target=self._run, args=(fps,), daemon=True)
            self._thread.start()
        log.info("เริ่มส่งวิดีโอไป %s", _path_of(url))
        return True

    def push(self, frame) -> None:
        if not self.alive or self._size is None:
            return
        out = frame
        if (out.shape[1], out.shape[0]) != self._size:
            out = cv2.resize(out, self._size, interpolation=cv2.INTER_AREA)
        if self.mirror:
            out = cv2.flip(out, 1)
        # ภาพต้นฉบับใช้ร่วมกับการเช็คชื่อ/หาคน ห้ามเขียนทับ
        if out is frame:
            out = frame.copy()
        stamp(out, self._clock())
        try:
            self._proc.stdin.write(out.tobytes())
        except (BrokenPipeError, ValueError, OSError):
            self._broken = True

    def stop(self) -> None:
        proc = self._proc
        if proc is None:
            return
        self._stop.set()
        thread, self._thread = self._thread, None
        if thread is not None:
            thread.join(timeout=_JOIN_S)
            if thread.is_alive():
                # ffmpeg ไม่อ่าน stdin แล้ว thread ค้างใน write ต้องฆ่า process ก่อน ไม่งั้น close() จะค้างตาม
                proc.kill()
                thread.join(timeout=_JOIN_S)
        # close() รอ lock เดียวกับ write ถ้ายังค้างอยู่ก็ปล่อย thread ทิ้ง ไม่ให้ stop() ค้าง
        closer = threading.Thread(target=self._close_stdin, args=(proc,), daemon=True)
        closer.start()
        closer.join(timeout=_JOIN_S)
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        if proc.returncode not in (0, None) or self._broken:
            detail = " | ".join(self._tail) or f"รหัส {proc.returncode}"
            log.warning("วิดีโอไป %s หยุด: %s", _path_of(self._url), detail)
        else:
            log.info("หยุดส่งวิดีโอ %s", _path_of(self._url))
        self._proc = None

    @staticmethod
    def _close_stdin(proc: subprocess.Popen) -> None:
        try:
            proc.stdin.close()
        except (OSError, ValueError):
            pass

    def _run(self, fps: int) -> None:
        interval = 1 / fps
        next_at = time.monotonic()
        while not self._stop.is_set():
            frame = self.source()
            if frame is not None:
                self.push(frame)
            next_at += interval
            # ช้ากว่ากำหนดมาก (เครื่องค้าง) ไม่ต้องเร่งส่งชดเชย
            next_at = max(next_at, time.monotonic() - interval)
            self._stop.wait(max(0, next_at - time.monotonic()))

    def _read_errors(self, proc: subprocess.Popen) -> None:
        if proc.stderr is None:
            return
        for line in proc.stderr:
            text = line.decode(errors="replace") if isinstance(line, bytes) else str(line)
            self._tail.append(_hide(text.strip()))
