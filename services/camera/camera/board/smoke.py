"""ทดสอบ NPU จริงหลังติดตั้ง: python -m camera.board.smoke (MODEL_DIR ชี้โฟลเดอร์ .rknn)"""

import os
import sys
from pathlib import Path

import numpy as np

DET_OUTPUTS = 9


def check_runner(runner) -> list[str]:
    """รันโมเดลละ 1 ภาพ คืนรายการปัญหา (ว่าง = ผ่าน)"""
    problems: list[str] = []
    rng = np.random.default_rng(0)
    width, height = runner.det_size

    outs = runner.detect(rng.integers(0, 256, (height, width, 3), dtype=np.uint8))
    if len(outs) != DET_OUTPUTS:
        problems.append(f"det ได้ {len(outs)} output (ต้อง {DET_OUTPUTS})")
    elif not all(np.isfinite(np.asarray(o)).all() for o in outs):
        problems.append("det มีค่า NaN/inf")

    face = rng.integers(0, 256, (1, 112, 112, 3), dtype=np.uint8)
    emb = np.asarray(runner.embed(face))
    if emb.shape != (1, 512):
        problems.append(f"embedding ขนาด {emb.shape} (ต้อง (1, 512))")
    elif not np.isfinite(emb).all():
        problems.append("embedding มีค่า NaN/inf")
    elif not np.linalg.norm(emb) > 0:
        problems.append("embedding เป็นศูนย์")

    if runner.has_liveness:
        live = np.asarray(runner.liveness(rng.integers(0, 256, (1, 80, 80, 3), dtype=np.uint8)))
        if live.shape != (1,) or not np.isfinite(live).all():
            problems.append(f"liveness ผิดปกติ {live}")
    return problems


def main() -> int:
    from camera.board.rknn_runner import RknnRunner

    model_dir = Path(os.environ.get("MODEL_DIR", "").strip() or "~/workspace/classping-models").expanduser()
    runner = RknnRunner(model_dir)
    try:
        problems = check_runner(runner)
    finally:
        runner.close()
    for problem in problems:
        print(f"ไม่ผ่าน: {problem}", file=sys.stderr)
    print("NPU ผ่าน" if not problems else "NPU ไม่ผ่าน")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
