import sys
import types

import numpy as np


def test_paddle_text_reader_returns_text_and_confidence(monkeypatch):
    class FakeResult:
        rec_texts = ('ลาป่วย', '26/10/2569')
        rec_scores = (0.98, 0.91)

    class FakePaddleOCR:
        def __init__(self, **kwargs):
            assert kwargs['lang'] == 'th'

        def predict(self, image):
            assert isinstance(image, np.ndarray)
            return [FakeResult()]

    monkeypatch.setitem(sys.modules, 'paddleocr', types.SimpleNamespace(PaddleOCR=FakePaddleOCR))

    from app.ocr import PaddleTextReader

    reader = PaddleTextReader()

    assert reader.read(np.zeros((10, 10, 3), dtype=np.uint8)) == [
        ('ลาป่วย', 0.98),
        ('26/10/2569', 0.91),
    ]
