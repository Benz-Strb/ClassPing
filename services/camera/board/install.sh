#!/usr/bin/env bash
# ติดตั้งโปรแกรมกล้องบน Radxa ROCK 5B+ รันเป็น student (ใช้ sudo เฉพาะขั้นที่ต้องใช้) รันซ้ำได้
#   cd ~/workspace/classping-camera && bash board/install.sh
# ถอนด้วย board/uninstall.sh (บอร์ดนี้ยืมมา ทุกอย่างที่ลงต้องถอนได้)
#
# ทำวิดีโอทดสอบ (ไม่มีหน้าคนจริง ไม่ commit) หลังลงเสร็จแล้ว (ต้องมี ffmpeg):
#   cd ~/workspace/classping-onnx && ffmpeg -loop 1 -i t1.jpg -t 120 -vf scale=2560:1440 -r 5 test.mp4
# แล้วใส่ path ไฟล์ใน RTSP_URL (เช่น /home/student/workspace/classping-onnx/test.mp4) หรือเปิดเป็นสตรีมด้วย MediaMTX
#
# ไฟล์ ONNX ต้องมีใน ~/workspace/classping-onnx ก่อนรัน (คัดลอกจาก Mac เอง สคริปต์ไม่โหลดให้):
#   det_10g.onnx, w600k_r50.onnx (ต้องมี) และ liveness.onnx (ไม่บังคับ)
set -euo pipefail

UV_VERSION=0.13.9
RKNN_REF=v2.5.0
RKNN_RAW="https://raw.githubusercontent.com/airockchip/rknn-toolkit2/${RKNN_REF}"
LITE_WHEEL=rknn_toolkit_lite2-2.5.0-cp312-cp312-manylinux_2_17_aarch64.manylinux2014_aarch64.whl
FULL_WHEEL=rknn_toolkit2-2.5.0-cp312-cp312-manylinux_2_17_aarch64.manylinux2014_aarch64.whl
# librknnrt.so ไม่มี checksum ประกาศ ใช้ค่าของไฟล์ v2.5.0 ที่ลงบนบอร์ดแล้ว (ตรงกับที่โหลดจาก tag v2.5.0)
RKNNRT_SHA256=4b6cc575bedf8952b13db4b1190fa3b3d2ac213f00be774ff6ccd19d651970c0
EXPECT_DRIVER="v0.9.8"

CODE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="${MODEL_DIR:-$HOME/workspace/classping-models}"
ONNX_DIR="${ONNX_DIR:-$HOME/workspace/classping-onnx}"
CONVERT_VENV="$HOME/.venv-rknn-convert"
STATE_DIR="$HOME/.classping-board"
UV_BIN="$HOME/.local/bin"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

say() { printf '\n== %s\n' "$*"; }
warn() { printf 'เตือน: %s\n' "$*" >&2; }
die() { printf 'ผิดพลาด: %s\n' "$*" >&2; exit 1; }

fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }

# เทียบ sha256 ของไฟล์ ถ้าไม่ตรงหยุดทันที
verify() {
  local got
  got="$(sha256sum "$1" | cut -d' ' -f1)"
  [ "$got" = "$2" ] || die "sha256 ของ $(basename "$1") ไม่ตรง (ได้ $got)"
}

# โหลด wheel จาก tag v2.5.0 แล้วตรวจกับ sha256sum.txt ของโฟลเดอร์เดียวกัน
fetch_wheel() { # $1 โฟลเดอร์ใน repo  $2 ชื่อไฟล์
  fetch "$RKNN_RAW/$1/sha256sum.txt" "$WORK/sums-$2.txt"
  local want
  want="$(awk -v f="$2" '$2 == f { print $1 }' "$WORK/sums-$2.txt")"
  [ -n "$want" ] || die "ไม่พบ $2 ใน sha256sum.txt"
  fetch "$RKNN_RAW/$1/$2" "$WORK/$2"
  verify "$WORK/$2" "$want"
}

[ "$(id -u)" -ne 0 ] || die "รันเป็น student ห้ามรันด้วย root"
[ "$(whoami)" = "student" ] || die "ต้องรันเป็น student (ตอนนี้เป็น $(whoami))"
[ "$CODE_DIR" = "/home/student/workspace/classping-camera" ] || die "โค้ดต้องอยู่ที่ /home/student/workspace/classping-camera (systemd unit ชี้ path นี้)"
mkdir -p "$STATE_DIR"

