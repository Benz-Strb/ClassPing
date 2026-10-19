from tests.conftest import fake_face
from tests.images import jpeg, noise_image


def post(client, auth, body: bytes):
    return client.post(
        "/faces/detect", headers=auth, files={"image": ("f.jpg", body, "image/jpeg")}
    )


def test_detect_empty_frame(client, auth):
    res = post(client, auth, jpeg(noise_image(size=200)))
    assert res.status_code == 200
    assert res.json() == {"data": {"width": 200, "height": 200, "faces": [], "skippedSmall": 0}}


def test_detect_sorts_and_skips_small(client, auth, engine):
    small = fake_face(bbox=(10.0, 10.0, 40.0, 40.0), seed=1)  # ด้านสั้น 30 < 40
    medium = fake_face(bbox=(100.0, 100.0, 160.0, 170.0), seed=2)
    large = fake_face(bbox=(200.0, 200.0, 400.0, 420.0), seed=3, pose=None)
    noise = fake_face(bbox=(0.0, 300.0, 100.0, 400.0), det_score=0.3, seed=4)
    engine.faces = [small, medium, noise, large]

    res = post(client, auth, jpeg(noise_image()))
    data = res.json()["data"]
    assert [f["bbox"] for f in data["faces"]] == [list(large.bbox), list(medium.bbox)]
    assert data["skippedSmall"] == 1
    assert data["faces"][0]["pose"] is None
    assert data["faces"][1]["pose"] == {"pitch": 0.0, "yaw": 0.0, "roll": 0.0}
    assert len(data["faces"][0]["embedding"]) == 512
    assert data["faces"][1]["detScore"] == 0.9


def test_detect_requires_token(client):
    res = client.post(
        "/faces/detect", files={"image": ("f.jpg", jpeg(noise_image()), "image/jpeg")}
    )
    assert res.status_code == 401


def test_detect_invalid_image(client, auth):
    res = post(client, auth, b"garbage")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_IMAGE"
