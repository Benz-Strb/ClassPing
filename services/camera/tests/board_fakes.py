import numpy as np

STRIDES = (8, 16, 32)


def face_kps(bbox):
    """landmark 5 จุดแบบคร่าว ๆ ในกรอบ"""
    x1, y1, x2, y2 = bbox
    w, h = x2 - x1, y2 - y1
    pts = [(0.3, 0.38), (0.7, 0.38), (0.5, 0.58), (0.35, 0.78), (0.65, 0.78)]
    return np.array([[x1 + w * a, y1 + h * b] for a, b in pts], np.float32)


def fake_outputs(height, width, faces, shuffle=False, stride=8):
    """output 9 ตัวของ SCRFD ที่มีหน้าตามรายการ faces = [(bbox, kps, score)] ที่ anchor แรกของจุดกลาง"""
    outs = {}
    for s in STRIDES:
        n = (height // s) * (width // s) * 2
        outs[(s, 1)] = np.zeros((n, 1), np.float32)
        outs[(s, 4)] = np.zeros((n, 4), np.float32)
        outs[(s, 10)] = np.zeros((n, 10), np.float32)
    cols = width // stride
    for bbox, kps, score in faces:
        x1, y1, x2, y2 = bbox
        gx, gy = int((x1 + x2) / 2 // stride), int((y1 + y2) / 2 // stride)
        row = (gy * cols + gx) * 2
        c = np.array([gx * stride, gy * stride], np.float32)
        outs[(stride, 1)][row, 0] = score
        outs[(stride, 4)][row] = np.concatenate([c - [x1, y1], [x2, y2] - c]) / stride
        outs[(stride, 10)][row] = ((np.asarray(kps) - c) / stride).reshape(-1)
    result = [outs[(s, k)] for k in (1, 4, 10) for s in STRIDES]
    if shuffle:
        result = result[::-1]
    return result
