import sys
import types
from typing import ClassVar

import pytest

from camera.board.rknn_runner import RknnRunner


class FakeLite:
    NPU_CORE_0, NPU_CORE_1, NPU_CORE_2 = 1, 2, 4
    instances: ClassVar[list] = []
    fail_on: str | None = None  # ชื่อไฟล์ที่ให้ load/init พัง
    fail_stage = "load"

    def __init__(self, verbose=False):
        self.path = ""
        self.released = False
        FakeLite.instances.append(self)

    def load_rknn(self, path):
        self.path = path
        return -1 if self._fails("load") else 0

    def init_runtime(self, core_mask=None):
        return -1 if self._fails("init") else 0

    def _fails(self, stage):
        return FakeLite.fail_on and FakeLite.fail_on in self.path and FakeLite.fail_stage == stage

    def release(self):
        self.released = True


@pytest.fixture
def models(tmp_path, monkeypatch):
    for name in ("det_2560x1440_fp16.rknn", "rec_fp16.rknn", "live_fp16.rknn"):
        (tmp_path / name).write_bytes(b"x")
    module = types.ModuleType("rknnlite.api")
    module.RKNNLite = FakeLite
    package = types.ModuleType("rknnlite")
    package.api = module
    monkeypatch.setitem(sys.modules, "rknnlite", package)
    monkeypatch.setitem(sys.modules, "rknnlite.api", module)
    FakeLite.instances = []
    FakeLite.fail_on = None
    FakeLite.fail_stage = "load"
    return tmp_path


def test_all_loaded_then_close_releases_all(models):
    runner = RknnRunner(models)
    assert runner.has_liveness
    assert len(FakeLite.instances) == 3
    assert not any(i.released for i in FakeLite.instances)
    runner.close()
    assert all(i.released for i in FakeLite.instances)


@pytest.mark.parametrize("fail_on", ["rec_fp16", "live_fp16", "det_2560"])
@pytest.mark.parametrize("stage", ["load", "init"])
def test_failed_init_releases_everything(models, fail_on, stage):
    FakeLite.fail_on, FakeLite.fail_stage = fail_on, stage
    with pytest.raises(RuntimeError):
        RknnRunner(models)
    assert FakeLite.instances
    assert all(i.released for i in FakeLite.instances)


def test_release_error_does_not_stop_others(models):
    runner = RknnRunner(models)

    def boom():
        raise OSError("x")

    FakeLite.instances[0].release = boom
    runner.close()
    assert all(i.released for i in FakeLite.instances[1:])
