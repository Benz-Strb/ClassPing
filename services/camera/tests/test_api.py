from datetime import UTC, datetime

import httpx
import pytest

from camera.api import ApiDown, BadToken, CameraApi


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
