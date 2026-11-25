import logging
import threading
import time
from datetime import UTC, datetime

import numpy as np
import pytest

from camera.rtsp import FAILS_BEFORE_RECONNECT, AnalyzingCamera, RtspCamera, mask_url

URL = "rtsp://admin:s3cret@192.168.1.10:554/stream1"
FRAME = np.zeros((4, 4, 3), np.uint8)


class FakeCapture:
    """read() คืนค่าตามลำดับใน script (None = อ่านไม่ได้) หมดแล้วอ่านไม่ได้ต่อ"""

    def __init__(self, script, opened=True):
        self.script = list(script)
        self.opened = opened
        self.released = False

    def isOpened(self):
        return self.opened

    def read(self):
        frame = self.script.pop(0) if self.script else None
        return (frame is not None), frame

    def release(self):
        self.released = True


def factory_of(*captures):
    made = []
    queue = list(captures)

    def factory(url, backend):
        made.append(url)
        return queue.pop(0)

    factory.made = made
    return factory


def test_rtsp_reads_latest_frame():
    newer = FRAME + 1
    cam = RtspCamera(URL, factory_of(FakeCapture([FRAME, newer])))
    assert cam._connect()
    cam._step()
    cam._step()
    assert cam.latest_raw() is newer
    assert cam.latest_raw() is newer  # latest_raw ไม่ล้างภาพ
    assert cam.read_frame() is newer
    assert cam.read_frame() is None


def test_rtsp_reconnects_after_failures():
    first = FakeCapture([FRAME])
    second = FakeCapture([FRAME + 2])
    factory = factory_of(first, second)
    cam = RtspCamera(URL, factory)
    cam._connect()
    cam._step()
    assert cam.read_frame() is not None
    for _ in range(FAILS_BEFORE_RECONNECT):
        assert cam.read_frame() is None
        cam._step()
    assert first.released
    assert cam.read_frame() is None
    cam._step()  # ต่อใหม่
    assert len(factory.made) == 2
    cam._step()
    assert cam.read_frame() is not None


def test_rtsp_open_does_not_raise_when_connect_fails():
    cam = RtspCamera(URL, factory_of(FakeCapture([], opened=False)))
    cam.open()
    cam.close()
    assert cam.read_frame() is None


def test_rtsp_url_password_not_logged(caplog):
    caplog.set_level(logging.DEBUG, logger="camera")
    cam = RtspCamera(URL, factory_of(FakeCapture([], opened=False), FakeCapture([])))
    cam._connect()
    cam._connect()
    for _ in range(FAILS_BEFORE_RECONNECT):
        cam._step()
    assert caplog.records
    assert "s3cret" not in caplog.text
    assert "admin:***@192.168.1.10" in caplog.text


def test_mask_url():
    assert mask_url(URL) == "rtsp://admin:***@192.168.1.10:554/stream1"
    assert mask_url("rtsp://192.168.1.10/s") == "rtsp://192.168.1.10/s"


@pytest.mark.parametrize(
    "password", ["p@ss", "pa/ss", "pa:ss", "p%40ss", "a@b/c:d@e", "p@ss/word@x"]
)
def test_mask_url_hides_tricky_passwords(password):
    masked = mask_url(f"rtsp://admin:{password}@10.0.0.5:554/stream1")
    assert masked == "rtsp://admin:***@10.0.0.5:554/stream1"


def test_mask_url_unparseable_gives_placeholder():
    assert mask_url("not a url with secret") == "rtsp://***"


class ReleaseRaises(FakeCapture):
    def release(self):
        super().release()
        raise RuntimeError("release พัง")


def test_rtsp_release_error_does_not_kill_reader():
    first = ReleaseRaises([])
    second = FakeCapture([FRAME])
    cam = RtspCamera(URL, factory_of(first, second))
    cam._connect()
    for _ in range(FAILS_BEFORE_RECONNECT):
        cam._step()
    assert first.released
    cam._step()
    cam._step()
    assert cam.read_frame() is not None


