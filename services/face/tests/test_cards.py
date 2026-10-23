import os

from tests.conftest import fake_face
from tests.images import noise_image, png

CARD_LINES = [
    ("66112106", 1.0),
    ("System Generate Date : 23-10-2569", 0.978),
    ("OFFICIAL STUDENT VIRTUAL ID", 0.998),
]


def post(client, auth, body: bytes, name: str = "card.png", mime: str = "image/png"):
    return client.post("/cards/read", headers=auth, files={"image": (name, body, mime)})


def test_read_card_returns_lines_and_faces(client, auth, engine, reader):
    reader.lines = CARD_LINES
    small = fake_face(bbox=(10.0, 10.0, 40.0, 40.0), seed=1)  # หน้าเล็กในบัตรก็ต้องได้
    large = fake_face(bbox=(100.0, 100.0, 220.0, 240.0), seed=2)
    noise = fake_face(bbox=(0.0, 300.0, 100.0, 400.0), det_score=0.3, seed=3)
    engine.faces = [small, noise, large]

    res = post(client, auth, png(noise_image()))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["lines"] == [{"text": t, "score": s} for t, s in CARD_LINES]
    assert [f["bbox"] for f in data["faces"]] == [list(large.bbox), list(small.bbox)]
    assert len(data["faces"][0]["embedding"]) == 512
    assert "crop" not in data["faces"][0]


def test_read_card_requires_token(client):
    res = client.post("/cards/read", files={"image": ("c.png", png(noise_image()), "image/png")})
    assert res.status_code == 401


def test_read_card_rejects_non_image(client, auth):
    res = post(client, auth, b"not an image", "c.txt", "text/plain")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_IMAGE"


def test_read_card_does_not_write_files(client, auth, tmp_path, monkeypatch, reader):
    reader.lines = CARD_LINES
    monkeypatch.chdir(tmp_path)
    assert post(client, auth, png(noise_image())).status_code == 200
    assert os.listdir(tmp_path) == []
