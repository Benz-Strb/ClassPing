from collections.abc import Mapping
from dataclasses import dataclass

MIN_TOKEN_LENGTH = 32


@dataclass(frozen=True)
class Settings:
    token: str
    model: str = "buffalo_l"
    det_size: int = 640
    provider: str = "cpu"
    enroll_min_face_px: int = 112
    enroll_min_det_score: float = 0.6
    enroll_min_sharpness: float = 40.0
    detect_min_face_px: int = 40
    max_image_bytes: int = 5 * 1024 * 1024


def load_settings(env: Mapping[str, str]) -> Settings:
    token = env.get("FACE_SERVICE_TOKEN", "").strip()
    if len(token) < MIN_TOKEN_LENGTH:
        raise ValueError(f"ต้องตั้ง FACE_SERVICE_TOKEN ใน .env ยาวอย่างน้อย {MIN_TOKEN_LENGTH} ตัว")

    def get(name: str, default, cast):
        raw = env.get(name, "").strip()
        return cast(raw) if raw else default

    defaults = Settings(token=token)
    return Settings(
        token=token,
        model=get("FACE_MODEL", defaults.model, str),
        det_size=get("FACE_DET_SIZE", defaults.det_size, int),
        provider=get("FACE_PROVIDER", defaults.provider, str),
        enroll_min_face_px=get("ENROLL_MIN_FACE_PX", defaults.enroll_min_face_px, int),
        enroll_min_det_score=get("ENROLL_MIN_DET_SCORE", defaults.enroll_min_det_score, float),
        enroll_min_sharpness=get("ENROLL_MIN_SHARPNESS", defaults.enroll_min_sharpness, float),
        detect_min_face_px=get("DETECT_MIN_FACE_PX", defaults.detect_min_face_px, int),
        max_image_bytes=get("MAX_IMAGE_BYTES", defaults.max_image_bytes, int),
    )
