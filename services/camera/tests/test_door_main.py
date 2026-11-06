import logging
import time
from datetime import UTC, datetime, timedelta

import pytest

from camera.api import ApiDown, BadToken, Session
from camera.door import Crossing
from camera.door_main import (
    FPS_LOG_SECONDS,
    RETRY_WAIT_SECONDS,
    DoorLoop,
    DoorSender,
    SessionPoller,
    parse_quad,
)
from camera.loop import RETRY_SECONDS

START = datetime(2026, 10, 23, 5, 0, tzinfo=UTC)


def session(minutes: int = 60) -> Session:
    return Session(
        id="s1", course="EXAMPLE101 test", ends_at=START + timedelta(minutes=minutes), fps=1
    )


class Clock:
    def __init__(self):
        self.now = START

    def __call__(self):
        return self.now

    def advance(self, seconds: float):
        self.now += timedelta(seconds=seconds)


class FakeApi:
    def __init__(self):
        self.current: Session | None = None
        self.down = False
        self.bad_token = False
        self.polls = 0

    def session(self):
        self.polls += 1
        if self.bad_token:
            raise BadToken("x")
        if self.down:
            raise ApiDown("ต่อไม่ได้")
        return self.current


class FakePoller:
    bad_token = False

    def __init__(self):
        self.current: Session | None = None

    def latest(self):
        return self.current


class FakeCamera:
    def __init__(self):
        self.opened = 0
        self.closed = 0
        self.frame = None

    def open(self):
        self.opened += 1

    def latest_raw(self):
        return self.frame

    def close(self):
        self.closed += 1


class FakeCounter:
    def __init__(self):
        self.fed = []
        self.result: list[Crossing] = []
        self.resets = 0

    def feed(self, frame):
        self.fed.append(frame)
        result, self.result = self.result, []
        return result

    def reset(self):
        self.resets += 1


class FakeSender:
    bad_token = False

    def __init__(self):
        self.submitted: list[Crossing] = []

    def submit(self, crossing):
        self.submitted.append(crossing)


def make(poller=None):
    clock, camera, counter, sender = Clock(), FakeCamera(), FakeCounter(), FakeSender()
    poller = poller or FakePoller()
    loop = DoorLoop(poller, camera, counter, sender, clock)
    return loop, clock, poller, camera, counter, sender


def test_opens_camera_with_session_and_closes_when_session_gone():
    loop, _, poller, camera, counter, _ = make()
    loop.tick()
    assert camera.opened == 0
    poller.current = session()
    loop.tick()
    assert camera.opened == 1
    loop.tick()
    assert camera.opened == 1
    poller.current = None
    loop.tick()
    assert (camera.closed, counter.resets) == (1, 1)


def test_camera_closes_at_ends_at_even_if_polling_fails():
    api = FakeApi()
    api.current = session(minutes=1)
    poller = SessionPoller(api)
    poller.poll_once()
    loop, clock, _, camera, counter, _ = make(poller)
    loop.tick()
    assert camera.opened == 1
    api.down = True
    poller.poll_once()
    clock.advance(61)
    loop.tick()
    assert (camera.closed, counter.resets) == (1, 1)
    loop.tick()
    assert camera.opened == 1  # ไม่เปิดซ้ำจากคาบที่หมดแล้ว


def test_keeps_counting_during_poll_outage_and_tick_never_polls():
    api = FakeApi()
    api.current = session()
    poller = SessionPoller(api)
    poller.poll_once()
    loop, _, _, camera, counter, _ = make(poller)
    api.down = True
    poller.poll_once()
    polls = api.polls
    camera.frame = object()
    loop.tick()
    camera.frame = object()
    loop.tick()
    assert len(counter.fed) == 2
    assert api.polls == polls


def test_feeds_each_new_frame_once_and_submits_crossings():
    loop, _, poller, camera, counter, sender = make()
    poller.current = session()
    loop.tick()
    assert counter.fed == []
    camera.frame = object()
    counter.result = [Crossing("out", [b"x"])]
    loop.tick()
    loop.tick()  # ภาพเดิม ไม่ประมวลผลซ้ำ
    assert counter.fed == [camera.frame]
    assert [c.direction for c in sender.submitted] == ["out"]


def test_on_frame_called_after_feed():
    seen = []
    loop, _, poller, camera, _, _ = make()
    loop.on_frame = seen.append
    poller.current = session()
    camera.frame = object()
    loop.tick()
    assert seen == [camera.frame]


def test_bad_token_from_sender_or_poller_stops_the_loop():
    loop, _, poller, _, _, sender = make()
    poller.current = session()
    sender.bad_token = True
    with pytest.raises(BadToken):
        loop.tick()
    sender.bad_token = False
    poller.bad_token = True
    with pytest.raises(BadToken):
        loop.tick()


