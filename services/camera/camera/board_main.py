"""โปรแกรมกล้องหน้าห้องบนบอร์ด Radxa ROCK 5B+: ดึงภาพจากกล้อง CCTV (RTSP) วิเคราะห์หน้าบน NPU
แล้วส่งผลให้ API รันเป็น service ด้วย classping-camera.service (ดู board/install.sh)"""

import ipaddress
import logging
import os
import signal
import sys
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

from camera.api import BadToken
from camera.board.analyze import AnalyzerSettings, FaceAnalyzer
from camera.board.rknn_runner import RknnRunner
from camera.board_api import BoardApi
from camera.loop import RETRY_SECONDS, CameraLoop
from camera.rtsp import AnalyzingCamera, RtspCamera, mask_url
from camera.stream import Streamer

# ค่าตั้งผิด/token ผิด (EX_CONFIG) systemd ไม่เริ่มใหม่ให้ (RestartPreventExitStatus=78)
# เริ่มใหม่ก็พังซ้ำ แถมโหลดโมเดล NPU ใหม่ทุก 5 วิ
EXIT_CONFIG = 78

# ตอนปิด แต่ละขั้นรอได้ไม่เกินเท่านี้ ค้างก็ข้ามไป (systemd ให้เวลาทั้งหมด 20 วิ ดู TimeoutStopSec)
STREAMER_STOP_SECONDS = 10
CAMERA_CLOSE_SECONDS = 3
RUNNER_CLOSE_SECONDS = 3


class StopSignal:
    """ตัวรับ SIGTERM: จำไว้ว่าถูกสั่งปิด แล้วโยน SystemExit(0) ให้หลุดจากที่ทำอยู่

    rknnlite ครอบ inference ด้วย except: เปล่า SystemExit ที่โยนตอน NPU ทำงานจึงถูกกลืนหาย
    ลูปหลักต้องดูธง requested เองด้วย ไม่งั้นโปรแกรมทำงานต่อจน systemd ฆ่าทิ้ง
    ระหว่างปิด (closing) ไม่โยนซ้ำ ไม่ให้การปิดกล้อง/NPU ขาดกลางทาง
    """

    def __init__(self) -> None:
        self.requested = False
        self.closing = False

    def __call__(self, *_) -> None:
        self.requested = True
        if not self.closing:
            raise SystemExit(0)


def bounded(log: logging.Logger, name: str, fn, seconds: float) -> None:
    """เรียก fn ใน thread แยก รอไม่เกิน seconds ค้างก็ปล่อยไว้ (daemon ไม่กันโปรแกรมออก)"""

    def run() -> None:
        try:
            fn()
        except Exception:  # ปิดไม่สำเร็จก็ต้องปิดตัวอื่นต่อ
            log.exception("%s ไม่สำเร็จ", name)

    thread = threading.Thread(target=run, name=name, daemon=True)
    thread.start()
    thread.join(seconds)
    if thread.is_alive():
        log.warning("%s ไม่เสร็จใน %g วิ ข้ามไป", name, seconds)