def test_rtsp_close_returns_promptly_while_disconnected():
    def refuse(url, backend):
        return FakeCapture([], opened=False)

    cam = RtspCamera(URL, refuse)
    cam.open()
    time.sleep(0.2)  # thread เข้าช่วงรอ 5 วิ
    started = time.monotonic()
    cam.close()
    assert time.monotonic() - started < 1
    assert cam._thread is None


def test_rtsp_close_then_open_leaves_one_reader():
    def refuse(url, backend):
        return FakeCapture([], opened=False)

    cam = RtspCamera(URL, refuse)
    before = threading.active_count()
    cam.open()
    time.sleep(0.2)
    cam.close()
    cam.open()
    cam.open()  # เปิดซ้ำต้องไม่เพิ่ม thread
    time.sleep(0.2)
    assert threading.active_count() == before + 1
    cam.close()
    assert threading.active_count() == before


class BlockingCapture(FakeCapture):
    """read() ค้างจนกว่าจะปลดล็อก เหมือน FFmpeg ที่ค้างตอนกล้องเงียบ"""

    def __init__(self, frame):
        super().__init__([])
        self.entered = threading.Event()
        self.unblock = threading.Event()
        self.frame = frame

    def read(self):
        self.entered.set()
        self.unblock.wait(5)
        return True, self.frame


def test_rtsp_reopen_after_stuck_close_gets_fresh_reader(monkeypatch):
    monkeypatch.setattr("camera.rtsp.CLOSE_JOIN_SECONDS", 0.1)
    stale = FRAME + 7
    fresh = FRAME + 3
    stuck = BlockingCapture(stale)
    working = FakeCapture([fresh] * 1000)
    cam = RtspCamera(URL, factory_of(stuck, working))
    cam.open()
    assert stuck.entered.wait(1)
    cam.close()  # join หมดเวลา thread เก่ายังค้าง read()
    cam.open()
    deadline = time.monotonic() + 2
    frame = None
    while frame is None and time.monotonic() < deadline:
        frame = cam.read_frame()
        time.sleep(0.01)
    assert frame is fresh
    stuck.unblock.set()  # thread เก่าอ่านเสร็จ ต้องไม่เอาภาพเก่ามาทับ และต้องปิดกล้องตัวเอง
    deadline = time.monotonic() + 2
    while not stuck.released and time.monotonic() < deadline:
        time.sleep(0.01)
    assert stuck.released
    assert not working.released
    for _ in range(20):
        assert cam.latest_raw() is not stale
        time.sleep(0.01)
    cam.close()
    assert working.released


def test_rtsp_double_close_leaves_stuck_capture_to_its_thread(monkeypatch):
    monkeypatch.setattr("camera.rtsp.CLOSE_JOIN_SECONDS", 0.1)
    stuck = BlockingCapture(FRAME)
    cam = RtspCamera(URL, factory_of(stuck))
    cam.open()
    assert stuck.entered.wait(1)
    cam.close()  # join หมดเวลา
    cam.close()  # ปิดซ้ำก่อน open ต้องไม่ปิดกล้องที่ thread ยังค้าง read() อยู่
    assert not stuck.released
    stuck.unblock.set()  # อ่านเสร็จแล้ว thread ปิดกล้องของตัวเอง
    deadline = time.monotonic() + 2
    while not stuck.released and time.monotonic() < deadline:
        time.sleep(0.01)
    assert stuck.released


def test_rtsp_close_without_thread_releases_capture():
    cap = FakeCapture([FRAME])
    cam = RtspCamera(URL, factory_of(cap))
    assert cam._connect()
    cam.close()
    assert cap.released


class FakeAnalyzer:
    def analyze(self, frame):
        return {"width": 4, "height": 4, "skippedSmall": 0, "faces": []}


def test_analyzing_camera_adds_captured_at():
    cam = RtspCamera(URL, factory_of(FakeCapture([FRAME])))
    cam._connect()
    analyzing = AnalyzingCamera(
        cam, FakeAnalyzer(), lambda: datetime(2026, 11, 20, 5, 0, tzinfo=UTC)
    )
    assert analyzing.read() is None
    cam._step()
    result = analyzing.read()
    assert result["capturedAt"].startswith("2026-11-20T")
    assert result["capturedAt"][-6] in "+-"
    assert result["faces"] == []
    assert analyzing.read() is None


