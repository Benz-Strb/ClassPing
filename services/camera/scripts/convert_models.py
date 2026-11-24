import torch  # noqa: F401, I001 ต้อง import ก่อนอย่างอื่น ไม่งั้น logger ของ torch พังตอน rknn โหลด

import argparse
from pathlib import Path

import onnxruntime as ort


TARGET = "rk3588"


def models(det_w: int, det_h: int):
    return [
        (
            "det_10g.onnx",
            f"det_{det_w}x{det_h}_fp16.rknn",
            127.5,
            128.0,
            (det_h, det_w),
            True,
        ),
        ("w600k_r50.onnx", "rec_fp16.rknn", 127.5, 127.5, (112, 112), True),
        ("liveness.onnx", "live_fp16.rknn", 0.0, 255.0, (80, 80), False),
    ]


def convert(onnx: Path, out: Path, mean: float, std: float, size: tuple[int, int]) -> None:
    from rknn.api import RKNN

    name = ort.InferenceSession(str(onnx), providers=["CPUExecutionProvider"]).get_inputs()[0].name
    rknn = RKNN(verbose=False)
    rknn.config(mean_values=[[mean] * 3], std_values=[[std] * 3], target_platform=TARGET)
    if rknn.load_onnx(str(onnx), inputs=[name], input_size_list=[[1, 3, *size]]) != 0:
        raise SystemExit(f"โหลด {onnx.name} ไม่สำเร็จ")
    if rknn.build(do_quantization=False) != 0:
        raise SystemExit(f"แปลง {onnx.name} ไม่สำเร็จ")
    if rknn.export_rknn(str(out)) != 0:
        raise SystemExit(f"บันทึก {out.name} ไม่สำเร็จ")
    rknn.release()


def main() -> None:
    parser = argparse.ArgumentParser(description="แปลง ONNX ของโมเดลหน้าเป็น RKNN FP16 (rk3588)")
    parser.add_argument("--onnx-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--det-size", default="2560x1440", help="กว้างxสูง")
    args = parser.parse_args()
    det_w, det_h = (int(v) for v in args.det_size.lower().split("x"))
    args.out.mkdir(parents=True, exist_ok=True)

    for src, dst, mean, std, size, required in models(det_w, det_h):
        onnx, out = args.onnx_dir / src, args.out / dst
        if out.exists():
            print(f"ข้าม {dst} (มีแล้ว)")
            continue
        if not onnx.exists():
            if required:
                raise SystemExit(f"ไม่พบ {onnx}")
            print(f"ข้าม {dst} (ไม่มี {src})")
            continue
        print(f"แปลง {src} -> {dst}")
        convert(onnx, out, mean, std, size)


if __name__ == "__main__":
    main()