say "ตรวจไฟล์ ONNX"
# ตรวจก่อนทุกขั้นที่ใช้ sudo/apt จะได้ไม่ลงของครึ่งทาง
missing=0
for f in det_10g.onnx w600k_r50.onnx; do
  [ -f "$ONNX_DIR/$f" ] || missing=1
done
if [ "$missing" -ne 0 ]; then
  echo "ไม่พบ det_10g.onnx หรือ w600k_r50.onnx ใน $ONNX_DIR คัดลอกจาก Mac ด้วยคำสั่งนี้ (รันบน Mac):" >&2
  echo "  ssh rock5 mkdir -p workspace/classping-onnx" >&2
  echo "  scp ~/.insightface/models/buffalo_l/det_10g.onnx rock5:workspace/classping-onnx/" >&2
  echo "  scp ~/.insightface/models/buffalo_l/w600k_r50.onnx rock5:workspace/classping-onnx/" >&2
  echo "  scp ~/.insightface/models/liveness/liveness.onnx rock5:workspace/classping-onnx/   # ไม่บังคับ" >&2
  exit 1
fi
[ -f "$ONNX_DIR/liveness.onnx" ] || warn "ไม่มี liveness.onnx จะแปลงได้แค่หาหน้ากับ embedding"

say "ตรวจบอร์ด"
board="$(tr -d '\0' </proc/device-tree/model)"
[ "$board" = "Radxa ROCK 5B+" ] || die "บอร์ดคือ '$board' ไม่ใช่ Radxa ROCK 5B+"
case "$(uname -r)" in *rk35xx*) ;; *) die "kernel $(uname -r) ไม่ใช่ rk35xx (ต้องใช้ kernel vendor ที่มี RKNPU)" ;; esac
driver="$(sudo cat /sys/kernel/debug/rknpu/version 2>/dev/null || true)"
case "$driver" in
  *"$EXPECT_DRIVER"*) echo "RKNPU: $driver" ;;
  *) warn "RKNPU driver ไม่ใช่ $EXPECT_DRIVER (ได้ '${driver:-อ่านไม่ได้}') runtime v2.5.0 อาจใช้ไม่ได้" ;;
esac

say "ffmpeg"
if command -v ffmpeg >/dev/null; then
  echo "มี ffmpeg แล้ว"
else
  sudo apt-get install -y ffmpeg
  touch "$STATE_DIR/ffmpeg"
fi

say "uv $UV_VERSION"
export PATH="$UV_BIN:$PATH"
if command -v uv >/dev/null; then
  echo "มี uv แล้ว: $(uv --version)"
else
  base="https://github.com/astral-sh/uv/releases/download/$UV_VERSION"
  tar_name=uv-aarch64-unknown-linux-gnu.tar.gz
  fetch "$base/$tar_name" "$WORK/$tar_name"
  fetch "$base/$tar_name.sha256" "$WORK/$tar_name.sha256"
  verify "$WORK/$tar_name" "$(cut -d' ' -f1 "$WORK/$tar_name.sha256")"
  mkdir -p "$WORK/uv" "$UV_BIN"
  tar -xzf "$WORK/$tar_name" -C "$WORK/uv" --strip-components=1
  install -m 755 "$WORK/uv/uv" "$WORK/uv/uvx" "$UV_BIN/"
  touch "$STATE_DIR/uv"
fi

say "librknnrt.so v2.5.0"
RT=/usr/lib/librknnrt.so
RT_STATE="$STATE_DIR/librknnrt.state"
rt_sha() { sha256sum "$RT" | cut -d' ' -f1; }
if [ -f "$RT" ] && [ "$(rt_sha)" = "$RKNNRT_SHA256" ]; then
  echo "ลงแล้ว (ตรงกับ v2.5.0)"
  # มีอยู่ก่อนแล้ว uninstall จะไม่แตะ (ถ้าเป็นของ package ก็ไม่ลบอยู่แล้ว)
  [ -f "$RT_STATE" ] || echo preexisting >"$RT_STATE"
