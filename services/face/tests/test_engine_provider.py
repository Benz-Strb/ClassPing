import sys
import types

import pytest

from app.config import load_settings
from tests.conftest import TOKEN


@pytest.mark.parametrize(("provider", "ctx_id"), [("cpu", -1), ("coreml", 0)])
def test_prepare_keeps_coreml(monkeypatch, provider, ctx_id):
    # InsightFace บังคับกลับไปใช้ CPU ทุกโมเดลเมื่อ ctx_id ติดลบ
    calls = {}

    class FaceAnalysis:
        def __init__(self, **kwargs):
            calls["providers"] = kwargs["providers"]

        def prepare(self, ctx_id, det_size):
            calls["ctx_id"] = ctx_id

    module = types.ModuleType("insightface.app")
    module.FaceAnalysis = FaceAnalysis
    monkeypatch.setitem(sys.modules, "insightface.app", module)
    from app.engine import PROVIDERS, InsightFaceEngine

    InsightFaceEngine(load_settings({"FACE_SERVICE_TOKEN": TOKEN, "FACE_PROVIDER": provider}))
    assert calls == {"providers": PROVIDERS[provider], "ctx_id": ctx_id}
