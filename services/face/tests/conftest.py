import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import load_settings
from app.engine import DetectedFace
from app.main import create_app

TOKEN = "t" * 32


def unit_vector(seed: int) -> np.ndarray:
    vector = np.random.default_rng(seed).standard_normal(512).astype(np.float32)
    return vector / np.linalg.norm(vector)


def fake_face(
    bbox=(100.0, 100.0, 300.0, 300.0),
    det_score: float = 0.9,
    seed: int = 1,
    pose=(0.0, 0.0, 0.0),
) -> DetectedFace:
    return DetectedFace(bbox=bbox, det_score=det_score, embedding=unit_vector(seed), pose=pose)


class FakeEngine:
    """แทนโมเดลจริงในเทสต์ คืนหน้าที่กำหนดไว้ล่วงหน้า"""

    model_name = "buffalo_l"
    embedding_size = 512

    def __init__(self, faces: list[DetectedFace] | None = None):
        self.faces = faces or []

    def analyze(self, image: np.ndarray) -> list[DetectedFace]:
        return list(self.faces)


class FakeReader:
    """แทน OCR จริงในเทสต์ คืนบรรทัดที่กำหนดไว้"""

    def __init__(self, lines: list[tuple[str, float]] | None = None):
        self.lines = lines or []

    def read(self, image: np.ndarray) -> list[tuple[str, float]]:
        return list(self.lines)


@pytest.fixture
def settings():
    return load_settings({"FACE_SERVICE_TOKEN": TOKEN})


@pytest.fixture
def engine():
    return FakeEngine()


@pytest.fixture
def reader():
    return FakeReader()


@pytest.fixture
def app(settings, engine, reader):
    return create_app(settings, engine, reader)


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def auth():
    return {"X-Face-Token": TOKEN}
