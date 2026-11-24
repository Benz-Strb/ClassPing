import logging
from pathlib import Path

import numpy as np

log = logging.getLogger("camera")

DET_FILE = "det_{w}x{h}_fp16.rknn"
REC_FILE = "rec_fp16.rknn"
LIVE_FILE = "live_fp16.rknn"


class RknnRunner:
    """รันโมเดลหน้า FP16 บน NPU ของ RK3588 (หาหน้า core 0, embedding core 1, liveness core 2)

    โมเดลแต่ละตัวรับ batch 1 จึงวนทีละหน้าใน embed/liveness
    mean/std ฝังอยู่ในไฟล์ .rknn แล้ว (ดู scripts/convert_models.py) ป้อนภาพ uint8 RGB ได้เลย
    """

    def __init__(self, model_dir: Path, det_size: tuple[int, int] = (2560, 1440)) -> None:
        from rknnlite.api import RKNNLite

        model_dir = Path(model_dir)
        self.det_size = det_size
        det_path = model_dir / DET_FILE.format(w=det_size[0], h=det_size[1])
        rec_path = model_dir / REC_FILE
        live_path = model_dir / LIVE_FILE
        for path in (det_path, rec_path):
            if not path.exists():
                raise FileNotFoundError(f"ไม่พบโมเดล {path}")

        self._lites: list = []
        self._live = None
        try:
            self._det = self._load(RKNNLite, det_path, RKNNLite.NPU_CORE_0)
            self._rec = self._load(RKNNLite, rec_path, RKNNLite.NPU_CORE_1)
            if live_path.exists():
                self._live = self._load(RKNNLite, live_path, RKNNLite.NPU_CORE_2)
        except BaseException:
            # โหลดตัวไหนพัง ต้องคืน NPU ของตัวที่โหลดไปแล้ว ไม่งั้น service restart แล้วรั่วสะสม
            self.close()
            raise
        self.has_liveness = self._live is not None

    def _load(self, rknn_lite, path: Path, core_mask):
        lite = rknn_lite(verbose=False)
        try:
            if lite.load_rknn(str(path)) != 0:
                raise RuntimeError(f"โหลด {path.name} ไม่สำเร็จ")
            if lite.init_runtime(core_mask=core_mask) != 0:
                raise RuntimeError(f"เริ่ม NPU สำหรับ {path.name} ไม่สำเร็จ")
        except BaseException:
            lite.release()
            raise
        self._lites.append(lite)
        return lite

    def detect(self, image_rgb: np.ndarray) -> list[np.ndarray]:
        width, height = self.det_size
        if image_rgb.shape != (height, width, 3):
            raise ValueError(f"ภาพต้องขนาด {width}x{height} แต่ได้ {image_rgb.shape}")
        return self._det.inference(inputs=[image_rgb[None]], data_format="nhwc")

    def embed(self, faces_rgb: np.ndarray) -> np.ndarray:
        rows = [
            np.asarray(self._rec.inference(inputs=[face[None]], data_format="nhwc")[0]).reshape(-1)
            for face in faces_rgb
        ]
        return np.stack(rows).astype(np.float32) if rows else np.zeros((0, 512), np.float32)

    def liveness(self, faces_rgb: np.ndarray) -> np.ndarray:
        if self._live is None:
            raise RuntimeError("ไม่มีโมเดล liveness")
        scores = [
            float(
                np.asarray(
                    self._live.inference(inputs=[face[None]], data_format="nhwc")[0]
                ).reshape(-1)[0]
            )
            for face in faces_rgb
        ]
        return np.array(scores, np.float32)

    def close(self) -> None:
        lites, self._lites = self._lites, []
        for lite in lites:
            try:
                lite.release()
            except Exception:  # noqa: BLE001 ตัวหนึ่งพังก็ต้องปล่อยตัวที่เหลือต่อ
                log.warning("คืน NPU ไม่สำเร็จ")
