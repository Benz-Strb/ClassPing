import base64
import hmac
import os

import numpy as np
from fastapi import FastAPI, Request, UploadFile
from pydantic import BaseModel, model_validator

from app.config import Settings, load_settings
from app.crops import face_crop
from app.engine import DetectedFace, FaceEngine, InsightFaceEngine
from app.errors import FaceError, error_response, install_error_handlers
from app.images import decode_image, read_upload
from app.matching import match
from app.ocr import PaddleTextReader, TextReader
from app.quality import face_size, pick_enrollment_face, real_faces, sharpness

PUBLIC_PATHS = {"/health"}

# ห้องเรียนหนึ่งไม่เกินราว 50 หน้าต่อเฟรม รายชื่อไม่เกิน 500 คน ลงทะเบียนไม่เกิน 10 มุมต่อคน
MAX_PROBES = 50
MAX_CANDIDATES = 500
MAX_EMBEDDINGS_PER_PERSON = 10


def pose_json(face: DetectedFace) -> dict | None:
    if face.pose is None:
        return None
    pitch, yaw, roll = face.pose
    return {"pitch": pitch, "yaw": yaw, "roll": roll}


def detected_json(face: DetectedFace, frame: np.ndarray | None) -> dict:
    data = {
        "bbox": list(face.bbox),
        "detScore": face.det_score,
        "embedding": face.embedding.tolist(),
        "pose": pose_json(face),
    }
    if frame is not None:
        crop = face_crop(frame, face.bbox)
        data["crop"] = None if crop is None else base64.b64encode(crop).decode("ascii")
    return data


# ส่วนหัว multipart (boundary, ชื่อไฟล์) เผื่อไว้นอกเหนือจากขนาดรูป
MULTIPART_OVERHEAD = 64 * 1024


def check_body_size(request: Request, settings: Settings):
    """จำกัดขนาด request จาก Content-Length ก่อนอ่าน body กันข้อมูลก้อนใหญ่กินหน่วยความจำ"""
    length = request.headers.get("content-length")
    if length is None or not length.isdigit():
        return error_response(411, "LENGTH_REQUIRED", "ต้องระบุขนาดข้อมูลที่ส่ง")
    is_upload = request.headers.get("content-type", "").startswith("multipart/")
    limit = settings.max_image_bytes + MULTIPART_OVERHEAD if is_upload else settings.max_json_bytes
    if int(length) > limit:
        return error_response(413, "REQUEST_TOO_LARGE", "ข้อมูลที่ส่งมาใหญ่เกินไป")
    return None


def create_app(settings: Settings, engine: FaceEngine, reader: TextReader) -> FastAPI:
    app = FastAPI(title="ClassPing face service", docs_url=None, redoc_url=None)
    install_error_handlers(app)

    @app.middleware("http")
    async def require_token(request: Request, call_next):
        if request.url.path not in PUBLIC_PATHS:
            given = request.headers.get("x-face-token", "")
            if not hmac.compare_digest(given.encode(), settings.token.encode()):
                return error_response(401, "UNAUTHORIZED", "ไม่มีสิทธิ์เรียกระบบตรวจใบหน้า")
        if request.method == "POST":
            rejected = check_body_size(request, settings)
            if rejected is not None:
                return rejected
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
        crop = face_crop(frame, face.bbox)
        return {
            "data": {
                # เก็บแค่รูปครอปหน้า ไม่เก็บรูปเต็ม อาจารย์ดูออกว่าใครและไม่มีพื้นหลังติดไป
                "crop": None if crop is None else base64.b64encode(crop).decode("ascii"),
                "embedding": face.embedding.tolist(),
                "bbox": list(face.bbox),
                "detScore": face.det_score,
                "pose": pose_json(face),
                "sharpness": sharpness(frame, face.bbox),
                "model": engine.model_name,
            }
        }

    # crops=1 แนบรูปครอปหน้า (JPEG base64) ไว้ให้ API เก็บเป็นหลักฐานเช็คชื่อ
    @app.post("/faces/detect")
    def detect(image: UploadFile, crops: bool = False):
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
                "faces": [detected_json(face, frame if crops else None) for face in usable],
                # หน้าเล็กเกินไปเทียบแล้วไม่แม่น นับไว้ให้รู้ว่ากล้องอาจอยู่ไกลไป
                "skippedSmall": len(faces) - len(usable),
            }
        }

    # บัตรนักศึกษา: ตัวหนังสือทุกบรรทัด + หน้าในบัตร ให้ API ตัดสินเอง
    # ภาพอยู่ในหน่วยความจำอย่างเดียว ไม่บันทึกและไม่ log ข้อความที่อ่านได้
    @app.post("/cards/read")
    def read_card(image: UploadFile):
        frame = decode_image(
            read_upload(image.file, settings.max_image_bytes), settings.max_image_bytes
        )
        faces = sorted(real_faces(engine.analyze(frame)), key=lambda f: -face_size(f.bbox))
        return {
            "data": {
                "lines": [{"text": text, "score": score} for text, score in reader.read(frame)],
                "faces": [detected_json(face, None) for face in faces],
            }
        }

    @app.post("/leave/ocr")
    def read_leave_document(image: UploadFile):
        frame = decode_image(
            read_upload(image.file, settings.max_image_bytes), settings.max_image_bytes
        )
        return {
            "data": {
                "lines": [
                    {"text": text, "score": score} for text, score in reader.read(frame)
                ]
            }
        }

    @app.post("/faces/match")
    def match_faces(body: MatchRequest):
        probes = parse_embeddings(body.probes, engine.embedding_size)
        candidates = [
            (c.id, parse_embeddings(c.embeddings, engine.embedding_size)) for c in body.candidates
        ]
        return {
            "data": {
                "results": [
                    {
                        "bestId": r.best_id,
                        "score": r.score,
                        "secondId": r.second_id,
                        "secondScore": r.second_score,
                    }
                    for r in match(probes, candidates)
                ]
            }
        }

    return app


class Candidate(BaseModel):
    id: str
    embeddings: list[list[float]]


class MatchRequest(BaseModel):
    probes: list[list[float]]
    candidates: list[Candidate]

    @model_validator(mode="after")
    def check_limits(self):
        too_many = (
            len(self.probes) > MAX_PROBES
            or len(self.candidates) > MAX_CANDIDATES
            or any(len(c.embeddings) > MAX_EMBEDDINGS_PER_PERSON for c in self.candidates)
        )
        if too_many:
            raise FaceError(
                422,
                "TOO_MANY_ITEMS",
                f"ส่งได้ไม่เกิน {MAX_PROBES} หน้า, {MAX_CANDIDATES} คน "
                f"และ {MAX_EMBEDDINGS_PER_PERSON} มุมต่อคน",
            )
        return self


def parse_embeddings(rows: list[list[float]], size: int) -> np.ndarray:
    bad = FaceError(422, "BAD_EMBEDDING", f"ข้อมูลใบหน้าต้องเป็นตัวเลข {size} ค่าที่ไม่เป็นศูนย์")
    if not rows or any(len(row) != size for row in rows):
        raise bad
    vectors = np.asarray(rows, dtype=np.float32)
    if not np.isfinite(vectors).all() or (np.linalg.norm(vectors, axis=1) == 0).any():
        raise bad
    return vectors


def build_app() -> FastAPI:
    """ใช้ตอนรันจริง: uvicorn --factory app.main:build_app (โหลดโมเดลตอนเปิด service)"""
    settings = load_settings(os.environ)
    return create_app(settings, InsightFaceEngine(settings), PaddleTextReader())
