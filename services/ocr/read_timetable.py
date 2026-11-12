"""CLI: emit the same OCR lines returned by POST /schedules/ocr."""
import argparse
import json
import sys
from pathlib import Path
from threading import Lock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'face'))
from main import make_reader
from timetable import read_timetable_lines


class LazyReader:
    def read(self, image):
        return make_reader().read(image)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('document', type=Path)
    args = parser.parse_args()
    if args.document.stat().st_size > 10 * 1024 * 1024:
        parser.error('ไฟล์ต้องไม่เกิน 10 MB')
    lines = read_timetable_lines(args.document.read_bytes(), LazyReader(), Lock())
    print(json.dumps(lines, ensure_ascii=False))
