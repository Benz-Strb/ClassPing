from dataclasses import dataclass

import cv2
import numpy as np

STRIDES = (8, 16, 32)
ANCHORS = 2


@dataclass(frozen=True)
class Detection:
    bbox: tuple[float, float, float, float]
    score: float
    kps: np.ndarray  # 5x2


def decode(
    outputs: list[np.ndarray],
    height: int,
    width: int,
    score_min: float = 0.5,
    nms: float = 0.4,
) -> list[Detection]:
    """แปลง output 9 ตัวของ SCRFD เป็นกรอบหน้า (พิกัดของภาพที่ป้อนโมเดล)

    จัดกลุ่มตามจำนวนแถว/คอลัมน์ ไม่พึ่งลำดับ output
    """
    sizes = {s: (height // s) * (width // s) * ANCHORS for s in STRIDES}
    grouped: dict[tuple[int, int], np.ndarray] = {}
    for out in outputs:
        out = out.reshape(-1, out.shape[-1])
        stride = next((s for s, n in sizes.items() if n == out.shape[0]), None)
        if stride is None:
            raise ValueError(f"output ขนาดไม่ตรงกับภาพ {width}x{height}: {out.shape}")
        grouped[(stride, out.shape[1])] = out

    boxes, scores, kpss = [], [], []
    for s in STRIDES:
        try:
            score, dist, kp = grouped[(s, 1)][:, 0], grouped[(s, 4)] * s, grouped[(s, 10)] * s
        except KeyError as e:
            raise ValueError(f"output ของ stride {s} ไม่ครบ") from e
        gy, gx = np.mgrid[: height // s, : width // s]
        centers = np.stack([gx, gy], -1).reshape(-1, 2).astype(np.float32) * s
        centers = np.repeat(centers, ANCHORS, 0)
        keep = score >= score_min
        centers, score, dist, kp = centers[keep], score[keep], dist[keep], kp[keep]
        boxes.append(np.concatenate([centers - dist[:, :2], centers + dist[:, 2:]], 1))
        kpss.append(centers[:, None, :] + kp.reshape(-1, 5, 2))
        scores.append(score)

    boxes, scores, kpss = np.concatenate(boxes), np.concatenate(scores), np.concatenate(kpss)
    if len(scores) == 0:
        return []
    rects = [[float(a), float(b), float(c - a), float(d - b)] for a, b, c, d in boxes]
    picked = np.array(cv2.dnn.NMSBoxes(rects, scores.tolist(), score_min, nms), dtype=int)
    return [
        Detection(tuple(float(v) for v in boxes[i]), float(scores[i]), kpss[i].astype(np.float32))
        for i in picked.reshape(-1)
    ]
