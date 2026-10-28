"""แปลงหลักฐาน PDF/ภาพในหน่วยความจำ เฉพาะเส้นทางระบบลา"""
import math
from contextlib import closing
from threading import Lock

import cv2
import numpy as np
import pypdfium2 as pdfium

from app.errors import FaceError
from app.images import MAX_PIXELS, decode_image, invalid, too_large

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
MAX_PDF_PAGES = 10
# PDFium ไม่รองรับการเรียกพร้อมกันหลายเธรด
PDF_LOCK = Lock()


def document_frames(data: bytes):
    if len(data) > MAX_DOCUMENT_BYTES:
        raise too_large('หลักฐานใหญ่เกิน 10 MB')
    if not data.startswith(b'%PDF-'):
        yield decode_image(data, MAX_DOCUMENT_BYTES)
        return
    try:
        with PDF_LOCK, closing(pdfium.PdfDocument(data)) as document:
            if not 1 <= len(document) <= MAX_PDF_PAGES:
                raise FaceError(400, 'INVALID_IMAGE', 'PDF ต้องมี 1–10 หน้า')
            # ตรวจทุกหน้าก่อนเริ่ม OCR และก่อนจัดสรร bitmap
            for index in range(len(document)):
                with closing(document[index]) as page:
                    width, height = page.get_size()
                    if math.ceil(width * 2) * math.ceil(height * 2) > MAX_PIXELS:
                        raise too_large('หน้า PDF ใหญ่เกินไป')
            for index in range(len(document)):
                with closing(document[index]) as page, closing(page.render(scale=2)) as bitmap:
                    frame = cv2.cvtColor(np.array(bitmap.to_pil().convert('RGB')),
                                         cv2.COLOR_RGB2BGR)
                yield frame
    except pdfium.PdfiumError:
        raise invalid() from None
