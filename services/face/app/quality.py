import cv2
import numpy as np

from app.config import Settings
from app.engine import DetectedFace
from app.errors import FaceError

# ต่ำกว่านี้ถือว่าไม่ใช่หน้าคน ไม่นับเลย (เช่นลายเสื้อ เงา)
MIN_FACE_SCORE = 0.5


def face_size(bbox: tuple[float, float, float, float]) -> float:
    """ด้านสั้นของกรอบหน้า (พิกเซล)"""
    x1, y1, x2, y2 = bbox
    return min(x2 - x1, y2 - y1)


# ย่อ/ขยายหน้าให้ด้านสั้นเท่ากันก่อนวัดความคม ไม่งั้นรูปความละเอียดสูง
# (หน้ากว้างหลายร้อยพิกเซล) จะได้ค่าต่ำจนถูกตัดสินว่าเบลอทั้งที่ชัด
SHARPNESS_FACE_PX = 112
# กรอบที่โดนขอบภาพตัดจนเล็กหรือแบนเกินไปไม่ใช่หน้าที่ใช้ได้ (และกันการขยายภาพจนกินหน่วยความจำ)
MIN_CROP_PX = 16
MAX_ASPECT = 4


def sharpness(image: np.ndarray, bbox: tuple[float, float, float, float]) -> float:
    """ความคมชัดของบริเวณหน้า (variance of Laplacian) ยิ่งน้อยยิ่งเบลอ"""
    height, width = image.shape[:2]
    x1, y1, x2, y2 = bbox
    left, top = max(int(x1), 0), max(int(y1), 0)
    right, bottom = min(int(x2), width), min(int(y2), height)
    short, long = sorted((right - left, bottom - top))
    if short < MIN_CROP_PX or long > short * MAX_ASPECT:
        return 0.0
    gray = cv2.cvtColor(image[top:bottom, left:right], cv2.COLOR_BGR2GRAY)
    scale = SHARPNESS_FACE_PX / min(gray.shape)
    size = (max(round(gray.shape[1] * scale), 1), max(round(gray.shape[0] * scale), 1))
    interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
    gray = cv2.resize(gray, size, interpolation=interpolation)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def real_faces(faces: list[DetectedFace]) -> list[DetectedFace]:
    return [face for face in faces if face.det_score >= MIN_FACE_SCORE]


def pick_enrollment_face(
    faces: list[DetectedFace], image: np.ndarray, settings: Settings
) -> DetectedFace:
    """รูปลงทะเบียนต้องมีหน้าเดียวที่ชัดพอ ไม่งั้นบอกเหตุผลให้ถ่ายใหม่"""
    candidates = real_faces(faces)
    if not candidates:
        raise FaceError(422, "NO_FACE", "ไม่เจอหน้าในรูป")
    if len(candidates) > 1:
        raise FaceError(422, "MULTIPLE_FACES", "มีหลายคนในรูป ถ่ายให้มีแค่คนเดียว")

    face = candidates[0]
    if face_size(face.bbox) < settings.enroll_min_face_px:
        raise FaceError(422, "FACE_TOO_SMALL", "หน้าเล็กไป ขยับเข้ามาใกล้กล้องอีกหน่อย")
    if face.det_score < settings.enroll_min_det_score:
        raise FaceError(422, "LOW_QUALITY", "หน้าไม่ชัด ลองถ่ายในที่สว่างกว่านี้")
    if sharpness(image, face.bbox) < settings.enroll_min_sharpness:
        raise FaceError(422, "BLURRY", "รูปเบลอ ถือให้นิ่งแล้วถ่ายใหม่")
    return face
