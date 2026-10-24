from datetime import UTC, datetime, timedelta

import pytest

from camera.api import ApiDown, BadToken, Session, Stream
from camera.loop import POLL_SECONDS, RETRY_SECONDS, STREAM_RETRY_SECONDS, CameraLoop

START = datetime(2026, 10, 23, 5, 0, tzinfo=UTC)


STREAM = Stream(url="rtsp://media:8554/cam/c1?token=tok", fps=15, bitrate_kbps=1500)


def session(minutes: int = 180, fps: float = 1.0, stream: Stream | None = None) -> Session:
    return Session(
        id="s1",
        course="EXAMPLE101 test",
        ends_at=START + timedelta(minutes=minutes),
        fps=fps,
        stream=stream,
    )


class FakeApi:
    def __init__(self):
        self.current: Session | None = None
        self.down = False
        self.send_result = "queued"
        self.polls = 0
        self.sent: list[bytes] = []

    def session(self):
        self.polls += 1
        if self.down:
            raise ApiDown("ต่อไม่ได้")
        return self.current

    def send(self, frame: bytes) -> str:
        if self.down:
            raise ApiDown("ต่อไม่ได้")
        self.sent.append(frame)
        return self.send_result


class FakeCamera:
    def __init__(self):
        self.fail_open = False
        self.opened = 0
        self.closed = 0
        self.is_open = False

    def open(self):
        if self.fail_open:
            raise RuntimeError("เปิดกล้องหมายเลข 0 ไม่ได้")
        self.opened += 1
        self.is_open = True

    def read(self):
        return b"jpeg" if self.is_open else None

    def close(self):
        if self.is_open:
            self.closed += 1
        self.is_open = False


class Clock:
    def __init__(self):
        self.now = START

    def __call__(self):
        return self.now

    def advance(self, seconds: float):
        self.now += timedelta(seconds=seconds)


class FakeStreamer:
    def __init__(self):
        self.ok = True
        self.started: list[str] = []
        self.stopped = 0
        self.alive = False
        self.running = False

    def start(self, url: str, fps: int, bitrate_kbps: int) -> bool:
        if not self.ok:
            return False
        self.started.append(url)
        self.alive = self.running = True
        return True

    def stop(self):
        if self.running:
            self.stopped += 1
        self.alive = self.running = False


@pytest.fixture
def setup():
    api, cam, clock = FakeApi(), FakeCamera(), Clock()
    return api, cam, clock, CameraLoop(api, cam, clock)


@pytest.fixture
def streaming():
    api, cam, clock, streamer = FakeApi(), FakeCamera(), Clock(), FakeStreamer()
    return api, cam, clock, streamer, CameraLoop(api, cam, clock, streamer)


def test_no_session_polls_every_30s_without_camera(setup):
    api, cam, clock, loop = setup
    assert loop.tick() == POLL_SECONDS
    assert cam.opened == 0
    clock.advance(10)
    assert loop.tick() == pytest.approx(POLL_SECONDS - 10)
    assert api.polls == 1


def test_live_session_sends_at_fps_and_repolls(setup):
    api, cam, clock, loop = setup
    api.current = session(fps=2)
    assert loop.tick() == 0.5
    assert cam.opened == 1
    assert api.sent == [b"jpeg"]

    clock.advance(0.5)
    loop.tick()
    assert api.polls == 1
    clock.advance(POLL_SECONDS)
    loop.tick()
    assert api.polls == 2
    assert cam.opened == 1


def test_stops_at_session_end(setup):
    api, cam, clock, loop = setup
    api.current = session(minutes=1)
    loop.tick()
    clock.advance(60)
    api.current = None
    sent = len(api.sent)
    loop.tick()
    assert cam.closed == 1
    assert len(api.sent) == sent


def test_busy_skips_frame_and_keeps_going(setup):
    api, cam, _clock, loop = setup
    api.current = session()
    api.send_result = "busy"
    assert loop.tick() == 1.0
    assert cam.is_open


def test_no_live_session_from_api_closes_camera(setup):
    api, cam, _clock, loop = setup
    api.current = session()
    api.send_result = "no_session"
    loop.tick()
    assert cam.closed == 1


def test_api_down_waits_and_retries(setup):
    api, _cam, clock, loop = setup
    api.down = True
    assert loop.tick() == RETRY_SECONDS
    api.down = False
    api.current = session()
    clock.advance(RETRY_SECONDS)
    assert loop.tick() == 1.0
    assert api.sent == [b"jpeg"]


def test_bad_token_stops(setup):
    api, _cam, _clock, loop = setup

    def bad():
        raise BadToken("token กล้องไม่ถูกต้อง")

    api.session = bad
    with pytest.raises(BadToken):
        loop.tick()


def test_send_time_counts_toward_interval(setup):
    api, _cam, clock, loop = setup
    api.current = session()
    original = api.send

    def slow(frame):
        clock.advance(0.4)
        return original(frame)

    api.send = slow
    assert loop.tick() == pytest.approx(0.6)


def test_camera_open_failure_retries_instead_of_crashing(setup):
    api, cam, clock, loop = setup
    api.current = session()
    cam.fail_open = True
    assert loop.tick() == RETRY_SECONDS
    assert api.sent == []
    assert loop.session is None

    cam.fail_open = False
    clock.advance(RETRY_SECONDS)
    assert loop.tick() == 1.0
    assert cam.opened == 1
    assert api.sent == [b"jpeg"]


def test_stream_starts_with_session_and_stops_at_end(streaming):
    api, cam, clock, streamer, loop = streaming
    api.current = session(minutes=1, stream=STREAM)
    loop.tick()
    assert streamer.started == [STREAM.url]
    clock.advance(60)
    api.current = None
    loop.tick()
    assert streamer.stopped == 1
    assert cam.closed == 1


def test_stream_restarts_after_ffmpeg_dies_and_frames_keep_going(streaming):
    api, _cam, clock, streamer, loop = streaming
    api.current = session(stream=STREAM)
    loop.tick()
    streamer.alive = False
    sent = len(api.sent)
    clock.advance(1)
    loop.tick()
    assert len(api.sent) == sent + 1
    clock.advance(STREAM_RETRY_SECONDS)
    loop.tick()
    assert streamer.started == [STREAM.url, STREAM.url]


def test_stream_start_failure_retries_later(streaming):
    api, _cam, clock, streamer, loop = streaming
    streamer.ok = False
    api.current = session(stream=STREAM)
    loop.tick()
    streamer.ok = True
    clock.advance(1)
    loop.tick()
    assert streamer.started == []
    clock.advance(STREAM_RETRY_SECONDS)
    loop.tick()
    assert streamer.started == [STREAM.url]


def test_no_stream_info_never_starts(streaming):
    api, _cam, _clock, streamer, loop = streaming
    api.current = session()
    loop.tick()
    assert streamer.started == []
