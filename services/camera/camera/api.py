from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote

import httpx

TIMEOUT_SECONDS = 10


class BadToken(Exception):
    """token กล้องผิด รันต่อไปก็ไม่มีประโยชน์"""


class ApiDown(Exception):
    """ต่อ API ไม่ได้หรือ API มีปัญหา รอแล้วลองใหม่"""


@dataclass(frozen=True)
class Stream:
    """ที่ส่งวิดีโอดูสด/อัดเก็บ url มี token กล้องแล้ว ห้าม log ตรง ๆ"""

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
        self._token = token
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
            # media server ถามสิทธิ์จาก API ด้วย token กล้องตัวเดียวกัน
            stream=Stream(
                url=f"{stream['url']}?token={quote(self._token, safe='')}",
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
