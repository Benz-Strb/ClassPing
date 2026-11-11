import numpy as np


def test_clean_text_drops_figures_signatures_markdown_and_loops():
    from app.typhoon_mlx import clean_text

    raw = (
        '## ใบรับรองแพทย์\n'
        'โทร. 0-2596-7888\n'
        'Tel. 0-2596-7888\n'
        'โทร. 0-2596-7888\n'
        'Tel. 0-2596-7888\n'
        '**วันที่** 29 ตุลาคม 2569\n'
        '<figure>\n'
        'ภาพตราประทับสีน้ำเงิน\n'
        '</figure>\n'
        '(ลายเซ็น)\n'
        'แพทย์ผู้ตรวจ\n'
        'แพทย์ผู้ตรวจ'
    )
    # ซ้ำแบบมีบรรทัดอื่นคั่น เช่นเบอร์โทรสำนักงานใหญ่กับสาขา เป็นข้อความจริงของเอกสาร เก็บไว้
    assert clean_text(raw) == (
        'ใบรับรองแพทย์\n'
        'โทร. 0-2596-7888\n'
        'Tel. 0-2596-7888\n'
        'โทร. 0-2596-7888\n'
        'Tel. 0-2596-7888\n'
        'วันที่ 29 ตุลาคม 2569\n'
        '\n'
        'แพทย์ผู้ตรวจ'
    )


def test_resize_keeps_small_images_and_shrinks_long_side():
    from app.typhoon_mlx import LONG_SIDE, resize

    small = np.zeros((600, 400, 3), dtype=np.uint8)
    assert resize(small) is small
    big = np.zeros((1705, 959, 3), dtype=np.uint8)
    assert resize(big).shape[:2] == (LONG_SIDE, round(959 * LONG_SIDE / 1705))
