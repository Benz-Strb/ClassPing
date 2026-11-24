import logging
from typing import ClassVar

import pytest

from camera import board_main
from camera.api import BadToken

PASSWORD = "p@ss:word/1"
RTSP = f"rtsp://admin:{PASSWORD}@192.168.1.64:554/Streaming/Channels/101"


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in ("CAMERA_TOKEN", "RTSP_URL", "API_URL", "MODEL_DIR", "ALLOW_PLAIN_HTTP"):
        monkeypatch.delenv(name, raising=False)


def test_no_token_exits_config(monkeypatch, caplog):
    monkeypatch.setenv("RTSP_URL", RTSP)
    with caplog.at_level(logging.ERROR, logger="camera"):
        assert board_main.main() == board_main.EXIT_CONFIG
    assert "CAMERA_TOKEN" in caplog.text


def test_no_rtsp_url_exits_config(monkeypatch, caplog):
    monkeypatch.setenv("CAMERA_TOKEN", "tok")
    with caplog.at_level(logging.ERROR, logger="camera"):
        assert board_main.main() == board_main.EXIT_CONFIG
    assert "RTSP_URL" in caplog.text


class FakeRunner:
    has_liveness = True
    closed = False

    def __init__(self, model_dir):
        self.model_dir = model_dir

    def close(self):
        FakeRunner.closed = True


class FakeSource:
    def __init__(self, url):
        pass

    def latest_raw(self):
        return None

    def close(self):
        pass


class FakeStreamer:
    kwargs: ClassVar[dict] = {}

    def __init__(self, **kwargs):
        FakeStreamer.kwargs = kwargs

    def stop(self):
        pass


class FakeLoop:
    session = None
    sent = 0

    def __init__(self, *args):
        pass

    def tick(self):
        raise BadToken("token ไม่ถูกต้อง")


def test_startup_logs_without_secrets_and_cleans_up(monkeypatch, caplog, tmp_path):
    monkeypatch.setenv("CAMERA_TOKEN", "secret-token-123")
    monkeypatch.setenv("RTSP_URL", RTSP)
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    FakeRunner.closed = False
    monkeypatch.setattr(board_main, "RknnRunner", FakeRunner)
    monkeypatch.setattr(board_main, "RtspCamera", FakeSource)
    monkeypatch.setattr(board_main, "Streamer", FakeStreamer)
    monkeypatch.setattr(board_main, "CameraLoop", FakeLoop)
    with caplog.at_level(logging.INFO, logger="camera"):
        assert board_main.main() == board_main.EXIT_CONFIG
    assert str(tmp_path) in caplog.text
    assert "liveness เปิด" in caplog.text
    assert "192.168.1.64" in caplog.text
    assert PASSWORD not in caplog.text
    assert "secret-token-123" not in caplog.text
    assert FakeStreamer.kwargs["mirror"] is False
    assert FakeStreamer.kwargs["source"].__func__ is FakeSource.latest_raw
    assert FakeRunner.closed


def test_no_liveness_model_is_logged(monkeypatch, caplog):
    monkeypatch.setenv("CAMERA_TOKEN", "tok")
    monkeypatch.setenv("RTSP_URL", RTSP)
    FakeRunner.has_liveness = False
    monkeypatch.setattr(board_main, "RknnRunner", FakeRunner)
    monkeypatch.setattr(board_main, "RtspCamera", FakeSource)
    monkeypatch.setattr(board_main, "Streamer", FakeStreamer)
    monkeypatch.setattr(board_main, "CameraLoop", FakeLoop)
    try:
        with caplog.at_level(logging.INFO, logger="camera"):
            board_main.main()
    finally:
        FakeRunner.has_liveness = True
    assert "liveness ปิด" in caplog.text


def test_model_load_failure_exits_1(monkeypatch, caplog):
    monkeypatch.setenv("CAMERA_TOKEN", "tok")
    monkeypatch.setenv("RTSP_URL", RTSP)

    def boom(model_dir):
        raise FileNotFoundError("ไม่พบโมเดล x")

    monkeypatch.setattr(board_main, "RknnRunner", boom)
    with caplog.at_level(logging.ERROR, logger="camera"):
        assert board_main.main() == 1
    assert "ไม่พบโมเดล" in caplog.text


def patch_all(monkeypatch):
    monkeypatch.setenv("CAMERA_TOKEN", "tok")
    monkeypatch.setenv("RTSP_URL", RTSP)
    monkeypatch.setattr(board_main, "RknnRunner", FakeRunner)
    monkeypatch.setattr(board_main, "RtspCamera", FakeSource)
    monkeypatch.setattr(board_main, "Streamer", FakeStreamer)
    monkeypatch.setattr(board_main, "CameraLoop", FakeLoop)


def test_plain_http_to_lan_is_refused(monkeypatch, caplog):
    patch_all(monkeypatch)
    monkeypatch.setenv("API_URL", "http://192.168.1.10:3001")
    FakeRunner.closed = False
    with caplog.at_level(logging.INFO, logger="camera"):
        assert board_main.main() == board_main.EXIT_CONFIG
    assert "https://" in caplog.text
    assert "รอคาบ" not in caplog.text


@pytest.mark.parametrize(
    "url", ["http://127.0.0.1:3001", "http://localhost:3001", "http://[::1]:3001"]
)
def test_plain_http_to_loopback_is_allowed(monkeypatch, caplog, url):
    patch_all(monkeypatch)
    monkeypatch.setenv("API_URL", url)
    with caplog.at_level(logging.INFO, logger="camera"):
        board_main.main()
    assert "รอคาบ" in caplog.text
    assert "ALLOW_PLAIN_HTTP" not in caplog.text


def test_plain_http_override_warns(monkeypatch, caplog):
    patch_all(monkeypatch)
    monkeypatch.setenv("API_URL", "http://192.168.1.10:3001")
    monkeypatch.setenv("ALLOW_PLAIN_HTTP", "1")
    with caplog.at_level(logging.INFO, logger="camera"):
        board_main.main()
    assert "รอคาบ" in caplog.text
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert any("ALLOW_PLAIN_HTTP" in r.getMessage() for r in warnings)


def test_https_is_allowed(monkeypatch, caplog):
    patch_all(monkeypatch)
    monkeypatch.setenv("API_URL", "https://api.example.com")
    with caplog.at_level(logging.INFO, logger="camera"):
        board_main.main()
    assert "รอคาบ" in caplog.text
