from dataclasses import dataclass
from datetime import datetime

import httpx

TIMEOUT_SECONDS = 10
# กล้องประตูให้ API ตรวจหน้าได้สูงสุด 3 รูป ใช้เวลานานกว่าปกติ ไม่ให้หมดเวลาแล้วส่งซ้ำ
DOOR_TIMEOUT_SECONDS = 30


class BadToken(Exception):
    """token กล้องผิด รันต่อไปก็ไม่มีประโยชน์"""


class ApiDown(Exception):
    """ต่อ API ไม่ได้หรือ API มีปัญหา รอแล้วลองใหม่"""


@dataclass(frozen=True)
class Stream:
    """ที่ส่งวิดีโอดูสด/อัดเก็บ url มี token ส่งวิดีโออายุสั้นจาก API ห้าม log ตรง ๆ"""

    url: str
    fps: int
    bitrate_kbps: int


@dataclass(frozen=True)
class Session:
    id: str
    course: str
    ends_at: datetime
    fps: float
    stream: Stream | None = None


class CameraApi:
    def __init__(self, base_url: str, token: str, transport: httpx.BaseTransport | None = None):
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"X-Camera-Token": token},
            timeout=TIMEOUT_SECONDS,
            transport=transport,
        )

    def session(self) -> Session | None:
        data = self._request("GET", "/camera/session").json()["data"]
        current = data["session"]
        if current is None:
            return None
        stream = data.get("stream")
        return Session(
            id=current["id"],
            course=f"{current['courseCode']} {current['courseName']}".strip(),
            ends_at=datetime.fromisoformat(current["endsAt"]),
            fps=float(data["fps"]),
            stream=Stream(
                url=stream["url"],
                fps=int(stream["fps"]),
                bitrate_kbps=int(stream["bitrateKbps"]),
            )
            if stream
            else None,
        )

    def send(self, frame: bytes) -> str:
        """คืน queued, busy (คิวเต็ม ข้ามภาพนี้) หรือ no_session (คาบจบแล้ว)"""
        res = self._request(
            "POST", "/camera/frames", files={"image": ("frame.jpg", frame, "image/jpeg")}
        )
        return {409: "no_session", 429: "busy"}.get(res.status_code, "queued")

    def door(self, direction: str, images: list[bytes]) -> str | None:
        """ส่งการข้ามเส้นที่ประตู คืนผลรอบนอกห้อง (trip) หรือ None ถ้าไม่มีคาบ/ทิศเข้า"""
        res = self._request(
            "POST",
            "/camera/door",
            data={"direction": direction},
            files=[("images", ("crop.jpg", image, "image/jpeg")) for image in images],
            timeout=DOOR_TIMEOUT_SECONDS,
        )
        if res.status_code == 409:
            return None
        if res.status_code == 429:
            raise ApiDown("API ตอบว่ายุ่งอยู่")
        return res.json()["data"]["trip"]

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        try:
            res = self._client.request(method, path, **kwargs)
        except httpx.HTTPError as error:
            raise ApiDown(f"ต่อ API ไม่ได้: {error}") from None
        if res.status_code == 401:
            raise BadToken("token กล้องไม่ถูกต้อง")
        if res.status_code >= 500:
            raise ApiDown(f"API ตอบ {res.status_code}")
        if res.status_code >= 400 and res.status_code not in (409, 429):
            raise ApiDown(f"API ตอบ {res.status_code}: {res.text[:200]}")
        return res
