from datetime import UTC, datetime, timedelta

import pytest

from camera.api import ApiDown, BadToken, Session
from camera.door import Crossing
from camera.door_main import RETRY_WAIT_SECONDS, DoorLoop, DoorSender, parse_quad
from camera.loop import POLL_SECONDS, RETRY_SECONDS

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
        self.polls = 0

    def session(self):
        self.polls += 1
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


def make():
    clock, api, camera, counter, sender = (
        Clock(),
        FakeApi(),
        FakeCamera(),
        FakeCounter(),
        FakeSender(),
    )
    loop = DoorLoop(api, camera, counter, sender, clock)
    return loop, clock, api, camera, counter, sender


def test_polls_every_30_seconds_opens_and_closes_camera():
    loop, clock, api, camera, counter, _ = make()
    loop.tick()
    assert (api.polls, camera.opened) == (1, 0)
    api.current = session()
    clock.advance(POLL_SECONDS)
    loop.tick()
    assert (api.polls, camera.opened) == (2, 1)
    clock.advance(10)
    loop.tick()
    assert api.polls == 2
    api.current = None
    clock.advance(POLL_SECONDS)
    loop.tick()
    assert (camera.closed, counter.resets) == (1, 1)


def test_closes_camera_when_session_ends_before_next_poll():
    loop, clock, api, camera, _, _ = make()
    api.current = session(minutes=1)
    loop.tick()
    clock.advance(61)
    loop.tick()
    assert camera.closed == 1


def test_feeds_each_new_frame_once_and_submits_crossings():
    loop, _, api, camera, counter, sender = make()
    api.current = session()
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
    loop, _, api, camera, _counter, _ = make()
    loop.on_frame = seen.append
    api.current = session()
    camera.frame = object()
    loop.tick()
    assert seen == [camera.frame]


def test_bad_token_from_sender_stops_the_loop():
    loop, _, api, _, _, sender = make()
    api.current = session()
    sender.bad_token = True
    with pytest.raises(BadToken):
        loop.tick()


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


def test_parse_quad():
    assert parse_quad("0.1,0.2,0.9,0.2,0.9,0.8,0.1,0.8") == [
        (0.1, 0.2),
        (0.9, 0.2),
        (0.9, 0.8),
        (0.1, 0.8),
    ]


@pytest.mark.parametrize("text", ["", "0.1,0.2", "a,b,c,d,e,f,g,h", "0,0,1,0,1,2,0,1"])
def test_parse_quad_rejects_bad_values(text):
    with pytest.raises(ValueError, match="DOOR_QUAD"):
        parse_quad(text)


def test_camera_open_failure_retries_later():
    loop, _, api, camera, _, _ = make()

    def broken():
        raise RuntimeError("เปิดกล้องไม่ได้")

    camera.open = broken
    api.current = session()
    assert loop.tick() == RETRY_SECONDS
    assert loop.session is None
