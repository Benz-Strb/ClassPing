"""โปรแกรมกล้องหน้าห้อง รันบนเครื่องที่ต่อเว็บแคม: npm run dev:camera"""

import logging
import os
import signal
import sys
import time
from datetime import UTC, datetime

from camera.api import BadToken, CameraApi
from camera.loop import RETRY_SECONDS, CameraLoop
from camera.webcam import Webcam


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    log = logging.getLogger("camera")
    # ไม่ต้อง log ทุกภาพที่ส่ง
    logging.getLogger("httpx").setLevel(logging.WARNING)
    # Ctrl+C และ kill ปิดกล้องก่อนออกเสมอ
    signal.signal(signal.SIGINT, signal.default_int_handler)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    token = os.environ.get("CAMERA_TOKEN", "").strip()
    if not token:
        log.error("ยังไม่ได้ตั้ง CAMERA_TOKEN ใน services/camera/.env (สร้างด้วย npm run db:seed:camera)")
        return 1
    api_url = os.environ.get("API_URL", "").strip() or "http://127.0.0.1:3001"
    camera = Webcam(
        index=int(os.environ.get("CAMERA_INDEX", "").strip() or 0),
        max_width=int(os.environ.get("FRAME_MAX_WIDTH", "").strip() or 1280),
    )
    loop = CameraLoop(CameraApi(api_url, token), camera, lambda: datetime.now(UTC))

    log.info("รอคาบจาก %s (กล้องหมายเลข %d)", api_url, camera.index)
    try:
        while True:
            try:
                wait = loop.tick()
            except BadToken:
                raise
            except Exception:
                # error ที่ไม่ได้คาดไว้ ไม่ให้โปรแกรมตายกลางคาบ
                log.exception("เกิดข้อผิดพลาด ลองใหม่ใน %d วิ", RETRY_SECONDS)
                wait = RETRY_SECONDS
            time.sleep(wait)
    except BadToken as error:
        log.error("%s", error)
        return 1
    except KeyboardInterrupt:
        return 0
    finally:
        if loop.session is not None:
            log.info("ปิดโปรแกรม ส่งไป %d ภาพ", loop.sent)
        camera.close()


if __name__ == "__main__":
    sys.exit(main())
