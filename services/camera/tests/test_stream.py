import logging
import subprocess
import threading
import time

import numpy as np

from camera.stream import Streamer

URL = "rtsp://media.test:8554/cam/c1?token=secret123"


class FakeStdin:
    def __init__(self):
        self.chunks: list[int] = []
        self.broken = False
        self.closed = False

    def write(self, data: bytes):
        if self.broken:
            raise BrokenPipeError
        self.chunks.append(len(data))

    def flush(self):
        pass

    def close(self):
        self.closed = True


class FakeProc:
    def __init__(self, cmd):
        self.cmd = cmd
        self.stdin = FakeStdin()
        self.stderr = iter([b"Connection refused token=secret123\n"])
        self.returncode = None
        self.killed = False

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        if self.returncode is None:
            self.returncode = 0
        return self.returncode

    def kill(self):
        self.killed = True
        self.returncode = -9


def frame(width=1920, height=1080):
    return np.zeros((height, width, 3), dtype=np.uint8)


def make(source=frame, **kwargs):
    procs: list[FakeProc] = []

    def popen(cmd, **_):
        proc = FakeProc(cmd)
        procs.append(proc)
        return proc

    return Streamer(source=source, max_width=1280, popen=popen, feed=False, **kwargs), procs


def test_command_is_h264_baseline_without_audio():
    streamer, procs = make()
    assert streamer.start(URL, fps=15, bitrate_kbps=1500)
    cmd = procs[0].cmd
    joined = " ".join(cmd)
    assert cmd[0] == "ffmpeg"
    assert "-f rawvideo -pix_fmt bgr24 -s 1280x720 -use_wallclock_as_timestamps 1 -i -" in joined
    assert "-fps_mode cfr -r 15" in joined
    assert "-c:v libx264 -profile:v baseline -tune zerolatency" in joined
    assert "-pix_fmt yuv420p" in joined
    assert "-b:v 1500k" in joined
    assert "-g 30 -sc_threshold 0" in joined
    assert "-an" in cmd
    assert "-f rtsp -rtsp_transport tcp" in joined
    assert cmd[-1] == URL


def test_push_writes_resized_frame():
    streamer, procs = make()
    streamer.start(URL, fps=15, bitrate_kbps=1500)
    streamer.push(frame())
    assert procs[0].stdin.chunks == [1280 * 720 * 3]


def test_size_keeps_aspect_and_is_even():
    streamer, procs = make(source=lambda: frame(1000, 563))
    streamer.start(URL, fps=15, bitrate_kbps=1500)
    assert "-s 1000x562" in " ".join(procs[0].cmd)


def test_no_frame_yet_does_not_start():
    streamer, procs = make(source=lambda: None)
    assert not streamer.start(URL, fps=15, bitrate_kbps=1500)
    assert procs == []
    assert not streamer.alive


def test_dead_ffmpeg_is_not_alive_and_push_does_not_raise():
    streamer, procs = make()
    streamer.start(URL, fps=15, bitrate_kbps=1500)
    assert streamer.alive
    procs[0].stdin.broken = True
    streamer.push(frame())
    assert not streamer.alive

    streamer2, procs2 = make()
    streamer2.start(URL, fps=15, bitrate_kbps=1500)
    procs2[0].returncode = 1
    assert not streamer2.alive


def test_logs_never_show_token(caplog):
    caplog.set_level(logging.INFO, logger="camera")
    streamer, procs = make()
    streamer.start(URL, fps=15, bitrate_kbps=1500)
    procs[0].returncode = 1
    time.sleep(0.05)
    streamer.stop()
    assert "secret123" not in caplog.text
    assert "cam/c1" in caplog.text


def test_missing_ffmpeg_returns_false(caplog):
    def popen(cmd, **_):
        raise FileNotFoundError("ffmpeg")

    streamer = Streamer(source=frame, max_width=1280, popen=popen, feed=False)
    assert not streamer.start(URL, fps=15, bitrate_kbps=1500)
    assert "brew install ffmpeg" in caplog.text


