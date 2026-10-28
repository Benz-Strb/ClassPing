"""เปรียบเทียบ OCR ด้วยเอกสารสมมติ ไม่อ่านเอกสารผู้ใช้หรือฐานข้อมูล"""
import argparse
import io
import json
import os
import time
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.documents import document_frames
from app.ocr import PaddleTextReader
from app.typhoon_ocr import TyphoonTextReader

TEXT = 'ใบลาป่วย นักศึกษา\n27/10/2569'


def normalized(text: str) -> str:
    return ''.join(unicodedata.normalize('NFC', text).split())


def character_error_rate(expected: str, actual: str) -> float:
    """Levenshtein / จำนวนอักขระอ้างอิง; ไม่ตัดวรรณยุกต์หรือจัดลำดับใหม่"""
    expected, actual = normalized(expected), normalized(actual)
    if not expected:
        raise ValueError('ข้อความอ้างอิงต้องไม่ว่าง')
    previous = list(range(len(actual) + 1))
    for i, left in enumerate(expected, 1):
        current = [i]
        for j, right in enumerate(actual, 1):
            current.append(min(current[-1] + 1, previous[j] + 1,
                               previous[j - 1] + (left != right)))
        previous = current
    return previous[-1] / len(expected)


def samples(font_path: str):
    font = ImageFont.truetype(font_path, 36)
    image = Image.new('RGB', (700, 200), 'white')
    drawing = ImageDraw.Draw(image)
    for index, line in enumerate(TEXT.splitlines()):
        drawing.text((30, 25 + index * 80), line, font=font, fill='black')
    for fmt in ['PNG', 'JPEG', 'PDF']:
        buffer = io.BytesIO()
        image.save(buffer, format=fmt)
        yield fmt, buffer.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', choices=['paddle', 'typhoon', 'both'], default='both')
    parser.add_argument('--font', default='/System/Library/Fonts/Supplemental/SukhumvitSet.ttc')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not Path(args.font).is_file():
        parser.error('ไม่พบฟอนต์ภาษาไทย ให้ระบุ --font เป็น path ของฟอนต์ในเครื่อง')
    engines = {}
    blocked = {}
    initialization = {}
    if args.engine in ('typhoon', 'both'):
        if os.getenv('TYPHOON_OCR_API_KEY', '').strip():
            engines['typhoon-ocr-1.5'] = TyphoonTextReader()
        else:
            blocked['typhoon-ocr-1.5'] = 'ยังไม่มี TYPHOON_OCR_API_KEY; ไม่ได้เรียก API'
    if args.engine in ('paddle', 'both'):
        started = time.perf_counter()
        engines['paddleocr'] = PaddleTextReader()
        initialization['paddleocr'] = round(time.perf_counter() - started, 3)
    results = []
    for fmt, data in samples(args.font):
        # ทั้งคู่รับภาพจาก renderer เดียวกัน; SDK Typhoon ยังมี preprocessing ของตัวเอง
        frames = list(document_frames(data)) if engines else []
        for name, engine in engines.items():
            started = time.perf_counter()
            try:
                parts = []
                for frame in frames:
                    output = engine.read(frame)
                    parts.append(output if isinstance(output, str)
                                 else '\n'.join(text for text, _score in output))
                output = '\n'.join(parts)
                results.append({
                    'format': fmt, 'engine': name, 'status': 'ok', 'text': output,
                    'cer': character_error_rate(TEXT, output),
                    'seconds': round(time.perf_counter() - started, 3),
                    'date_exact': '27/10/2569' in output,
                })
            except Exception as error:  # noqa: BLE001 — บันทึกแต่ละเคสที่ล้มเหลวโดยไม่เปิดเผยคีย์
                # ไม่บันทึก response หรือข้อความ exception ที่อาจมี credential
                results.append({'format': fmt, 'engine': name, 'status': 'error',
                                'error_type': type(error).__name__})
    report = {
        'reference': TEXT, 'font': args.font, 'results': results,
        'blocked': blocked, 'initialization_seconds': initialization,
        'method': 'CER: NFC + ลบ whitespace; ยิ่งต่ำยิ่งดี; ไม่แก้ลำดับบรรทัด/Markdown',
        'limitations': [
            'เอกสารสมมติเดียวใน 3 formats ไม่เพียงพอตัดสินว่าโมเดลใดดีที่สุด',
            'Paddle รัน CPU ในเครื่อง; Typhoon ผ่าน cloud รวมเวลาเครือข่าย',
            'เวลาไม่รวม initialization/rendering และ SDK Typhoon อาจแปลงภาพอีกครั้ง',
            'Typhoon คืน Markdown ไม่มี confidence ที่ใช้เทียบกับ Paddle ได้โดยตรง',
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if blocked or any(row['status'] != 'ok' for row in results) else 0


if __name__ == '__main__':
    raise SystemExit(main())
