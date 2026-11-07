import cv2
import numpy as np

from camera.door import Box, DoorCounter

H, W = 200, 300
# ขอบในห้อง y=40, ขอบฝั่งออก y=160, กรอบกว้าง x 60..240
QUAD = [(0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8)]
ROOM, MID, EXIT = 20, 100, 180  # จุดเท้า (พิกเซล y) หลังขอบในห้อง, ในกรอบ, พ้นขอบฝั่งออก


def foot(y: float, x: float = 150, height: float = 40) -> Box:
    return Box(x - 20, y - height, x + 20, y, 0.9)


class Scene:
    """ตัวหาคนปลอมกับ tracker ปลอม ที่คืนผลตามสคริปต์ทีละเฟรม"""

    def __init__(self, steps: list[list[tuple[int, Box]]]):
        self.steps = steps
        self.i = 0
        self.resets = 0

    def detect(self, frame):
        return [box for _, box in self.steps[self.i]]

    def update(self, boxes):
        found = self.steps[self.i]
        self.i += 1
        return found

    def reset(self):
        self.resets += 1


def frame(value: int = 0):
    return np.full((H, W, 3), value, np.uint8)


def run(steps, keep: int = 3, value=lambda i: 0, clock=None):
    scene = Scene(steps)
    kwargs = {"now": clock} if clock else {}
    counter = DoorCounter(scene, scene, QUAD, keep=keep, **kwargs)
    crossings = []
    for i in range(len(steps)):
        crossings += counter.feed(frame(value(i)))
    return crossings, counter


def walk(tid: int, ys: list[float], x: float = 150):
    return [[(tid, foot(y, x))] for y in ys]


def test_walk_out_gives_out_with_jpeg_crops():
    crossings, _ = run(walk(1, [ROOM, 60, MID, 140, EXIT]))
    assert [c.direction for c in crossings] == ["out"]
    assert 1 <= len(crossings[0].images) <= 3
    assert all(img.startswith(b"\xff\xd8") for img in crossings[0].images)


def test_crops_are_the_largest_boxes():
    heights = [30, 50, 80, 60, 40]
    ys = [ROOM, 60, MID, 140, EXIT]
    steps = [[(1, foot(y, height=h))] for y, h in zip(ys, heights)]
    crossings, _ = run(steps, keep=2)
    sizes = sorted(
        cv2.imdecode(np.frombuffer(i, np.uint8), 1).shape[0] for i in crossings[0].images
    )
    assert sizes == [60, 80]


def test_walk_in_has_no_images():
    crossings, _ = run(walk(1, [EXIT, 140, MID, 60, ROOM]))
    assert [c.direction for c in crossings] == ["in"]
    assert crossings[0].images == []


def test_turn_back_inside_does_not_count():
    crossings, _ = run(walk(1, [ROOM, 60, MID, 60, ROOM]))
    assert crossings == []


def test_out_then_back_in():
    ys = [ROOM, MID, EXIT, MID, ROOM]
    crossings, _ = run(walk(1, ys))
    assert [c.direction for c in crossings] == ["out", "in"]


def test_standing_or_swaying_inside_does_not_count():
    ys = [MID] * 60 + [MID + 10, MID - 10] * 20
    crossings, _ = run(walk(1, ys))
    assert crossings == []


def test_walking_past_outside_the_quad_does_not_count():
    # เดินจากหลังขอบในห้องไปพ้นขอบฝั่งออก แต่ไถลนอกกรอบด้านข้าง
    crossings, _ = run(walk(1, [ROOM, 60, MID, 140, EXIT], x=20))
    assert crossings == []


def test_first_seen_inside_then_leaving_does_not_count():
    crossings, _ = run(walk(1, [MID, 140, EXIT]))
    assert crossings == []


def test_in_clears_crops_so_out_uses_new_images():
    # ตอนเดินเข้าภาพสว่าง 50 ตอนเดินออกภาพ 200 รูปตอนออกต้องไม่มีของเดิม
    ys = [EXIT, MID, ROOM, MID, EXIT]
    values = [50, 50, 50, 200, 200]
    crossings, _ = run(walk(1, ys), value=lambda i: values[i])
    assert [c.direction for c in crossings] == ["in", "out"]
    for img in crossings[1].images:
        assert cv2.imdecode(np.frombuffer(img, np.uint8), 1).mean() > 150


def test_two_people_out_together():
    steps = [[(1, foot(y, 100)), (2, foot(y, 200))] for y in [ROOM, 60, MID, 140, EXIT]]
    crossings, _ = run(steps)
    assert [c.direction for c in crossings] == ["out", "out"]


def test_stale_track_crops_are_dropped():
    now = [0.0]
    scene = Scene(walk(1, [ROOM, MID]) + [[]])
    counter = DoorCounter(scene, scene, QUAD, now=lambda: now[0])
    counter.feed(frame())
    counter.feed(frame())
    assert counter.crop_tracks == {1}
    now[0] = 100
    counter.feed(frame())
    assert counter.crop_tracks == set()


def test_reset_clears_state_and_tracker():
    _, counter = run(walk(1, [ROOM, MID]))
    counter.reset()
    assert counter.crop_tracks == set()
    assert counter.tracker.resets == 1


def test_writes_no_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    run(walk(1, [ROOM, MID, EXIT]))
    assert list(tmp_path.iterdir()) == []


def test_empty_or_oversized_image_is_dropped_but_crossing_is_sent(monkeypatch):
    from camera import door

    monkeypatch.setattr(door, "MAX_IMAGE_BYTES", 10)
    crossings, _ = run(walk(1, [ROOM, 60, MID, 140, EXIT]))
    assert [c.direction for c in crossings] == ["out"]
    assert crossings[0].images == []


def test_failed_encode_is_dropped(monkeypatch):
    monkeypatch.setattr(cv2, "imencode", lambda *a, **k: (False, None))
    crossings, _ = run(walk(1, [ROOM, 60, MID, 140, EXIT]))
    assert [c.direction for c in crossings] == ["out"]
    assert crossings[0].images == []


def test_real_bytetrack_with_counter_on_a_synthetic_walk():
    from camera.person import ByteTrack

    class Walker:
        def __init__(self):
            self.i = 0

        def detect(self, frame):
            y = 10 + self.i * 6
            self.i += 1
            return [foot(y)]

    counter = DoorCounter(Walker(), ByteTrack(), QUAD)
    crossings = []
    for _ in range(32):
        crossings += counter.feed(frame())
    assert [c.direction for c in crossings] == ["out"]
    assert crossings[0].images