def test_stop_closes_stdin_and_waits():
    streamer, procs = make()
    streamer.start(URL, fps=15, bitrate_kbps=1500)
    streamer.stop()
    assert procs[0].stdin.closed
    assert procs[0].returncode is not None
    assert not streamer.running


def test_feeder_thread_sends_frames_at_fps():
    procs: list[FakeProc] = []

    def popen(cmd, **_):
        proc = FakeProc(cmd)
        procs.append(proc)
        return proc

    streamer = Streamer(source=frame, max_width=1280, popen=popen)
    streamer.start(URL, fps=20, bitrate_kbps=1500)
    time.sleep(0.3)
    streamer.stop()
    assert 3 <= len(procs[0].stdin.chunks) <= 8


def test_stop_kills_ffmpeg_that_stopped_reading(monkeypatch):
    monkeypatch.setattr("camera.stream._JOIN_S", 0.2)
    release = threading.Event()

    class HungStdin(FakeStdin):
        def write(self, data: bytes):
            release.wait(10)
            raise BrokenPipeError

        def close(self):
            release.wait(10)

    class HungProc(FakeProc):
        def __init__(self, cmd):
            super().__init__(cmd)
            self.stdin = HungStdin()

        def wait(self, timeout=None):
            if not self.killed:
                raise subprocess.TimeoutExpired("ffmpeg", timeout)
            return self.returncode

        def kill(self):
            super().kill()
            release.set()

    procs: list[HungProc] = []

    def popen(cmd, **_):
        procs.append(HungProc(cmd))
        return procs[0]

    streamer = Streamer(source=frame, max_width=1280, popen=popen)
    streamer.start(URL, fps=20, bitrate_kbps=1500)
    time.sleep(0.1)
    began = time.monotonic()
    streamer.stop()
    assert time.monotonic() - began < 2
    assert procs[0].killed
    assert not streamer.running


class KeepStdin(FakeStdin):
    def __init__(self):
        super().__init__()
        self.data: list[bytes] = []

    def write(self, data: bytes):
        super().write(data)
        self.data.append(data)


def _pushed(streamer, procs, image):
    procs[0].stdin = KeepStdin()
    streamer.push(image)
    width, height = streamer._size
    return np.frombuffer(procs[0].stdin.data[0], np.uint8).reshape(height, width, 3)


def test_push_stamps_time_without_touching_the_shared_frame():
    from datetime import datetime

    at = datetime(2026, 11, 11, 16, 2, 53)
    streamer, procs = make(source=lambda: frame(1280, 720), clock=lambda: at)
    streamer.start(URL, fps=15, bitrate_kbps=1500)
    image = frame(1280, 720)
    out = _pushed(streamer, procs, image)
    assert not image.any()
    # ตัวหนังสือสีขาวอยู่มุมซ้ายบน ส่วนอื่นยังดำ
    assert out[:60, :500].max() == 255
    assert not out[100:].any()


def test_mirror_flips_picture_but_not_the_time():
    image = frame(1280, 720)
    image[300:400, :100] = 200  # แถบทางซ้าย
    plain, plain_procs = make(source=lambda: image)
    plain.start(URL, fps=15, bitrate_kbps=1500)
    flipped, flipped_procs = make(source=lambda: image, mirror=True)
    flipped.start(URL, fps=15, bitrate_kbps=1500)
    a = _pushed(plain, plain_procs, image)
    b = _pushed(flipped, flipped_procs, image)
    assert b[350, -50].tolist() == [200, 200, 200] and not b[350, 50].any()
    assert a[350, 50].tolist() == [200, 200, 200]
    # เวลาเขียนหลังกลับภาพ อยู่ซ้ายบนเหมือนกัน
    assert b[:60, :500].max() == 255 and not b[:60, -400:].any()
