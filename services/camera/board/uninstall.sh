#!/usr/bin/env bash
# ถอนทุกอย่างที่ install.sh ลง รันเป็น student รันซ้ำได้
#   bash ~/workspace/classping-camera/board/uninstall.sh
# ไม่ลบโฟลเดอร์โค้ด ~/workspace/classping-camera กับ board.env ถ้าอยากให้ลบ board.env ด้วยใส่ --delete-env
#   bash ~/workspace/classping-camera/board/uninstall.sh --delete-env
set -uo pipefail

[ -n "${HOME:-}" ] && [ "$HOME" = "/home/student" ] || { echo "ต้องรันเป็น student" >&2; exit 1; }
CODE_DIR="$HOME/workspace/classping-camera"
STATE_DIR="$HOME/.classping-board"
DELETE_ENV=0
# คืน librknnrt ไม่สำเร็จ ต้องเก็บ STATE_DIR (มีไฟล์สำรอง) ไว้
KEEP_STATE=0
[ "${1:-}" = "--delete-env" ] && DELETE_ENV=1

say() { printf '\n== %s\n' "$*"; }

say "service"
sudo systemctl disable --now classping-camera.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/classping-camera.service
sudo systemctl daemon-reload

say "librknnrt.so"
RT=/usr/lib/librknnrt.so
case "$(cat "$STATE_DIR/librknnrt.state" 2>/dev/null)" in
  replaced)
    # ของเดิมถูกแทนตอนติดตั้ง คืนให้
    if [ -f "$STATE_DIR/librknnrt.so.orig" ]; then
      if sudo cp -p "$STATE_DIR/librknnrt.so.orig" "$RT" && sudo ldconfig; then
        echo "คืน $RT เดิมแล้ว"
      else
        KEEP_STATE=1
        echo "คืน $RT เดิมไม่สำเร็จ ไฟล์สำรองยังอยู่ที่ $STATE_DIR/librknnrt.so.orig" >&2
        echo "คืนเองด้วย: sudo cp -p $STATE_DIR/librknnrt.so.orig $RT && sudo ldconfig แล้วค่อยลบ $STATE_DIR" >&2
      fi
    else
      echo "ไม่เจอไฟล์สำรอง $STATE_DIR/librknnrt.so.orig คืน $RT เดิมไม่ได้" >&2
    fi
    ;;
  created)
    if dpkg -S "$RT" >/dev/null 2>&1; then
      echo "$RT เป็นของ package ไม่ลบ"
    elif [ -e "$RT" ]; then
      sudo rm -f "$RT" && sudo ldconfig
    fi
    ;;
  *)
    echo "$RT มีอยู่ก่อนติดตั้ง (หรือไม่มีบันทึก) ไม่ลบ ถ้าไม่ใช้แล้วลบเอง: sudo rm $RT"
    ;;
esac

say "venv โมเดล และไฟล์ทดสอบ"
rm -rf "$CODE_DIR/.venv" "$HOME/.venv-rknn-convert" \
  "$HOME/workspace/classping-models" "$HOME/workspace/classping-onnx" "$HOME/workspace/npu-spike" \
  "$HOME/classping-models" "$HOME/classping-onnx" "$HOME/npu-spike"

say "uv"
if [ -f "$STATE_DIR/uv" ]; then
  # uv ที่ install.sh ลงเอง รวม Python 3.12 และ cache ที่ uv โหลดมา
  rm -f "$HOME/.local/bin/uv" "$HOME/.local/bin/uvx"
  rm -rf "$HOME/.local/share/uv" "$HOME/.cache/uv"
else
  echo "uv ไม่ได้ลงโดย install.sh ไม่แตะ"
fi

say "ffmpeg"
if [ -f "$STATE_DIR/ffmpeg" ]; then
  sudo apt-get remove -y ffmpeg
else
  echo "ffmpeg ไม่ได้ลงโดย install.sh ไม่แตะ"
fi

if [ "$KEEP_STATE" -eq 1 ]; then
  echo "เก็บ $STATE_DIR ไว้ (มีไฟล์สำรอง librknnrt ที่ยังคืนไม่ได้)" >&2
else
  rm -rf "$STATE_DIR"
fi

say "board.env"
if [ "$DELETE_ENV" -eq 1 ]; then
  rm -f "$CODE_DIR/board.env"
  echo "ลบ board.env แล้ว"
elif [ -f "$CODE_DIR/board.env" ]; then
  echo "เตือน: $CODE_DIR/board.env ยังอยู่ และมี CAMERA_TOKEN กับรหัสผ่านกล้อง ลบเอง หรือรันใหม่ด้วย --delete-env"
fi

say "เสร็จ"
echo "เตือน: ลบ /etc/sudoers.d/90-student-nopasswd เอง (สคริปต์ไม่ลบให้): sudo rm /etc/sudoers.d/90-student-nopasswd"