def test_camera_open_failure_retries_later():
    loop, clock, poller, camera, _, _ = make()
    real_open = camera.open

    def broken():
        raise RuntimeError("เปิดกล้องไม่ได้")

    camera.open = broken
    poller.current = session()
    assert loop.tick() == RETRY_SECONDS
    assert loop.session is None
    camera.open = real_open
    loop.tick()
    assert camera.opened == 0  # ยังไม่ถึงเวลาลองใหม่
    clock.advance(RETRY_SECONDS)
    loop.tick()
    assert camera.opened == 1


def test_logs_processed_fps_every_30_seconds(caplog):
    loop, clock, poller, camera, _, _ = make()
    poller.current = session()
    loop.tick()
    with caplog.at_level(logging.INFO, logger="camera"):
        for _ in range(10):
            camera.frame = object()
            loop.tick()
        assert "ภาพ/วินาที" not in caplog.text
        clock.advance(FPS_LOG_SECONDS)
        camera.frame = object()
        loop.tick()
    assert "ภาพ/วินาที" in caplog.text


def test_poller_keeps_last_session_when_api_is_down_and_flags_bad_token():
    api = FakeApi()
    api.current = session()
    poller = SessionPoller(api)
    assert poller.latest() is None
    poller.poll_once()
    assert poller.latest() == api.current
    api.down = True
    poller.poll_once()
    assert poller.latest() == api.current
    api.down = False
    api.current = None
    poller.poll_once()
    assert poller.latest() is None
    api.bad_token = True
    poller.poll_once()
    assert poller.bad_token


def test_poller_thread_polls_and_stops_cleanly():
    api = FakeApi()
    poller = SessionPoller(api)
    poller.start()
    for _ in range(100):
        if api.polls:
            break
        time.sleep(0.01)
    poller.stop()
    assert api.polls >= 1
    assert not poller._thread.is_alive()


class DoorApi:
    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def door(self, direction, images):
        self.calls.append((direction, images))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def test_sender_409_is_not_an_error():
    api = DoorApi(None)
    DoorSender(api, sleep=lambda s: None).send(Crossing("out", [b"a"]))
    assert api.calls == [("out", [b"a"])]


def test_sender_retries_once_after_2_seconds_then_gives_up():
    waits = []
    api = DoorApi(ApiDown("ล่ม"), ApiDown("ล่ม"))
    DoorSender(api, sleep=waits.append).send(Crossing("in", []))
    assert len(api.calls) == 2
    assert waits == [RETRY_WAIT_SECONDS] == [2]


def test_sender_retry_succeeds():
    api = DoorApi(ApiDown("ล่ม"), "matched")
    DoorSender(api, sleep=lambda s: None).send(Crossing("out", []))
    assert len(api.calls) == 2


def test_sender_bad_token_sets_flag():
    sender = DoorSender(DoorApi(BadToken("x")), sleep=lambda s: None)
    sender.send(Crossing("out", []))
    assert sender.bad_token


def test_threaded_sender_sends_queued_crossings():
    api = DoorApi("matched")
    sender = DoorSender(api, sleep=lambda s: None)
    sender.start()
    sender.submit(Crossing("out", [b"a"]))
    sender.stop()
    assert api.calls == [("out", [b"a"])]


def test_threaded_sender_survives_unexpected_error():
    api = DoorApi(RuntimeError("พัง"), "matched")
    sender = DoorSender(api, sleep=lambda s: None)
    sender.start()
    sender.submit(Crossing("out", [b"a"]))
    sender.submit(Crossing("in", []))
    sender.stop()
    assert [c[0] for c in api.calls] == ["out", "in"]


def test_parse_quad():
    assert parse_quad("0.1,0.2,0.9,0.2,0.9,0.8,0.1,0.8") == [
        (0.1, 0.2),
        (0.9, 0.2),
        (0.9, 0.8),
        (0.1, 0.8),
    ]


@pytest.mark.parametrize(
    "text",
    [
        "",
        "0.1,0.2",
        "a,b,c,d,e,f,g,h",
        "0,0,1,0,1,2,0,1",
        # ลำดับมุมไขว้ (โบว์ไท)
        "0.2,0.2,0.8,0.2,0.2,0.8,0.8,0.8",
        # ซ้ำจุด / แบนเป็นเส้น
        "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "0.1,0.5,0.3,0.5,0.6,0.5,0.9,0.5",
    ],
)
def test_parse_quad_rejects_bad_values(text):
    with pytest.raises(ValueError, match="DOOR_QUAD"):
        parse_quad(text)
