from typing import Protocol

import numpy as np


class TextReader(Protocol):
    """อ่านตัวหนังสือในภาพ คืน (ข้อความ, ความมั่นใจ 0-1) ทีละบรรทัด"""

    def read(self, image: np.ndarray) -> list[tuple[str, float]]: ...


class RapidTextReader:
    """RapidOCR (โมเดล PP-OCR บน onnxruntime) อ่านตัวเลขและอังกฤษบนบัตรได้ ภาษาไทยอ่านไม่ได้

    ครั้งแรกโหลดโมเดลราว 31 MB เก็บไว้ในโฟลเดอร์ของแพ็กเกจ ไม่อยู่ใน repo
    """

    def __init__(self):
        # import ตรงนี้ เทสต์ที่ใช้ตัวอ่านปลอมจะได้ไม่ต้องโหลดโมเดล
        from rapidocr import RapidOCR

        self._ocr = RapidOCR()

    def read(self, image: np.ndarray) -> list[tuple[str, float]]:
        result = self._ocr(image)
        if result.txts is None:
            return []
        return [
            (text, float(score)) for text, score in zip(result.txts, result.scores, strict=True)
        ]
