import pytest
from fastapi import UploadFile

from app.config import load_settings


def test_health_public(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"data": {"ok": True, "model": "buffalo_l", "embeddingSize": 512}}


def test_missing_token_401(client):
    res = client.post("/faces/detect")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"


def test_wrong_token_401(client):
    res = client.post("/faces/detect", headers={"X-Face-Token": "x" * 32})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"


def test_load_settings_requires_token():
    with pytest.raises(ValueError, match="FACE_SERVICE_TOKEN"):
        load_settings({})


def test_load_settings_rejects_short_token():
    with pytest.raises(ValueError, match="FACE_SERVICE_TOKEN"):
        load_settings({"FACE_SERVICE_TOKEN": "short"})


def test_load_settings_defaults():
    settings = load_settings({"FACE_SERVICE_TOKEN": "t" * 32})
    assert settings.model == "buffalo_l"
    assert settings.det_size == 640
    assert settings.enroll_min_face_px == 112
    assert settings.max_image_bytes == 5 * 1024 * 1024


def test_unknown_error_is_internal(app, client, auth):
    def boom():
        raise RuntimeError("secret")

    app.add_api_route("/boom", boom, methods=["GET"])
    res = client.get("/boom", headers=auth)
    assert res.status_code == 500
    body = res.json()
    assert body["error"]["code"] == "INTERNAL"
    assert "secret" not in res.text


def test_validation_error_envelope(app, client, auth):
    def upload(image: UploadFile):
        return {"data": None}

    app.add_api_route("/upload-test", upload, methods=["POST"])
    res = client.post("/upload-test", headers=auth, data={})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "BAD_REQUEST"
