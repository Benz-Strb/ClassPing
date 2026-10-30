from typing import Protocol

import numpy as np

DASHES_TO_HYPHEN = str.maketrans('‐‑‒–—−', '------')


class TextReader(Protocol):
    """อ่านตัวหนังสือในภาพ คืน (ข้อความ, ความมั่นใจ 0-1) ทีละบรรทัด"""

    def read(self, image: np.ndarray) -> list[tuple[str, float]]: ...


class PaddleTextReader:
    """PaddleOCR สำหรับเอกสารภาษาไทยและภาษาอังกฤษ"""

    def __init__(self):
        # import ตอนสร้างจริง เพื่อให้เทสต์ที่ใช้ reader ปลอมไม่ต้องโหลดโมเดล
        from paddleocr import PaddleOCR

        self._ocr = PaddleOCR(lang='th')

    def read(self, image: np.ndarray) -> list[tuple[str, float]]:
        results = self._ocr.predict(image)
        if not results:
            return []

        result = results[0]
        texts = result.get('rec_texts', [])
        scores = result.get('rec_scores', [])
        return [
            (text.translate(DASHES_TO_HYPHEN), float(score))
            for text, score in zip(texts, scores, strict=True)
            if text.strip()
        ]
