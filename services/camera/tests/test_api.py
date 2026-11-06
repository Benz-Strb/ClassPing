from datetime import UTC, datetime

import httpx
import pytest

from camera.api import ApiDown, BadToken, CameraApi, Stream


def api_with(handler) -> CameraApi:
    return CameraApi("http://api.test", "tok", transport=httpx.MockTransport(handler))


def test_session_sends_token_and_parses():
    def handler(request: httpx.Request):
        assert request.headers["X-Camera-Token"] == "tok"
        assert request.url.path == "/camera/session"
        return httpx.Response(
            200,
            json={
                "data": {
                    "session": {
                        "id": "s1",
                        "courseCode": "EXAMPLE101",
                        "courseName": "test",
                        "startsAt": "2026-10-23T05:00:00.000Z",
                        "endsAt": "2026-10-23T11:00:00.000Z",
                    },
                    "fps": 1,
                }
            },
        )

    current = api_with(handler).session()
    assert current is not None
    assert current.id == "s1"
    assert current.course == "EXAMPLE101 test"
    assert current.ends_at == datetime(2026, 10, 23, 11, 0, tzinfo=UTC)
    assert current.fps == 1


def test_no_session():
    api = api_with(lambda r: httpx.Response(200, json={"data": {"session": None, "fps": 1}}))
    assert api.session() is None


def test_send_results():
    codes = {202: "queued", 429: "busy", 409: "no_session"}
    for status, expected in codes.items():
        api = api_with(lambda r, s=status: httpx.Response(s, json={}))
        assert api.send(b"\xff\xd8\xff") == expected


def test_send_is_multipart_jpeg():
    def handler(request: httpx.Request):
        body = request.read()
        assert b'name="image"' in body and b"image/jpeg" in body
        return httpx.Response(202, json={"data": {"queued": True}})

    assert api_with(handler).send(b"\xff\xd8\xff") == "queued"


def test_401_is_bad_token():
    with pytest.raises(BadToken):
        api_with(lambda r: httpx.Response(401, json={})).session()


def test_server_error_or_no_connection_is_api_down():
    with pytest.raises(ApiDown):
        api_with(lambda r: httpx.Response(503, json={})).send(b"x")

    def refuse(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(ApiDown):
        api_with(refuse).session()


def test_session_with_stream_uses_url_from_api_without_camera_token():
    def handler(request: httpx.Request):
        return httpx.Response(
            200,
            json={
                "data": {
                    "session": {
                        "id": "s1",
                        "courseCode": "EXAMPLE101",
                        "courseName": "test",
                        "startsAt": "2026-10-23T05:00:00.000Z",
                        "endsAt": "2026-10-23T11:00:00.000Z",
                    },
                    "fps": 1,
                    "stream": {
                        "url": "rtsp://media:8554/cam/c1?token=short",
                        "fps": 15,
                        "bitrateKbps": 1500,
                    },
                }
            },
        )

    current = api_with(handler).session()
    assert current is not None
    assert current.stream == Stream(
        url="rtsp://media:8554/cam/c1?token=short", fps=15, bitrate_kbps=1500
    )


def test_session_without_stream_field_is_none():
    def handler(request: httpx.Request):
        return httpx.Response(
            200,
            json={
                "data": {
                    "session": {
                        "id": "s1",
                        "courseCode": "X",
                        "courseName": "",
                        "startsAt": "2026-10-23T05:00:00.000Z",
                        "endsAt": "2026-10-23T11:00:00.000Z",
                    },
                    "fps": 1,
                }
            },
        )

    current = api_with(handler).session()
    assert current is not None and current.stream is None


def test_door_sends_direction_and_images():
    def handler(request: httpx.Request):
        body = request.read()
        assert request.url.path == "/camera/door"
        assert b'name="direction"' in body and b"out" in body
        assert body.count(b'name="images"') == 2
        return httpx.Response(201, json={"data": {"trip": "matched"}})

    assert api_with(handler).door("out", [b"\xff\xd8a", b"\xff\xd8b"]) == "matched"


def test_door_in_without_images_has_no_trip():
    api = api_with(lambda r: httpx.Response(201, json={"data": {"trip": None}}))
    assert api.door("in", []) is None


def test_door_no_session_is_none_and_bad_token_raises():
    assert api_with(lambda r: httpx.Response(409, json={})).door("out", []) is None
    with pytest.raises(BadToken):
        api_with(lambda r: httpx.Response(401, json={})).door("out", [])


def test_door_429_is_api_down_not_crash():
    with pytest.raises(ApiDown):
        api_with(lambda r: httpx.Response(429, json={})).door("out", [])


def test_door_uses_longer_timeout():
    seen = {}

    def handler(request: httpx.Request):
        seen.update(request.extensions["timeout"])
        return httpx.Response(201, json={"data": {"trip": None}})

    api_with(handler).door("in", [])
    assert seen["read"] == 30