else
  if [ ! -f "$RT_STATE" ]; then
    if [ -e "$RT" ]; then
      if dpkg -S "$RT" >/dev/null 2>&1; then warn "$RT เป็นของ package $(dpkg -S "$RT" | cut -d: -f1) ถูกแทนด้วย v2.5.0 (สำรองไว้)"; fi
      sudo cp -p "$RT" "$STATE_DIR/librknnrt.so.orig"
      echo replaced >"$RT_STATE"
    else
      echo created >"$RT_STATE"
    fi
  fi
  fetch "$RKNN_RAW/rknpu2/runtime/Linux/librknn_api/aarch64/librknnrt.so" "$WORK/librknnrt.so"
  verify "$WORK/librknnrt.so" "$RKNNRT_SHA256"
  sudo install -m 755 "$WORK/librknnrt.so" "$RT"
  sudo ldconfig
fi

say "venv โปรแกรมกล้อง (Python 3.12 + rknn-toolkit-lite2)"
fetch_wheel rknn-toolkit-lite2/packages "$LITE_WHEEL"
(cd "$CODE_DIR" && uv sync --python 3.12)
uv pip install --python "$CODE_DIR/.venv/bin/python" "$WORK/$LITE_WHEEL"
"$CODE_DIR/.venv/bin/python" -c "from rknnlite.api import RKNNLite" \
  || die "import rknnlite ไม่ได้ (เช็ค numpy ที่ uv sync ลงกับ wheel v2.5.0)"

say "venv แปลงโมเดล ($CONVERT_VENV)"
fetch_wheel rknn-toolkit2/packages/arm64 "$FULL_WHEEL"
[ -x "$CONVERT_VENV/bin/python" ] || uv venv --python 3.12 "$CONVERT_VENV"
# รายการเดียวกับ arm64_requirements_cp312.txt ของ v2.5.0
uv pip install --python "$CONVERT_VENV/bin/python" \
  "protobuf>=4.21.0,<=4.25.4" "setuptools<80.1.0" "psutil>=5.9.0" "ruamel.yaml>=0.17.21" \
  "scipy>=1.9.3" "tqdm>=4.64.1" "opencv-python>=4.5.5.64" "fast-histogram>=0.11" \
  "Pillow>=10.0.1" "numpy<=1.26.4" "onnx>=1.16.1,<=1.18.0" "onnxruntime>=1.17.0" \
  "torch>=1.13.1,<=2.2.0" "$WORK/$FULL_WHEEL"

say "แปลงโมเดลเป็น RKNN (ข้ามตัวที่มีแล้ว)"
# ไฟล์ ONNX (det_10g, w600k_r50, liveness) ต้องอยู่ใน $ONNX_DIR ถ้ายังไม่มี .rknn
"$CONVERT_VENV/bin/python" "$CODE_DIR/scripts/convert_models.py" --onnx-dir "$ONNX_DIR" --out "$MODEL_DIR"

say "ทดสอบ NPU จริง (โหลดโมเดลแล้วรัน 1 ภาพ)"
# import ผ่านยังไม่พอ ต้องได้ embedding ที่ใช้ได้ (เช็ค numpy 2 กับ wheel v2.5.0)
(cd "$CODE_DIR" && MODEL_DIR="$MODEL_DIR" .venv/bin/python -m camera.board.smoke) \
  || die "ทดสอบ NPU ไม่ผ่าน ถ้าสงสัย numpy 2 ให้ลง numpy<2 ใน $CODE_DIR/.venv (uv pip install --python .venv/bin/python 'numpy<2') แล้วรันใหม่"

say "service"
if [ ! -f "$CODE_DIR/board.env" ]; then
  install -m 600 "$CODE_DIR/board/board.env.example" "$CODE_DIR/board.env"
  echo "สร้าง $CODE_DIR/board.env แล้ว ต้องกรอก CAMERA_TOKEN กับ RTSP_URL"
fi
# มี token กับรหัสกล้อง ให้อ่านได้เฉพาะ student เสมอ
chmod 600 "$CODE_DIR/board.env"
sudo install -m 644 "$CODE_DIR/board/classping-camera.service" /etc/systemd/system/classping-camera.service
sudo systemctl daemon-reload
sudo systemctl enable classping-camera.service
# มี token กับ URL แล้วค่อยเริ่ม ไม่งั้นจะวนล้มทุก 5 วิ
if grep -Eq '^CAMERA_TOKEN=.+' "$CODE_DIR/board.env" && grep -Eq '^RTSP_URL=.+' "$CODE_DIR/board.env"; then
  sudo systemctl restart classping-camera.service
  systemctl --no-pager status classping-camera.service || true
else
  warn "board.env ยังไม่ครบ ยังไม่เริ่ม service กรอกแล้วรัน: sudo systemctl restart classping-camera"
fi

say "เสร็จ"
