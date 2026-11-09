import onnxruntime as ort

from camera import person


def test_uses_coreml_gpu_when_available(monkeypatch):
    monkeypatch.setattr(
        ort, "get_available_providers", lambda: ["CoreMLExecutionProvider", "CPUExecutionProvider"]
    )
    assert person.providers() == [
        ("CoreMLExecutionProvider", {"MLComputeUnits": "CPUAndGPU"}),
        "CPUExecutionProvider",
    ]


def test_falls_back_to_cpu_elsewhere(monkeypatch):
    monkeypatch.setattr(ort, "get_available_providers", lambda: ["CPUExecutionProvider"])
    assert person.providers() == ["CPUExecutionProvider"]
