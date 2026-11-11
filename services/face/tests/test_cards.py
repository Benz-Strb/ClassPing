import os

from tests.conftest import fake_face
from tests.images import noise_image, png


def post(client, auth, body: bytes, name: str = "card.png", mime: str = "image/png"):
    return client.post("/cards/read", headers=auth, files={"image": (name, body, mime)})


# ตัวหนังสือบนบัตรอ่านที่ OCR service (Typhoon) ที่นี่หาแค่หน้า
def test_read_card_returns_faces_without_ocr(client, auth, engine):
    small = fake_face(bbox=(10.0, 10.0, 40.0, 40.0), seed=1)  # หน้าเล็กในบัตรก็ต้องได้
    large = fake_face(bbox=(100.0, 100.0, 220.0, 240.0), seed=2)
    noise = fake_face(bbox=(0.0, 300.0, 100.0, 400.0), det_score=0.3, seed=3)
    engine.faces = [small, noise, large]

    res = post(client, auth, png(noise_image()))
    assert res.status_code == 200
    data = res.json()["data"]
    assert "lines" not in data
    assert [f["bbox"] for f in data["faces"]] == [list(large.bbox), list(small.bbox)]
    assert len(data["faces"][0]["embedding"]) == 512
    assert "crop" not in data["faces"][0]


def test_read_card_requires_token(client):
    res = client.post("/cards/read", files={"image": ("c.png", png(noise_image()), "image/png")})
    assert res.status_code == 401


def test_read_card_accepts_25_mb(client, auth):
    data = png(noise_image())
    data += b"\0" * (25 * 1024 * 1024 - len(data))
    assert post(client, auth, data).status_code == 200


def test_read_card_rejects_over_25_mb(client, auth):
    res = post(client, auth, b"x" * (25 * 1024 * 1024 + 1))
    assert res.status_code == 413
    assert res.json()["error"]["code"] == "IMAGE_TOO_LARGE"


def test_read_card_rejects_non_image(client, auth):
    res = post(client, auth, b"not an image", "c.txt", "text/plain")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_IMAGE"


def test_read_card_does_not_write_files(client, auth, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert post(client, auth, png(noise_image())).status_code == 200
    assert os.listdir(tmp_path) == []
