import io

import cv2
import numpy as np
from PIL import Image

from app.errors import FaceError

# 16 ล้านพิกเซล (เช่น 4096x4096) ใหญ่กว่ากล้องมือถือและเว็บแคมทั่วไป
MAX_PIXELS = 16_000_000
# มือถือส่ง JPEG กล้องส่ง JPEG/PNG รับแค่นี้ ลดโอกาสที่ Pillow กับ OpenCV อ่านไฟล์ไม่ตรงกัน
ALLOWED_FORMATS = {"JPEG", "PNG"}


def too_large(message: str) -> FaceError:
    return FaceError(413, "IMAGE_TOO_LARGE", message)


def invalid() -> FaceError:
    return FaceError(400, "INVALID_IMAGE", "อ่านไฟล์รูปไม่ได้")


def decode_image(data: bytes, max_bytes: int) -> np.ndarray:
    """แปลงไฟล์รูปเป็นภาพ BGR ในหน่วยความจำ ไม่เขียนลงดิสก์

    ตรวจขนาดจาก header ก่อน decode กันไฟล์เล็กที่ขยายแล้วกินหน่วยความจำมหาศาล
    cv2.imdecode ไม่หมุนรูปตาม EXIF แอปมือถือต้องส่งรูปที่หมุนตรงแล้ว
    """
    if len(data) > max_bytes:
        raise too_large(f"รูปใหญ่เกิน {max_bytes / (1024 * 1024):g} MB")
    if not data:
        raise invalid()

    try:
        # Image.open อ่านแค่ header ยังไม่ decode ทั้งภาพ
        # ไฟล์เสียบางแบบ Pillow โยน ValueError ฯลฯ จึงจับทุกอย่างแล้วถือว่าอ่านรูปไม่ได้
        header = Image.open(io.BytesIO(data))
        image_format, (width, height) = header.format, header.size
    except Exception:  # noqa: BLE001 — ไฟล์จากผู้ใช้ เสียแบบไหนก็ต้องได้ 400 ไม่ใช่ 500
        raise invalid() from None
    if image_format not in ALLOWED_FORMATS:
        raise invalid()
    if width * height > MAX_PIXELS:
        raise too_large("รูปมีความละเอียดสูงเกินไป")

    try:
        image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    except cv2.error:
        image = None
    # OpenCV ต้องเห็นขนาดเดียวกับ header ที่ Pillow อ่าน (EXIF อาจสลับกว้าง/สูง)
    if image is None or sorted(image.shape[:2]) != sorted((width, height)):
        raise invalid()
    return image


def read_upload(file, max_bytes: int) -> bytes:
    """อ่านไฟล์ที่อัปโหลดไม่เกิน max_bytes + 1 ไบต์ เกินก็รู้แล้วว่าใหญ่ไป ไม่ต้องอ่านต่อ"""
    return file.read(max_bytes + 1)
