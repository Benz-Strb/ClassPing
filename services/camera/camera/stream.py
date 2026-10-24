import logging
import re
import subprocess
import threading
import time
from collections import deque
from collections.abc import Callable

import cv2

log = logging.getLogger("camera")

_TOKEN = re.compile(r"token=[^&\s]+")


def _hide(text: str) -> str:
    return _TOKEN.sub("token=***", text)


def _path_of(url: str) -> str:
    return _hide(url.split("?", 1)[0])


class Streamer:
    """ส่งภาพจากกล้องเข้า ffmpeg เข้ารหัส H.264 แล้ว publish RTSP ให้ media server

    ไม่บันทึกอะไรลงดิสก์ในเครื่องนี้ (media server เป็นคนอัด) ไม่มีเสียง
    """

    def __init__(
        self,
        source: Callable[[], object],
        max_width: int,
        popen: Callable[..., subprocess.Popen] = subprocess.Popen,
        feed: bool = True,
    ):
        self.source = source
        self.max_width = max_width
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
            "-g",
            str(fps * 2),
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
        if (frame.shape[1], frame.shape[0]) != self._size:
            frame = cv2.resize(frame, self._size, interpolation=cv2.INTER_AREA)
        try:
            self._proc.stdin.write(frame.tobytes())
        except (BrokenPipeError, ValueError, OSError):
            self._broken = True

    def stop(self) -> None:
        proc = self._proc
        if proc is None:
            return
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
            self._thread = None
        try:
            proc.stdin.close()
        except OSError:
            pass
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
