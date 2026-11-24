"""systemctl stop (SIGTERM) ต้องออกได้ภายในไม่กี่วิทุกสถานะ และออกด้วยรหัส 0

ของจริงที่เคยค้าง: rknnlite ครอบ inference ด้วย except: เปล่า SystemExit จาก SIGTERM ถูกกลืน
โปรแกรมทำงานต่อจน systemd ฆ่าทิ้งหลัง 90 วิ (failed, Result: timeout)
"""

import os
import signal
import subprocess
import threading
import time
from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from camera import board_main
from camera.api import BadToken, Session, Stream
from camera.board.scrfd import ANCHORS, STRIDES
from camera.rtsp import RtspCamera
from camera.stream import Streamer

RTSP = "rtsp://admin:pw@192.168.1.64:554/stream"
FRAME = np.zeros((64, 64, 3), np.uint8)
# output ของ SCRFD ที่ไม่มีหน้า (คะแนน 0 ทุกจุด) สำหรับภาพ 64x64
NO_FACES = [
    np.zeros(((64 // s) ** 2 * ANCHORS, k), np.float32) for s in STRIDES for k in (1, 4, 10)
]


@pytest.fixture(autouse=True)
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("CAMERA_TOKEN", "tok")
    monkeypatch.setenv("RTSP_URL", RTSP)
    monkeypatch.setenv("API_URL", "http://127.0.0.1:3001")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    monkeypatch.setattr(board_main, "STREAMER_STOP_SECONDS", 1)
    monkeypatch.setattr(board_main, "CAMERA_CLOSE_SECONDS", 0.2)
    monkeypatch.setattr(board_main, "RUNNER_CLOSE_SECONDS", 0.2)
    monkeypatch.setattr("camera.stream._JOIN_S", 0.05)
    monkeypatch.setattr("camera.loop.STREAM_RETRY_SECONDS", 0)
    saved = signal.getsignal(signal.SIGTERM), signal.getsignal(signal.SIGINT)
    yield
    signal.signal(signal.SIGTERM, saved[0])
    signal.signal(signal.SIGINT, saved[1])


def sigterm() -> None:
    os.kill(os.getpid(), signal.SIGTERM)


class SwallowingRunner:
    """เหมือน RknnRunner บนบอร์ด: SIGTERM มาระหว่าง inference แล้ว rknnlite กลืน SystemExit คืน None"""

    has_liveness = False
    det_size = (64, 64)

    def __init__(self, model_dir, *, ready=lambda: True, close_seconds=0.0, on_signal=None):
        self.ready = ready
        self.on_signal = on_signal or (lambda: None)
        self.close_seconds = close_seconds
        self.closes = 0
        self.detects = 0
        self.swallowed = False

    def detect(self, image):
        self.detects += 1
        if not self.ready():
            return NO_FACES
        try:
            self.on_signal()
            sigterm()
            time.sleep(0.05)  # handler รันตรงนี้ ยังอยู่ใน try
            return NO_FACES
        except:  # noqa: E722 เลียนแบบ rknn_lite.py ที่จับทุกอย่าง
            self.swallowed = True
            return None

    def close(self):
        self.closes += 1
        time.sleep(self.close_seconds)  # คืน NPU ช้า/ค้าง


class StuckCapture:
    """อ่านภาพได้จนกว่าจะ stuck แล้ว read() ค้าง เหมือน FFmpeg ที่ค้างตอนกล้องเงียบ"""

    def __init__(self):
        self.stuck = threading.Event()
        self.unblock = threading.Event()
        self.released = False

    def isOpened(self):
        return True

    def read(self):
        if not self.stuck.is_set():
            time.sleep(0.01)
            return True, FRAME.copy()
        self.unblock.wait(10)
        return False, None

    def release(self):
        self.released = True


class HungStdin:
    def __init__(self):
        self.unblock = threading.Event()

    def write(self, data):
        self.unblock.wait(10)
        raise BrokenPipeError

    def close(self):
        self.unblock.wait(10)


class HungFfmpeg:
    """ffmpeg ที่ไม่อ่าน stdin และไม่จบเองจนกว่าจะถูก kill"""

    def __init__(self, cmd):
        self.stdin = HungStdin()
        self.stderr = iter([])
        self.returncode = None
        self.killed = False
        self.terminated = False

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        if self.returncode is None:
            raise subprocess.TimeoutExpired("ffmpeg", timeout)
        return self.returncode

    def terminate(self):
        self.terminated = True

    def kill(self):
        self.killed = True
        self.returncode = -9
        self.stdin.unblock.set()


def session(stream: bool) -> Session:
    return Session(
        id="s1",
        course="TEST stop",
        ends_at=datetime.now(UTC) + timedelta(hours=1),
        fps=50,
        stream=Stream(url="rtsp://127.0.0.1:8554/cam/s1?token=t", fps=10, bitrate_kbps=800)
        if stream
        else None,
    )


class FakeApi:
    def __init__(self, current):
        self.current = current
        self.sent = 0

    def session(self):
        return self.current

    def send(self, payload):
        self.sent += 1
        return "queued"


def wire(monkeypatch, runner, capture=None, current=None, procs=None):
    api = FakeApi(current)
    monkeypatch.setattr(board_main, "RknnRunner", lambda model_dir: runner)
    monkeypatch.setattr(board_main, "BoardApi", lambda url, token: api)
    if capture is not None:
        monkeypatch.setattr(
            board_main, "RtspCamera", lambda url: RtspCamera(url, lambda *_: capture)
        )
    if procs is not None:

        def popen(cmd, **_):
            procs.append(HungFfmpeg(cmd))
            return procs[-1]

        monkeypatch.setattr(
            board_main, "Streamer", lambda **kwargs: Streamer(popen=popen, **kwargs)
        )
    return api


def timed_main() -> tuple[int, float]:
    began = time.monotonic()
    code = board_main.main()
    return code, time.monotonic() - began


def test_sigterm_swallowed_during_inference_still_exits_0(monkeypatch, caplog):
    capture = StuckCapture()
    runner = SwallowingRunner(None, on_signal=capture.stuck.set)
    wire(monkeypatch, runner, capture=capture, current=session(stream=False))
    try:
        code, took = timed_main()
    finally:
        capture.unblock.set()
    assert runner.swallowed  # ตรงกับที่เกิดบนบอร์ด
    assert code == 0
    assert took < 3
    assert runner.closes == 1
    assert "เกิดข้อผิดพลาด" not in caplog.text


def test_stop_while_streaming_with_stuck_reader_hung_ffmpeg_and_slow_npu(monkeypatch):
    procs: list[HungFfmpeg] = []
    capture = StuckCapture()
    # ส่ง SIGTERM เมื่อ ffmpeg เริ่มแล้วเท่านั้น
    runner = SwallowingRunner(
        None, ready=lambda: bool(procs), close_seconds=5, on_signal=capture.stuck.set
    )
    wire(monkeypatch, runner, capture=capture, current=session(stream=True), procs=procs)
    try:
        code, took = timed_main()
    finally:
        capture.unblock.set()
    assert code == 0
    # วิดีโอ ≤1 + กล้อง 0.2 + NPU 0.2 (ค่าที่ตั้งในเทส) ไม่รอ reader ที่ค้าง ไม่รอ NPU 5 วิ
    assert took < 3
    assert procs and procs[-1].killed
    assert runner.closes == 1


def test_sigterm_while_idle_sleeping_exits_0_fast(monkeypatch):
    runner = SwallowingRunner(None)
    wire(monkeypatch, runner, current=None)  # ไม่มีคาบ ลูปนอนรอ 30 วิ
    timer = threading.Timer(0.2, sigterm)
    timer.start()
    try:
        code, took = timed_main()
    finally:
        timer.cancel()
    assert code == 0
    assert took < 2
    assert runner.detects == 0
    assert runner.closes == 1


def test_sigterm_during_cleanup_does_not_cut_it_short(monkeypatch):
    class LoopThenStop:
        session = None
        sent = 0

        def __init__(self, *args):
            pass

        def tick(self):
            raise BadToken("token ไม่ถูกต้อง")

    class SignalOnClose(SwallowingRunner):
        def close(self):
            sigterm()  # SIGTERM ระหว่างปิดต้องไม่โยน SystemExit ตัดการปิด
            time.sleep(0.01)
            super().close()

    runner = SignalOnClose(None)
    wire(monkeypatch, runner)
    monkeypatch.setattr(board_main, "CameraLoop", LoopThenStop)
    code, _ = timed_main()
    assert code == board_main.EXIT_CONFIG
    assert runner.closes == 1


def test_bad_token_after_swallowed_stop_exits_0_not_78(monkeypatch):
    class SwallowThenBadToken:
        session = None
        sent = 0

        def __init__(self, *args):
            pass

        def tick(self):
            try:
                sigterm()
                time.sleep(0.05)
            except:  # noqa: E722, S110 rknnlite กลืนแล้วไปต่อ
                pass
            raise BadToken("token ไม่ถูกต้อง")

    wire(monkeypatch, SwallowingRunner(None))
    monkeypatch.setattr(board_main, "CameraLoop", SwallowThenBadToken)
    code, _ = timed_main()
    assert code == 0


def test_bounded_gives_up_on_stuck_step(caplog):
    gate = threading.Event()
    began = time.monotonic()
    board_main.bounded(board_main.logging.getLogger("camera"), "ค้าง", lambda: gate.wait(5), 0.1)
    assert time.monotonic() - began < 1
    assert "ค้าง ไม่เสร็จ" in caplog.text
    gate.set()
