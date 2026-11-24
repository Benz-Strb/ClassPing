import numpy as np

from camera.board.smoke import check_runner


class Runner:
    det_size = (64, 48)
    has_liveness = True

    def __init__(self, det=9, emb=None, live=None):
        self.det = det
        self.emb = emb if emb is not None else np.ones((1, 512), np.float32)
        self.live = live if live is not None else np.array([0.5], np.float32)

    def detect(self, image):
        assert image.shape == (48, 64, 3)
        return [np.zeros((2, 1), np.float32)] * self.det

    def embed(self, faces):
        assert faces.shape == (1, 112, 112, 3)
        return self.emb

    def liveness(self, faces):
        return self.live


def test_good_runner_passes():
    assert check_runner(Runner()) == []


def test_bad_outputs_fail():
    assert check_runner(Runner(det=6))
    assert check_runner(Runner(emb=np.full((1, 512), np.nan, np.float32)))
    assert check_runner(Runner(emb=np.zeros((1, 512), np.float32)))
    assert check_runner(Runner(emb=np.ones((1, 256), np.float32)))
    assert check_runner(Runner(live=np.array([np.inf], np.float32)))
