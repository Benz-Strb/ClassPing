"""ตัวหาคน (YOLOX-s) กับตัวตามคน (ByteTrack) ใช้ค่าตามที่วัดไว้ตอนทดลองหน้าประตู"""

import cv2
import numpy as np
import onnxruntime as ort
import supervision as sv
from trackers import ByteTrackTracker

from camera.door import Box

SIZE = 640
CONFIDENCE = 0.4
NMS_IOU = 0.45
# เฟรมต่อวินาทีที่ ByteTrack ใช้คำนวณเวลาที่ track หายได้
TRACK_FPS = 15
# วัดแล้ว 3 thread เร็วเท่าค่าเดิม แต่ใช้ CPU ราวครึ่งเดียว
THREADS = 3


class YoloxDetector:
    """YOLOX-s: ย่อแบบ letterbox (เติม 114) ภาพ BGR 0-255 ผลดิบต้องถอด grid เอง แล้วทำ NMS"""

    def __init__(self, model_path: str):
        options = ort.SessionOptions()
        options.intra_op_num_threads = THREADS
        self.session = ort.InferenceSession(model_path, options, providers=["CPUExecutionProvider"])
        grids, strides = [], []
        for stride in (8, 16, 32):
            n = SIZE // stride
            gx, gy = np.meshgrid(np.arange(n), np.arange(n))
            grids.append(np.stack([gx, gy], 2).reshape(-1, 2))
            strides.append(np.full((n * n, 1), stride))
        self.grid = np.concatenate(grids).astype(np.float32)
        self.stride = np.concatenate(strides).astype(np.float32)

    def detect(self, frame) -> list[Box]:
        height, width = frame.shape[:2]
        ratio = min(SIZE / height, SIZE / width)
        canvas = np.full((SIZE, SIZE, 3), 114, np.uint8)
        resized = cv2.resize(frame, (int(width * ratio), int(height * ratio)))
        canvas[: resized.shape[0], : resized.shape[1]] = resized
        blob = canvas.astype(np.float32).transpose(2, 0, 1)[None]
        out = self.session.run(None, {"images": blob})[0][0]
        center = (out[:, :2] + self.grid) * self.stride
        size = np.exp(out[:, 2:4]) * self.stride
        score = out[:, 4] * out[:, 5]  # objectness x คลาส 0 (คน)
        keep = score > CONFIDENCE
        center, size, score = center[keep], size[keep], score[keep]
        xyxy = np.concatenate([center - size / 2, center + size / 2], 1) / ratio
        if not len(xyxy):
            return []
        indexes = cv2.dnn.NMSBoxes(
            [[float(a), float(b), float(c - a), float(d - b)] for a, b, c, d in xyxy],
            score.tolist(),
            CONFIDENCE,
            NMS_IOU,
        )
        indexes = np.asarray(indexes, dtype=int).reshape(-1)
        return [Box(*map(float, xyxy[i]), float(score[i])) for i in indexes]


class ByteTrack:
    """ห่อ ByteTrack ให้รับ/คืนเป็น Box"""

    def __init__(self):
        self._tracker = ByteTrackTracker(frame_rate=TRACK_FPS)

    def update(self, boxes: list[Box]) -> list[tuple[int, Box]]:
        detections = sv.Detections(
            xyxy=np.array([b[:4] for b in boxes], dtype=np.float32).reshape(-1, 4),
            confidence=np.array([b.score for b in boxes], dtype=np.float32),
            class_id=np.zeros(len(boxes), dtype=int),
        )
        tracked = self._tracker.update(detections)
        if not len(tracked):
            return []
        return [
            (int(tid), Box(*map(float, xyxy), float(score)))
            for xyxy, tid, score in zip(tracked.xyxy, tracked.tracker_id, tracked.confidence)
            if tid >= 0
        ]

    def reset(self) -> None:
        self._tracker.reset()
