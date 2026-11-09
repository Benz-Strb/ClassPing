"""Typhoon OCR 1.5 รันในเครื่องด้วย MLX (Mac ชิป Apple) เอกสารไม่ออกนอกเครื่อง"""
import re
import threading
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

# วัดกับใบรับรองแพทย์: ด้านยาว 1280 เร็วกว่า 1705 ราว 1.5 เท่า ช่องในฟอร์มลายังอ่านได้ครบ
LONG_SIDE = 1280
MAX_TOKENS = 4096
# ค่าที่หน้าโมเดลแนะนำ กันการวนเขียนซ้ำ
REPETITION_PENALTY = 1.1

FIGURE = re.compile(r'<figure>.*?</figure>', re.DOTALL)
SIGNATURE = re.compile(r'^\(ลายเซ็น\)\s*$')
MARKDOWN = re.compile(r'^\s{0,3}#{1,6}\s+|\*\*')


def clean_text(text: str) -> str:
    """ตัดคำอธิบายรูป ป้ายลายเซ็น และเครื่องหมาย markdown ที่โมเดลใส่มา

    โมเดลมักวนเขียนบล็อกท้ายเอกสารซ้ำ จึงตัดบรรทัดที่ซ้ำกับบรรทัดก่อนหน้าออกด้วย
    บรรทัดที่ซ้ำแบบมีเว้นบรรทัดอื่นคั่น เช่น โทร. ของสำนักงานใหญ่กับสาขา เก็บไว้
    """
    lines = []
    for line in FIGURE.sub('', text).splitlines():
        line = MARKDOWN.sub('', line).rstrip()
        if SIGNATURE.match(line):
            continue
        if line.strip() and lines and line.strip() == lines[-1].strip():
            continue
        lines.append(line)
    return '\n'.join(lines).strip()


def resize(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    scale = LONG_SIDE / max(height, width)
    if scale >= 1:
        return image
    return cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)


class MlxTyphoonReader:
    def __init__(self, model_path: str):
        # MLX ผูก GPU stream ไว้กับ thread ที่โหลดโมเดล ให้ทุกงานรันใน thread เดียวนี้
        self._worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix='typhoon-mlx')
        self._lock = threading.Lock()
        self._worker.submit(self._load, model_path).result()

    def _load(self, model_path: str):
        from mlx_vlm import load
        from mlx_vlm.prompt_utils import apply_chat_template
        from mlx_vlm.utils import load_config
        from typhoon_ocr.ocr_utils import get_prompt

        self._model, self._processor = load(model_path)
        self._prompt = apply_chat_template(
            self._processor, load_config(model_path),
            get_prompt('v1.5')(figure_language='Thai'), num_images=1,
        )

    def _generate(self, image: np.ndarray) -> str:
        from mlx_vlm import generate
        from PIL import Image

        rgb = cv2.cvtColor(resize(image), cv2.COLOR_BGR2RGB)
        result = generate(
            self._model, self._processor, self._prompt, [Image.fromarray(rgb)],
            max_tokens=MAX_TOKENS, temperature=0.0, repetition_penalty=REPETITION_PENALTY,
            verbose=False,
        )
        return result.text

    def read(self, image: np.ndarray) -> str:
        with self._lock:
            return clean_text(self._worker.submit(self._generate, image).result())
