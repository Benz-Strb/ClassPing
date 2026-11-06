from typing import ClassVar

import camera.webcam as webcam_module
from camera.webcam import Webcam


class FakeCapture:
    made: ClassVar[list["FakeCapture"]] = []

    def __init__(self, index, backend):
        self.sets: dict[int, int] = {}
        FakeCapture.made.append(self)

    def isOpened(self):
        return True

    def set(self, prop, value):
        self.sets[prop] = value

    def read(self):
        return False, None

    def release(self):
        pass


def open_with(monkeypatch, **kwargs) -> FakeCapture:
    FakeCapture.made = []
    monkeypatch.setattr(webcam_module.cv2, "VideoCapture", FakeCapture)
    monkeypatch.setattr(webcam_module.time, "sleep", lambda s: None)
    cam = Webcam(index=0, max_width=1280, **kwargs)
    cam.open()
    cam.close()
    return FakeCapture.made[0]


def test_default_size_is_1080p_for_front_camera(monkeypatch):
    cap = open_with(monkeypatch)
    assert cap.sets[webcam_module.cv2.CAP_PROP_FRAME_WIDTH] == 1920
    assert cap.sets[webcam_module.cv2.CAP_PROP_FRAME_HEIGHT] == 1080


def test_size_can_be_set(monkeypatch):
    cap = open_with(monkeypatch, size=(1280, 720))
    assert cap.sets[webcam_module.cv2.CAP_PROP_FRAME_WIDTH] == 1280
    assert cap.sets[webcam_module.cv2.CAP_PROP_FRAME_HEIGHT] == 720
