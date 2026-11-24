import cv2
import numpy as np

from camera.board.align import ARCFACE_TEMPLATE, arcface_input, liveness_input


def test_arcface_identity():
    rng = np.random.default_rng(1)
    frame = cv2.GaussianBlur(rng.integers(0, 256, (112, 112, 3), dtype=np.uint8), (0, 0), 2)
    out = arcface_input(frame, ARCFACE_TEMPLATE)
    assert out.shape == (112, 112, 3) and out.dtype == np.uint8
    expected = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    assert np.abs(out.astype(int) - expected.astype(int)).mean() < 1
    # ช่องสีสลับเป็น RGB จริง
    red = np.zeros((112, 112, 3), np.uint8)
    red[..., 2] = 200
    assert arcface_input(red, ARCFACE_TEMPLATE)[56, 56].tolist() == [200, 0, 0]


def test_liveness_matches_face_service():
    # ค่าอ้างอิงได้จาก app.liveness ของ services/face (similarity + warpAffine) บนเฟรมสุ่มชุดเดียวกัน
    rng = np.random.default_rng(7)
    frame = rng.integers(0, 256, (200, 300, 3), dtype=np.uint8)
    frame = cv2.GaussianBlur(frame, (0, 0), 3)
    assert int(frame.sum()) == 22930599
    kps = np.array([[120, 80], [170, 78], [146, 110], [125, 135], [168, 134]], np.float32)
    out = liveness_input(frame, kps)
    assert out is not None and out.shape == (80, 80, 3) and out.dtype == np.uint8
    assert np.allclose(out.reshape(-1, 3).mean(0), [127.2167, 128.0588, 127.4656], atol=0.05)
    pixels = {
        (0, 0): [123, 124, 134],
        (10, 20): [132, 147, 135],
        (40, 40): [124, 122, 125],
        (79, 79): [121, 136, 130],
        (60, 15): [123, 116, 123],
    }
    for (y, x), rgb in pixels.items():
        assert np.abs(out[y, x].astype(int) - rgb).max() <= 1


def test_liveness_outside_returns_none():
    frame = np.full((200, 300, 3), 100, np.uint8)
    kps = np.array([[2, 80], [52, 78], [28, 110], [7, 135], [50, 134]], np.float32)
    assert liveness_input(frame, kps) is None