def test_rtsp_read_frame_consumes_but_latest_raw_keeps_frame():
    cam = RtspCamera(URL, factory_of(FakeCapture([FRAME])))
    cam._connect()
    assert cam.read_frame() is None  # ยังไม่มีภาพ
    cam._step()
    assert cam.read_frame() is FRAME
    assert cam.latest_raw() is FRAME
    assert cam.read_frame() is None  # ภาพเดิมไม่คืนซ้ำ


def test_rtsp_read_frame_none_until_new_frame_arrives():
    newer = FRAME + 1
    cam = RtspCamera(URL, factory_of(FakeCapture([FRAME, newer])))
    cam._connect()
    cam._step()
    assert cam.read_frame() is FRAME
    assert cam.read_frame() is None
    cam._step()
    assert cam.read_frame() is newer
    assert cam.latest_raw() is newer


def test_rtsp_latest_raw_is_none_after_close_and_reopen():
    cam = RtspCamera(URL, factory_of(FakeCapture([FRAME]), FakeCapture([])))
    cam._connect()
    cam._step()
    assert cam.latest_raw() is FRAME
    cam.close()
    assert cam.latest_raw() is None
    assert cam.read_frame() is None


def test_rtsp_open_clears_stale_frame(monkeypatch):
    cam = RtspCamera(URL, factory_of(FakeCapture([FRAME]), FakeCapture([])))
    cam._connect()
    cam._step()
    monkeypatch.setattr(cam, "_connect", lambda reader=None: False)
    cam.open()
    try:
        assert cam.latest_raw() is None
        assert cam.read_frame() is None
    finally:
        cam.close()


def test_rtsp_stopped_reader_cannot_touch_new_frame():
    cam = RtspCamera(URL, factory_of(FakeCapture([FRAME])))
    old = cam._reader
    old.stop.set()
    cam._publish(old, FRAME)
    assert cam.latest_raw() is None
    assert cam.read_frame() is None


def test_stream_starts_even_when_analysis_consumes_every_frame():
    """วิเคราะห์ทุกรอบกินภาพทันที (wait 0) รอบลองเริ่มวิดีโอเจอภาพที่เพิ่งถูกอ่านไป ต้องยังเริ่มได้"""
    from datetime import timedelta

    from camera.api import Session, Stream
    from camera.loop import CameraLoop
    from camera.stream import Streamer
    from tests.test_stream import FakeProc

    class Api:
        def session(self):
            return Session(
                id="s1",
                course="X",
                ends_at=datetime(2026, 11, 20, 8, 0, tzinfo=UTC),
                fps=1.0,
                stream=Stream(url="rtsp://m/cam?token=t", fps=15, bitrate_kbps=1500),
            )

        def send(self, frame):
            return "queued"

    clock = [datetime(2026, 11, 20, 5, 0, tzinfo=UTC)]
    cam = RtspCamera(URL, factory_of(FakeCapture([FRAME + i for i in range(1, 20)])))
    cam._connect()
    analyzing = AnalyzingCamera(cam, FakeAnalyzer(), lambda: clock[0])
    analyzing.open = lambda: None  # ขับ reader ด้วย _step เอง ไม่เปิด thread จริง
    streamer = Streamer(
        cam.latest_raw, max_width=640, popen=lambda cmd, **_: FakeProc(cmd), feed=False
    )
    loop = CameraLoop(Api(), analyzing, lambda: clock[0], streamer)

    loop.tick()  # ยังไม่มีภาพ เริ่มวิดีโอไม่ได้ ลองใหม่อีก 5 วิ
    assert not streamer.running
    for _ in range(1, 5):
        clock[0] += timedelta(seconds=1)
        cam._step()
        loop.tick()  # วิเคราะห์ภาพที่เพิ่งมา
    clock[0] += timedelta(seconds=1)
    loop.tick()  # ถึงรอบลอง ภาพล่าสุดถูกวิเคราะห์ไปแล้ว ภาพถัดไปยังไม่มา
    assert streamer.running
    streamer.stop()
