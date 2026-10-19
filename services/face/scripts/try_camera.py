"""ลองจับหน้าจากกล้อง MacBook แล้วดูคะแนนความเหมือนแบบสด ๆ

    cd ClassPing/services/face && uv run python scripts/try_camera.py

ปุ่ม:  e = ลงทะเบียนหน้าที่อยู่ในกล้องเป็น "me" (กดซ้ำได้หลายมุม สูงสุด 5)
       c = ล้างหน้าที่ลงทะเบียนไว้
       q = ออก

ทุกอย่างอยู่ในหน่วยความจำ ไม่บันทึกรูปหรือข้อมูลใบหน้าลงดิสก์
ครั้งแรก macOS จะถามสิทธิ์ใช้กล้องให้ Terminal
"""

import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings
from app.engine import InsightFaceEngine
from app.errors import FaceError
from app.matching import match
from app.quality import face_size, pick_enrollment_face, real_faces

MAX_POSES = 5
GREEN, YELLOW, RED, WHITE = (0, 200, 0), (0, 200, 255), (0, 0, 255), (255, 255, 255)

# จุดตั้งต้นที่จะเอาไปตั้งใน API (แผน 5) ปรับตามตัวเลขที่เห็นจริง
ACCEPT, REVIEW = 0.45, 0.30


def color_for(score: float) -> tuple[int, int, int]:
    if score >= ACCEPT:
        return GREEN
    if score >= REVIEW:
        return YELLOW
    return RED


def put(frame, text: str, org, color=WHITE, scale: float = 0.6) -> None:
    """ฟอนต์ของ OpenCV วาดได้แค่ ASCII ข้อความบนจอจึงเป็นภาษาอังกฤษ ภาษาไทยพิมพ์ลง Terminal"""
    cv2.putText(frame, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(frame, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, color, 1, cv2.LINE_AA)


def main() -> None:
    # สคริปต์นี้ไม่ได้เปิดเป็น service จึงใช้ token หลอก
    settings = Settings(token="local-only" * 4)
    print("กำลังโหลดโมเดล...")
    engine = InsightFaceEngine(settings)

    camera = cv2.VideoCapture(0)
    if not camera.isOpened():
        sys.exit("เปิดกล้องไม่ได้ ตรวจสิทธิ์กล้องของ Terminal ใน System Settings > Privacy")

    enrolled: list[np.ndarray] = []
    message = "press e to enroll"
    last = time.perf_counter()

    while True:
        ok, frame = camera.read()
        if not ok:
            break
        faces = sorted(real_faces(engine.analyze(frame)), key=lambda f: -face_size(f.bbox))

        scores = []
        if enrolled and faces:
            gallery = [("me", np.array(enrolled))]
            scores = [r.score for r in match(np.array([f.embedding for f in faces]), gallery)]

        for i, face in enumerate(faces):
            x1, y1, x2, y2 = (int(v) for v in face.bbox)
            score = scores[i] if scores else None
            color = WHITE if score is None else color_for(score)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            label = f"{face_size(face.bbox):.0f}px"
            if score is not None:
                label = f"score {score:.2f}  " + label
            if face.pose is not None:
                pitch, yaw, _ = face.pose
                label += f"  yaw {yaw:.0f} pitch {pitch:.0f}"
            put(frame, label, (x1, max(y1 - 8, 16)), color)

        now = time.perf_counter()
        fps, last = 1 / max(now - last, 1e-6), now
        put(frame, f"poses {len(enrolled)}/{MAX_POSES}  fps {fps:.1f}", (10, 24))
        put(frame, message, (10, 50))
        cv2.imshow("ClassPing face try (q to quit)", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("c"):
            enrolled.clear()
            message = "cleared"
            print("ล้างหน้าที่ลงทะเบียนไว้แล้ว")
        if key == ord("e"):
            if len(enrolled) >= MAX_POSES:
                message = "5 poses max, press c to clear"
                continue
            try:
                face = pick_enrollment_face(faces, frame, settings)
                enrolled.append(face.embedding)
                message = f"enrolled pose {len(enrolled)}"
            except FaceError as error:
                message = error.code
                print(f"ลงทะเบียนไม่ได้: {error.message}")
            print(message)

    camera.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
