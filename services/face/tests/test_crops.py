import cv2
import numpy as np

from app.crops import face_crop
from tests.images import noise_image


def decode(data: bytes) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert image is not None
    return image


def test_crop_is_jpeg_with_margin():
    frame = noise_image(size=1000)
    data = face_crop(frame, (400.0, 400.0, 500.0, 500.0))
    assert data[:3] == b"\xff\xd8\xff"
    # กรอบหน้า 100 px ขยาย 1.6 เท่าได้ 160 px ไม่ต้องย่อ
    assert decode(data).shape[:2] == (160, 160)


def test_crop_shrinks_large_faces():
    frame = noise_image(size=1000)
    image = decode(face_crop(frame, (100.0, 100.0, 700.0, 500.0)))
    assert max(image.shape[:2]) == 320


def test_crop_at_frame_edge():
    frame = noise_image(size=300)
    image = decode(face_crop(frame, (-20.0, 250.0, 60.0, 330.0)))
    height, width = image.shape[:2]
    assert 0 < width <= 300 and 0 < height <= 300


def test_crop_outside_frame_is_none():
    assert face_crop(noise_image(size=100), (200.0, 200.0, 250.0, 250.0)) is None
