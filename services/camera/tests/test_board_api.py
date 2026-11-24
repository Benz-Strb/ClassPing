import base64
import json
import logging

import httpx
import pytest

from camera.api import ApiDown, BadToken
from camera.board.analyze import MAX_CROP_BYTES
from camera.board_api import MAX_BODY_BYTES, BoardApi, fit_faces

RESULT = {
    "capturedAt": "2026-11-20T12:00:00+07:00",
    "width": 1920,
    "height": 1080,
    "skippedSmall": 2,
    "faces": [
        {"bbox": [1, 2, 3, 4], "detScore": 0.9, "embedding": [0.1], "liveness": None, "crop": None}
    ],
}


def api_with(handler, **kwargs) -> BoardApi:
    return BoardApi("http://api.test", "tok", transport=httpx.MockTransport(handler), **kwargs)


def test_board_api_posts_json():
    seen = {}

    def handler(request: httpx.Request):
        seen["path"] = request.url.path
        seen["token"] = request.headers["X-Camera-Token"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(202)

    assert api_with(handler, model="buffalo_l").send(RESULT) == "queued"
    assert seen["path"] == "/camera/faces"
    assert seen["token"] == "tok"
    assert seen["body"] == {**RESULT, "model": "buffalo_l"}


def test_board_api_model_from_env(monkeypatch):
    monkeypatch.setenv("FACE_MODEL", "buffalo_s")
    assert api_with(lambda r: httpx.Response(202)).model == "buffalo_s"
    monkeypatch.delenv("FACE_MODEL")
    assert api_with(lambda r: httpx.Response(202)).model == "buffalo_l"


@pytest.mark.parametrize(("status", "expected"), [(409, "no_session"), (429, "busy")])
def test_board_api_maps_409_429(status, expected):
    assert api_with(lambda r: httpx.Response(status)).send(RESULT) == expected


def test_board_api_error_mapping():
    with pytest.raises(BadToken):
        api_with(lambda r: httpx.Response(401)).send(RESULT)
    with pytest.raises(ApiDown):
        api_with(lambda r: httpx.Response(503)).send(RESULT)


def big_face(i: int) -> dict:
    """หน้าขนาด 40+i px พร้อม embedding เต็ม 512 ค่า (ปัด 6 ตำแหน่ง) และครอปใหญ่สุดที่ API รับ"""
    size = 40 + i
    return {
        "bbox": [10.0 * i, 0.0, 10.0 * i + size, float(size)],
        "detScore": 0.876543,
        "embedding": [round(-0.0441941 + i * 1e-6, 6)] * 512,
        "liveness": 0.912345,
        "crop": base64.b64encode(bytes(MAX_CROP_BYTES)).decode("ascii"),
    }


def test_fifty_max_crops_fit_budget_and_largest_keep_crops(caplog):
    faces = [big_face(i) for i in range(50)]
    seen = {}

    def handler(request: httpx.Request):
        seen["size"] = len(request.content)
        seen["body"] = json.loads(request.content)
        return httpx.Response(202)

    with caplog.at_level(logging.WARNING, logger="camera"):
        assert api_with(handler).send({**RESULT, "faces": faces}) == "queued"
    assert seen["size"] <= MAX_BODY_BYTES
    sent = seen["body"]["faces"]
    assert len(sent) == 50  # ตัดครอปก็พอ ไม่ต้องทิ้งหน้า
    with_crop = [f["bbox"][2] - f["bbox"][0] for f in sent if f["crop"] is not None]
    without = [f["bbox"][2] - f["bbox"][0] for f in sent if f["crop"] is None]
    assert with_crop and without
    assert min(with_crop) > max(without)  # หน้าใหญ่ได้เก็บครอป
    assert 89 in with_crop  # หน้าใหญ่สุด
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1


def test_fit_faces_drops_smallest_faces_when_crops_are_not_enough():
    faces = [{**big_face(i), "crop": None} for i in range(10)]
    body = {**RESULT, "model": "buffalo_l", "faces": faces}
    one = len(json.dumps(faces[0], separators=(",", ":")))
    budget = len(json.dumps({**body, "faces": faces[:4]}, separators=(",", ":"))) + one // 2
    fitted, crops, dropped = fit_faces(body, budget)
    assert (crops, dropped) == (0, 6)
    sizes = sorted(f["bbox"][2] - f["bbox"][0] for f in fitted["faces"])
    assert sizes == [46, 47, 48, 49]
    assert len(json.dumps(fitted, separators=(",", ":"))) <= budget


def test_small_body_is_sent_unchanged(caplog):
    with caplog.at_level(logging.WARNING, logger="camera"):
        fitted, crops, dropped = fit_faces({**RESULT, "faces": [big_face(0)]})
    assert (crops, dropped) == (0, 0)
    assert fitted["faces"] == [big_face(0)]
    assert not caplog.records


@pytest.mark.parametrize(
    "bad",
    [
        {"embedding": [0.1, float("nan")]},
        {"embedding": [float("inf")]},
        {"detScore": float("nan")},
        {"bbox": [1, 2, float("inf"), 4]},
    ],
)
def test_non_finite_faces_are_dropped_not_raised(caplog, bad):
    seen = {}

    def handler(request: httpx.Request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(202)

    good = RESULT["faces"][0]
    result = {**RESULT, "faces": [{**good, **bad}, good]}
    with caplog.at_level(logging.WARNING, logger="camera"):
        assert api_with(handler).send(result) == "queued"
    assert seen["body"]["faces"] == [good]
    assert len(caplog.records) == 1
    assert "NaN" in caplog.records[0].getMessage()


def test_non_finite_liveness_sent_as_none():
    seen = {}

    def handler(request: httpx.Request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(202)

    face = {**RESULT["faces"][0], "liveness": float("nan")}
    assert api_with(handler).send({**RESULT, "faces": [face]}) == "queued"
    assert seen["body"]["faces"] == [{**face, "liveness": None}]
