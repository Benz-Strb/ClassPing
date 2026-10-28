"""ตัวอ่าน Typhoon OCR 1.5 สำหรับระบบลาและชุดเปรียบเทียบ"""
import os
from pathlib import Path
from tempfile import TemporaryDirectory

import cv2
import numpy as np


class TyphoonTextReader:
    def __init__(self, api_key: str | None = None):
        self.api_key = (api_key or os.getenv('TYPHOON_OCR_API_KEY', '')).strip()
        if not self.api_key:
            raise ValueError('ต้องตั้ง TYPHOON_OCR_API_KEY ก่อนเรียก Typhoon OCR')

    def read(self, image: np.ndarray) -> str:
        from typhoon_ocr import ocr_document

        # SDK รับ path; ไฟล์นี้อยู่ชั่วคราวและถูกลบทั้งกรณีสำเร็จและเกิด error
        with TemporaryDirectory(prefix='classping-ocr-') as directory:
            path = Path(directory) / 'page.png'
            if not cv2.imwrite(str(path), image):
                raise ValueError('สร้างภาพสำหรับ Typhoon OCR ไม่สำเร็จ')
            text = ocr_document(
                pdf_or_image_path=str(path), api_key=self.api_key,
                base_url='https://api.opentyphoon.ai/v1',
                model='typhoon-ocr', task_type='v1.5',
                target_image_dim=max(image.shape[:2]),
            )
        if not isinstance(text, str):
            raise TypeError('Typhoon OCR ไม่ได้ส่งข้อความกลับมา')
        # Typhoon ไม่ได้ส่ง confidence จึงไม่สร้างคะแนนความมั่นใจขึ้นเอง
        return text
