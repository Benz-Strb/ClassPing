import hmac
import os

from fastapi import FastAPI, Request, UploadFile

from app.config import Settings, load_settings
from app.engine import DetectedFace, FaceEngine, InsightFaceEngine
from app.errors import error_response, install_error_handlers
from app.images import decode_image, read_upload
from app.quality import face_size, pick_enrollment_face, real_faces, sharpness

PUBLIC_PATHS = {"/health"}


def pose_json(face: DetectedFace) -> dict | None:
    if face.pose is None:
        return None
    pitch, yaw, roll = face.pose
    return {"pitch": pitch, "yaw": yaw, "roll": roll}


def create_app(settings: Settings, engine: FaceEngine) -> FastAPI:
    app = FastAPI(title="ClassPing face service", docs_url=None, redoc_url=None)
    install_error_handlers(app)

    @app.middleware("http")
    async def require_token(request: Request, call_next):
        if request.url.path not in PUBLIC_PATHS:
            given = request.headers.get("x-face-token", "")
            if not hmac.compare_digest(given.encode(), settings.token.encode()):
                return error_response(401, "UNAUTHORIZED", "ไม่มีสิทธิ์เรียกระบบตรวจใบหน้า")
        return await call_next(request)

    @app.get("/health")
    def health():
        return {
            "data": {
                "ok": True,
                "model": engine.model_name,
                "embeddingSize": engine.embedding_size,
            }
        }

    # route แบบ def ธรรมดา FastAPI จะรันใน threadpool โมเดลจึงไม่บล็อก event loop
    @app.post("/faces/enroll")
    def enroll(image: UploadFile):
        frame = decode_image(
            read_upload(image.file, settings.max_image_bytes), settings.max_image_bytes
        )
        face = pick_enrollment_face(engine.analyze(frame), frame, settings)
        return {
            "data": {
                "embedding": face.embedding.tolist(),
                "bbox": list(face.bbox),
                "detScore": face.det_score,
                "pose": pose_json(face),
                "sharpness": sharpness(frame, face.bbox),
                "model": engine.model_name,
            }
        }

    @app.post("/faces/detect")
    def detect(image: UploadFile):
        frame = decode_image(
            read_upload(image.file, settings.max_image_bytes), settings.max_image_bytes
        )
        faces = sorted(real_faces(engine.analyze(frame)), key=lambda f: -face_size(f.bbox))
        usable = [f for f in faces if face_size(f.bbox) >= settings.detect_min_face_px]
        height, width = frame.shape[:2]
        return {
            "data": {
                "width": width,
                "height": height,
                "faces": [
                    {
                        "bbox": list(face.bbox),
                        "detScore": face.det_score,
                        "embedding": face.embedding.tolist(),
                        "pose": pose_json(face),
                    }
                    for face in usable
                ],
                # หน้าเล็กเกินไปเทียบแล้วไม่แม่น นับไว้ให้รู้ว่ากล้องอาจอยู่ไกลไป
                "skippedSmall": len(faces) - len(usable),
            }
        }

    return app


def build_app() -> FastAPI:
    """ใช้ตอนรันจริง: uvicorn --factory app.main:build_app (โหลดโมเดลตอนเปิด service)"""
    settings = load_settings(os.environ)
    return create_app(settings, InsightFaceEngine(settings))
