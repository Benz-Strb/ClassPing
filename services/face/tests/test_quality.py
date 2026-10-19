import pytest

from app.config import load_settings
from app.errors import FaceError
from app.images import decode_image
from app.quality import pick_enrollment_face, sharpness
from tests.conftest import TOKEN, fake_face
from tests.images import flat_image, jpeg, noise_image

SETTINGS = load_settings({"FACE_SERVICE_TOKEN": TOKEN})


def code_of(error: pytest.ExceptionInfo) -> tuple[int, str]:
    return error.value.status, error.value.code


def test_decode_ok():
    image = decode_image(jpeg(noise_image()), max_bytes=SETTINGS.max_image_bytes)
    assert image.shape == (480, 480, 3)


def test_decode_rejects_garbage():
    with pytest.raises(FaceError) as error:
        decode_image(b"not an image", max_bytes=SETTINGS.max_image_bytes)
    assert code_of(error) == (400, "INVALID_IMAGE")


def test_decode_rejects_empty():
    with pytest.raises(FaceError) as error:
        decode_image(b"", max_bytes=SETTINGS.max_image_bytes)
    assert code_of(error) == (400, "INVALID_IMAGE")


def test_decode_rejects_oversize():
    with pytest.raises(FaceError) as error:
        decode_image(b"x" * 101, max_bytes=100)
    assert code_of(error) == (413, "IMAGE_TOO_LARGE")


def test_sharpness_flat_vs_noise():
    bbox = (100.0, 100.0, 300.0, 300.0)
    assert sharpness(flat_image(), bbox) < 1
    assert sharpness(noise_image(), bbox) > 1000


def test_sharpness_bbox_outside_image_is_zero():
    assert sharpness(noise_image(), (-50.0, -50.0, -10.0, -10.0)) == 0


def test_enroll_no_face():
    with pytest.raises(FaceError) as error:
        pick_enrollment_face([], noise_image(), SETTINGS)
    assert code_of(error) == (422, "NO_FACE")


def test_enroll_only_low_score_faces_is_no_face():
    with pytest.raises(FaceError) as error:
        pick_enrollment_face([fake_face(det_score=0.3)], noise_image(), SETTINGS)
    assert code_of(error) == (422, "NO_FACE")


def test_enroll_multiple_faces():
    faces = [fake_face(seed=1), fake_face(bbox=(320.0, 100.0, 460.0, 260.0), seed=2)]
    with pytest.raises(FaceError) as error:
        pick_enrollment_face(faces, noise_image(), SETTINGS)
    assert code_of(error) == (422, "MULTIPLE_FACES")


def test_enroll_ignores_low_score_background_face():
    main = fake_face(seed=1)
    background = fake_face(bbox=(320.0, 100.0, 460.0, 260.0), det_score=0.3, seed=2)
    assert pick_enrollment_face([main, background], noise_image(), SETTINGS) is main


def test_enroll_face_too_small():
    small = fake_face(bbox=(100.0, 100.0, 200.0, 300.0))  # ด้านสั้น 100 < 112
    with pytest.raises(FaceError) as error:
        pick_enrollment_face([small], noise_image(), SETTINGS)
    assert code_of(error) == (422, "FACE_TOO_SMALL")


def test_enroll_low_det_score():
    with pytest.raises(FaceError) as error:
        pick_enrollment_face([fake_face(det_score=0.55)], noise_image(), SETTINGS)
    assert code_of(error) == (422, "LOW_QUALITY")


def test_enroll_blurry():
    with pytest.raises(FaceError) as error:
        pick_enrollment_face([fake_face()], flat_image(), SETTINGS)
    assert code_of(error) == (422, "BLURRY")


def test_enroll_ok():
    face = fake_face()
    assert pick_enrollment_face([face], noise_image(), SETTINGS) is face


def test_decode_rejects_huge_dimensions():
    # PNG สีดำ 6000x6000 บีบอัดแล้วเล็กมาก แต่ถ้า decode จะกินหน่วยความจำ ~100 MB
    import cv2
    import numpy as np

    ok, png = cv2.imencode(".png", np.zeros((6000, 6000, 3), dtype=np.uint8))
    assert ok and len(png) < SETTINGS.max_image_bytes
    with pytest.raises(FaceError) as error:
        decode_image(png.tobytes(), max_bytes=SETTINGS.max_image_bytes)
    assert code_of(error) == (413, "IMAGE_TOO_LARGE")


def test_decode_accepts_4k_frame():
    import cv2
    import numpy as np

    _, png = cv2.imencode(".png", np.zeros((2160, 3840, 3), dtype=np.uint8))
    assert decode_image(png.tobytes(), max_bytes=SETTINGS.max_image_bytes).shape == (2160, 3840, 3)


def test_decode_corrupt_png_header_is_invalid_not_500():
    # IHDR ยาว 11 แทน 13 ทำให้ Pillow โยน ValueError (เจอจาก fuzz ตอนรีวิว)
    import struct
    import zlib

    ihdr = b"IHDR" + b"\x00" * 11
    png = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 11) + ihdr + struct.pack(">I", zlib.crc32(ihdr))
    with pytest.raises(FaceError) as error:
        decode_image(png, max_bytes=SETTINGS.max_image_bytes)
    assert code_of(error) == (400, "INVALID_IMAGE")


def test_sharpness_does_not_depend_on_resolution():
    # หน้าเดียวกันถ่ายด้วยกล้องความละเอียดสูงต้องไม่ถูกตัดสินว่าเบลอกว่า
    import cv2

    base = cv2.GaussianBlur(noise_image(size=120), (0, 0), 1.0)
    big = cv2.resize(base, (960, 960), interpolation=cv2.INTER_CUBIC)
    small_score = sharpness(base, (0.0, 0.0, 120.0, 120.0))
    big_score = sharpness(big, (0.0, 0.0, 960.0, 960.0))
    assert big_score > SETTINGS.enroll_min_sharpness
    assert 0.5 < big_score / small_score < 2


def test_sharpness_thin_strip_is_zero_without_huge_resize():
    # กรอบหน้าที่โดนขอบภาพตัดจนเหลือแถบบาง ห้ามขยายจนกินหน่วยความจำ
    import time

    image = noise_image(size=4000)
    start = time.perf_counter()
    assert sharpness(image, (0.0, 0.0, 4000.0, 2.0)) == 0
    assert sharpness(image, (0.0, 0.0, 3.0, 4000.0)) == 0
    assert time.perf_counter() - start < 0.5
