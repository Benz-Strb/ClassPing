import sys
import types
from pathlib import Path

import numpy as np
import pytest


def test_typhoon_requires_explicit_key(monkeypatch):
    from app.typhoon_ocr import TyphoonTextReader

    monkeypatch.delenv('TYPHOON_OCR_API_KEY', raising=False)
    with pytest.raises(ValueError, match='TYPHOON_OCR_API_KEY'):
        TyphoonTextReader()


def test_typhoon_uses_v15_and_removes_temporary_image(monkeypatch):
    from app.typhoon_ocr import TyphoonTextReader

    paths = []

    def ocr_document(**kwargs):
        path = Path(kwargs['pdf_or_image_path'])
        assert path.exists()
        paths.append(path)
        assert kwargs['model'] == 'typhoon-ocr'
        assert kwargs['task_type'] == 'v1.5'
        assert kwargs['api_key'] == 'test-only'
        return 'ลาป่วย\n27/10/2569'

    monkeypatch.setitem(sys.modules, 'typhoon_ocr', types.SimpleNamespace(ocr_document=ocr_document))
    assert TyphoonTextReader('test-only').read(np.zeros((50, 50, 3), dtype=np.uint8)) == (
        'ลาป่วย\n27/10/2569'
    )
    assert not paths[0].exists()


@pytest.mark.parametrize(('reference', 'output', 'expected'), [
    ('ลาป่วย', 'ลาป่วย', 0),
    ('abc', 'axc', 1 / 3),
    ('abc', '', 1),
    ('abc', 'abcc', 1 / 3),
    ('a b\nc', 'abc', 0),
])
def test_comparison_cer(reference, output, expected):
    from scripts.compare_ocr import character_error_rate

    assert character_error_rate(reference, output) == expected
