"""แปลงหลักฐาน PDF/ภาพในหน่วยความจำ เฉพาะเส้นทางระบบลา"""
import math
from contextlib import closing
from threading import Lock

import cv2
import numpy as np
import pypdfium2 as pdfium

from app.errors import FaceError
from app.images import MAX_PIXELS, decode_image, invalid, too_large

MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
MAX_PDF_PAGES = 10
# PDFium ไม่รองรับการเรียกพร้อมกันหลายเธรด
PDF_LOCK = Lock()


def document_frames(data: bytes, max_pages: int = MAX_PDF_PAGES):
    if len(data) > MAX_DOCUMENT_BYTES:
        raise too_large('หลักฐานใหญ่เกิน 25 MB')
    if not data.startswith(b'%PDF-'):
        yield decode_image(data, MAX_DOCUMENT_BYTES)
        return
    document = None
    try:
        with PDF_LOCK:
            document = pdfium.PdfDocument(data)
            page_count = len(document)
            if not 1 <= page_count <= max_pages:
                raise FaceError(400, 'INVALID_IMAGE', f'PDF ต้องมี 1–{max_pages} หน้า')
            # ตรวจทุกหน้าก่อนเริ่ม OCR และก่อนจัดสรร bitmap
            for index in range(page_count):
                with closing(document[index]) as page:
                    width, height = page.get_size()
                    if math.ceil(width * 2) * math.ceil(height * 2) > MAX_PIXELS:
                        raise too_large('หน้า PDF ใหญ่เกินไป')
        for index in range(page_count):
            with PDF_LOCK, closing(document[index]) as page, closing(page.render(scale=2)) as bitmap:
                pixels = np.array(bitmap.to_pil().convert('RGB'))
            yield cv2.cvtColor(pixels, cv2.COLOR_RGB2BGR)
    except pdfium.PdfiumError:
        raise invalid() from None
    finally:
        if document is not None:
            with PDF_LOCK:
                document.close()
