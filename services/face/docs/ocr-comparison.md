# ทดลอง PaddleOCR เทียบ Typhoon OCR 1.5

สถานะล่าสุด: ระบบลาใช้ Typhoon OCR 1.5 ผ่าน `TYPHOON_OCR_API_KEY` แล้ว ส่วนอ่านบัตรยังใช้ PaddleOCR รายงานเปรียบเทียบด้านล่างเป็นประวัติการทดลองด้วยเอกสารสมมติ ไม่เปลี่ยน schema

Typhoon คืน `score: null` เนื่องจากไม่มี confidence จากผู้ให้บริการ โดยยังส่งข้อความใน `data.lines` ตามรูปแบบเดิม ต้องตั้งคีย์ใน Face service ก่อนเริ่มบริการ เอกสารระบบลาจะถูกส่งไปประมวลผลที่ Typhoon cloud

## เตรียมคีย์

สร้างคีย์ที่ https://playground.opentyphoon.ai/ เมนู API Keys แล้วใส่ใน `services/face/.env` (ห้าม commit):

```dotenv
TYPHOON_OCR_API_KEY=คีย์ของคุณ
```

อ้างอิง: https://docs.opentyphoon.ai/en/ocr/ และ https://docs.opentyphoon.ai/en/quickstart/

## รันจาก `services/face`

```sh
uv sync
uv run --env-file .env python -m scripts.compare_ocr --engine both --output /tmp/classping-ocr-comparison.json
```

ใช้ `--engine paddle` หรือ `--engine typhoon` เพื่อทดลองแยกตัว หากไม่ใช่ Mac ให้เพิ่ม `--font /path/to/thai-font.ttf`

## วิธีวัด

- สร้างเอกสารสมมติข้อความ `ใบลาป่วย นักศึกษา` และ `27/10/2569` ใน PNG/JPEG/PDF
- ใช้ renderer เดียวกันก่อนส่งให้ทั้งสองตัว; SDK Typhoon มี preprocessing และอาจ encode เป็น JPEG อีกครั้ง
- Paddle รันในเครื่อง ส่วน Typhoon ส่งเฉพาะภาพสมมติไป `api.opentyphoon.ai` ด้วย model `typhoon-ocr` / task `v1.5`
- CER = ระยะ Levenshtein / จำนวนอักขระต้นฉบับ หลัง normalize Unicode NFC และลบ whitespace ยิ่งต่ำยิ่งดี ค่าอาจเกิน 100% หากสร้างข้อความเกินมาก
- ไม่จัดลำดับบรรทัดใหม่หรือลบ Markdown จึงนับความต่างของลำดับและรูปแบบใน CER ด้วย ควรดูข้อความดิบประกอบ
- วัดเวลารวม OCR/เครือข่าย แต่แยกเวลาเริ่ม Paddle และไม่รวม rendering; ไม่มี confidence ของ Typhoon ให้เทียบโดยตรง
- บันทึกเคส error โดยไม่แสดง exception body หรือคีย์ เมื่อขาดคีย์บันทึก `blocked` และจบด้วย exit code 1 เพื่อไม่รายงานว่าทดสอบ Typhoon ผ่านแล้ว

ชุดนี้เล็กและเป็นภาพสร้างเอง ใช้ตรวจความพร้อมและเปรียบเทียบเบื้องต้นเท่านั้น ไม่ใช่หลักฐานว่าตัวไหนแม่นที่สุดสำหรับเอกสารจริงหรือลายมือ

## ผล baseline 27 ตุลาคม 2026

ผลเต็ม: `ocr-comparison-baseline.json` (Typhoon ยัง blocked เพราะไม่มีคีย์)

| Engine | Format | CER | OCR seconds | วันที่ตรง |
|---|---|---:|---:|---|
| PaddleOCR | PNG | 0% | 1.582 | ใช่ |
| PaddleOCR | JPEG | 3.85% | 1.171 | ใช่ |
| PaddleOCR | PDF | 3.85% | 5.115 | ใช่ |
| Typhoon OCR 1.5 | ทั้งหมด | ยังไม่มีผล | ยังไม่มีผล | ยังไม่ได้ทดสอบ |

Paddle initialization ใช้ 8.076 วินาที ข้อความ JPEG/PDF อ่าน `ใบลาป่วย` เป็น `บลาป่วย` ไม่รวมเวลาสร้างภาพหรือ render PDF ในตารางนี้

## ผลเรียก Typhoon จริง — 27 ตุลาคม 2026

ทดสอบด้วยคีย์ที่ผู้ใช้ตั้งใน `.env` แล้ว ไม่บันทึกค่าคีย์ในรายงาน ใช้เอกสารสมมติเดียวกันทั้งสองตัว

| Format | Engine | CER | วินาที |
|---|---|---:|---:|
| PNG | typhoon-ocr-1.5 | 0.00% | 1.321 |
| PNG | paddleocr | 0.00% | 1.710 |
| JPEG | typhoon-ocr-1.5 | 0.00% | 0.666 |
| JPEG | paddleocr | 3.85% | 1.615 |
| PDF | typhoon-ocr-1.5 | 0.00% | 1.086 |
| PDF | paddleocr | 3.85% | 5.634 |

Typhoon อ่าน `ใบลาป่วย นักศึกษา` และ `27/10/2569` ตรงต้นฉบับทั้ง 3 เคส ส่วน Paddle อ่าน JPEG/PDF เป็น `บลาป่วย นักศึกษา` วันที่ถูกต้องทั้งสองตัวทุกเคส

ผลเฉพาะชุดนี้: Typhoon มี CER ต่ำกว่าใน JPEG/PDF และใช้เวลาน้อยกว่าทั้ง 3 เคส แต่ไม่เพียงพอยืนยันว่าแม่นที่สุดกับเอกสารจริง ภาพเบลอ หรือเอกสารลายมือ เวลา Paddle initialization แยกต่างหาก 5.557 วินาที และเวลาในตารางไม่รวม rendering

ผลดิบ: `ocr-comparison-live.json` ระบบหลักยังใช้ PaddleOCR และยังไม่ได้นำเอกสารนักศึกษาจริงส่งไป Typhoon ไม่ได้ commit/push