def is_loopback(host: str | None) -> bool:
    if not host:
        return False
    if host.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    log = logging.getLogger("camera")
    # ไม่ต้อง log ทุกภาพที่ส่ง
    logging.getLogger("httpx").setLevel(logging.WARNING)
    # Ctrl+C และ systemctl stop ปิดกล้องกับ NPU ก่อนออกเสมอ
    signal.signal(signal.SIGINT, signal.default_int_handler)
    stop = StopSignal()
    signal.signal(signal.SIGTERM, stop)

    token = os.environ.get("CAMERA_TOKEN", "").strip()
    if not token:
        log.error("ยังไม่ได้ตั้ง CAMERA_TOKEN ใน board.env (สร้างด้วย npm run db:seed:camera)")
        return EXIT_CONFIG
    rtsp_url = os.environ.get("RTSP_URL", "").strip()
    if not rtsp_url:
        log.error("ยังไม่ได้ตั้ง RTSP_URL ใน board.env (ที่อยู่สตรีมของกล้อง CCTV)")
        return EXIT_CONFIG
    api_url = os.environ.get("API_URL", "").strip() or "http://127.0.0.1:3001"
    # token กับภาพหน้าห้ามวิ่งบน http ธรรมดาข้ามเครือข่าย
    parts = urlsplit(api_url)
    if parts.scheme == "http" and not is_loopback(parts.hostname):
        if os.environ.get("ALLOW_PLAIN_HTTP", "").strip() != "1":
            log.error(
                "API_URL เป็น http:// ที่ไม่ใช่เครื่องตัวเอง ใช้ https:// (เฉพาะตอนพัฒนาตั้ง ALLOW_PLAIN_HTTP=1)"
            )
            return EXIT_CONFIG
        log.warning("ALLOW_PLAIN_HTTP=1: ส่ง token และภาพหน้าผ่าน http ไม่เข้ารหัส ใช้เฉพาะตอนพัฒนา")
    model_dir = Path(os.environ.get("MODEL_DIR", "").strip() or "~/workspace/classping-models").expanduser()
    max_width = int(os.environ.get("FRAME_MAX_WIDTH", "").strip() or 1280)

    try:
        runner = RknnRunner(model_dir)
    except Exception as error:  # noqa: BLE001 ไม่มีโมเดล/NPU ใช้ไม่ได้ ให้ systemd เริ่มใหม่
        if stop.requested:
            # ถูกสั่งปิดระหว่างโหลด rknnlite กลืน SystemExit แล้วรายงานว่าโหลดไม่สำเร็จ
            return 0
        log.error("โหลดโมเดลจาก %s ไม่สำเร็จ: %s", model_dir, error)
        return 1
    # ไม่ log รหัสผ่านของกล้อง กับ token
    log.info(
        "โมเดลจาก %s · liveness %s · กล้อง %s",
        model_dir,
        "เปิด" if runner.has_liveness else "ปิด (ไม่มี live_fp16.rknn)",
        mask_url(rtsp_url),
    )

    source = RtspCamera(rtsp_url)
    camera = AnalyzingCamera(
        source,
        FaceAnalyzer(runner, AnalyzerSettings.from_env()),
        lambda: datetime.now(UTC),
    )
    # กล้อง CCTV ไม่ใช่เว็บแคม ภาพไม่กลับซ้ายขวา วิดีโอใช้ภาพดิบชุดเดียวกับที่วิเคราะห์
    streamer = Streamer(source=source.latest_raw, max_width=max_width, mirror=False)
    loop = CameraLoop(BoardApi(api_url, token), camera, lambda: datetime.now(UTC), streamer)

    log.info("รอคาบจาก %s", api_url)
    try:
        while not stop.requested:
            try:
                wait = loop.tick()
            except BadToken:
                raise
            except Exception:
                if stop.requested:
                    # SystemExit ถูกกลืนกลาง inference แล้วพังต่อ ไม่ใช่ error จริง
                    break
                # error ที่ไม่ได้คาดไว้ ไม่ให้โปรแกรมตายกลางคาบ
                log.exception("เกิดข้อผิดพลาด ลองใหม่ใน %d วิ", RETRY_SECONDS)
                wait = RETRY_SECONDS
            if stop.requested:
                break
            time.sleep(wait)
        return 0
    except BadToken as error:
        if stop.requested:
            return 0
        log.error("%s", error)
        return EXIT_CONFIG
    except KeyboardInterrupt:
        return 0
    except SystemExit:
        if stop.requested:
            return 0
        raise
    finally:
        stop.closing = True
        if loop.session is not None:
            log.info("ปิดโปรแกรม ส่งไป %d ภาพ", loop.sent)
        # ทุกขั้นมีเวลาจำกัด กล้องหรือ ffmpeg ค้างก็ยังออกได้ ไม่ต้องรอ systemd ฆ่า
        bounded(log, "หยุดวิดีโอ", streamer.stop, STREAMER_STOP_SECONDS)
        bounded(log, "ปิดกล้อง", camera.close, CAMERA_CLOSE_SECONDS)
        bounded(log, "คืน NPU", runner.close, RUNNER_CLOSE_SECONDS)


if __name__ == "__main__":
    sys.exit(main())
