import io

from PIL import Image

from app.images import decode_image

# EXIF Orientation 6 = กล้องถือแนวตั้ง ต้องหมุน 90° ถึงจะตรง
ROTATE_90 = 6


def test_decode_applies_exif_orientation():
    # มือถือส่ง JPEG จากกล้องมาตรงๆ ได้ service หมุนตาม EXIF ให้เอง
    # ถ้าแอปหมุนพิกเซลเองต้องลบ EXIF ด้วย ไม่งั้นจะโดนหมุนซ้ำ
    exif = Image.Exif()
    exif[0x0112] = ROTATE_90
    buffer = io.BytesIO()
    Image.new("RGB", (200, 100), "white").save(buffer, "JPEG", exif=exif)

    image = decode_image(buffer.getvalue(), 5 * 1024 * 1024)

    assert image.shape[:2] == (200, 100)
