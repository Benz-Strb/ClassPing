import os
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

from camera.board.align import arcface_input, liveness_input
from camera.board.analyze import letterbox
from camera.board.scrfd import decode

pytest.importorskip("rknnlite.api")
onnxruntime = pytest.importorskip("onnxruntime")

pytestmark = pytest.mark.board

DET_SIZE = (2560, 1440)
ONNX_DIR = Path(os.environ.get("ONNX_DIR", Path.home() / "workspace" / "npu-spike"))
MODEL_DIR = Path(os.environ.get("MODEL_DIR", Path.home() / "workspace" / "classping-models"))
SAMPLE = os.environ.get("INSIGHTFACE_SAMPLE")
# brief กำหนด 0.01 แต่บนบอร์ดหน้าหนึ่งต่าง 0.0103 (FP16 เก็บผลละเอียดแค่ ~0.001) จึงเผื่อเป็น 0.015
LIVENESS_TOL = 0.015


def session(name: str):
    path = ONNX_DIR / name
    if not path.exists():
        pytest.skip(f"ไม่มี {path}")
    return onnxruntime.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def iou(a, b) -> float:
    w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = w * h
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union


def timed(fn, repeat: int = 5):
    fn()
    start = time.perf_counter()
    for _ in range(repeat):
        out = fn()
    return out, (time.perf_counter() - start) / repeat * 1000


@pytest.fixture(scope="module")
def frame():
    if not SAMPLE or not Path(SAMPLE).exists():
        pytest.skip("ตั้ง INSIGHTFACE_SAMPLE เป็นภาพทดสอบก่อน")
    return cv2.imread(SAMPLE)


@pytest.fixture(scope="module")
def runner():
    from camera.board.rknn_runner import RknnRunner

    r = RknnRunner(MODEL_DIR, DET_SIZE)
    yield r
    r.close()


@pytest.fixture(scope="module")
def cpu_faces(frame):
    """หน้าจาก onnxruntime CPU พร้อมภาพที่ letterbox แล้ว"""
    image, _ = letterbox(frame, *DET_SIZE)
    blob = ((image.astype(np.float32) - 127.5) / 128.0).transpose(2, 0, 1)[None]
    sess = session("det_10g.onnx")
    outs = sess.run(None, {sess.get_inputs()[0].name: blob})
    return image, decode(outs, DET_SIZE[1], DET_SIZE[0], 0.5)


def test_detect_matches_onnx(runner, cpu_faces):
    image, ref = cpu_faces
    outs, ms = timed(lambda: runner.detect(image))
    got = decode(outs, DET_SIZE[1], DET_SIZE[0], 0.5)
    ious = [max((iou(g.bbox, r.bbox) for r in ref), default=0.0) for g in got]
    print(f"\ndetect: {len(got)} หน้า (CPU {len(ref)}) {ms:.0f} ms IoU ต่ำสุด {min(ious):.4f}")
    assert len(ref) > 0
    assert len(got) == len(ref)
    assert min(ious) >= 0.99


def test_embed_matches_onnx(runner, frame, cpu_faces):
    _, ref = cpu_faces
    faces = np.stack([arcface_input(frame, f.kps) for f in ref])
    sess = session("w600k_r50.onnx")
    name = sess.get_inputs()[0].name
    expected = [
        sess.run(
            None,
            {name: ((f.astype(np.float32) - 127.5) / 127.5).transpose(2, 0, 1)[None]},
        )[0].reshape(-1)
        for f in faces
    ]
    got, ms = timed(lambda: runner.embed(faces), 3)
    assert got.shape == (len(faces), 512)
    cos = [float(a @ b / np.linalg.norm(a) / np.linalg.norm(b)) for a, b in zip(got, expected)]
    print(
        f"\nembed: {len(faces)} หน้า {ms:.0f} ms ({ms / len(faces):.1f} ms/หน้า) cos ต่ำสุด {min(cos):.5f}"
    )
    assert min(cos) >= 0.999


def test_liveness_matches_onnx(runner, frame, cpu_faces):
    if not runner.has_liveness:
        pytest.skip("ไม่มี live_fp16.rknn")
    _, ref = cpu_faces
    crops = [c for c in (liveness_input(frame, f.kps) for f in ref) if c is not None]
    assert crops
    faces = np.stack(crops)
    sess = session("liveness.onnx")
    name = sess.get_inputs()[0].name
    expected = [
        float(sess.run(None, {name: (f.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]})[0][0])
        for f in faces
    ]
    got, ms = timed(lambda: runner.liveness(faces), 10)
    diff = [abs(float(a) - b) for a, b in zip(got, expected)]
    print(
        f"\nliveness: {len(faces)} หน้า {ms:.1f} ms ({ms / len(faces):.2f} ms/หน้า) ต่างสูงสุด {max(diff):.5f}"
    )
    assert max(diff) <= LIVENESS_TOL
