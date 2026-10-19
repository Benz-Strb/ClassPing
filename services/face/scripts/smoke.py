"""ลองโหลดโมเดลแล้วรันกับรูปตัวอย่างที่ติดมากับ insightface

ใช้เช็กว่าเครื่องนี้ติดตั้งครบ และดูความเร็วของแต่ละ provider
    uv run python scripts/smoke.py
"""

import time

import cv2
import onnxruntime
from insightface.app import FaceAnalysis
from insightface.data import get_image

PROVIDERS = {
    "cpu": ["CPUExecutionProvider"],
    "coreml": ["CoreMLExecutionProvider", "CPUExecutionProvider"],
}


def crop_with_margin(image, bbox, margin: float = 0.6, size: int = 480):
    """ครอปหน้าจากรูปหมู่โดยเผื่อขอบ แล้วขยายให้ได้รูปหน้าเดียวขนาดพอดี"""
    x1, y1, x2, y2 = bbox
    w, h = x2 - x1, y2 - y1
    left = max(int(x1 - w * margin), 0)
    top = max(int(y1 - h * margin), 0)
    right = min(int(x2 + w * margin), image.shape[1])
    bottom = min(int(y2 + h * margin), image.shape[0])
    return cv2.resize(image[top:bottom, left:right], (size, size))


def run(provider: str) -> None:
    app = FaceAnalysis(
        name="buffalo_l",
        allowed_modules=["detection", "recognition", "landmark_3d_68"],
        providers=PROVIDERS[provider],
    )
    app.prepare(ctx_id=-1, det_size=(640, 640))

    group = get_image("t1")
    largest = max(app.get(group), key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    single = crop_with_margin(group, largest.bbox)

    for name, image in [("หน้าเดียว (ครอปจาก t1)", single), ("t1", group)]:
        app.get(image)  # รอบแรกช้ากว่าปกติ ไม่นับเวลา
        start = time.perf_counter()
        faces = app.get(image)
        ms = (time.perf_counter() - start) * 1000
        first = faces[0] if faces else None
        print(
            f"[{provider}] {name}: {len(faces)} หน้า, {ms:.0f} ms, "
            f"embedding={None if first is None else first.normed_embedding.shape}, "
            f"pose={None if first is None else first.get('pose')}"
        )


if __name__ == "__main__":
    print("onnxruntime", onnxruntime.__version__, onnxruntime.get_available_providers())
    for provider in PROVIDERS:
        run(provider)
