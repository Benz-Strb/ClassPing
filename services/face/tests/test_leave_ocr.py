from tests.images import noise_image, png


def test_leave_ocr_returns_text_lines(client, auth, reader):
    reader.lines = [('ลาป่วย', 0.98)]
    response = client.post(
        '/leave/ocr',
        headers=auth,
        files={'image': ('leave.png', png(noise_image()), 'image/png')},
    )

    assert response.status_code == 200
    assert response.json()['data'] == {'lines': [{'text': 'ลาป่วย', 'score': 0.98}]}


def test_leave_ocr_reads_all_pdf_pages(client, auth, reader):
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new('RGB', (100, 100), 'white').save(
        buffer, format='PDF', save_all=True,
        append_images=[Image.new('RGB', (100, 100), 'white')],
    )
    reader.lines = [('หลักฐาน', 0.98)]
    response = client.post('/leave/ocr', headers=auth,
        files={'image': ('leave.pdf', buffer.getvalue(), 'application/pdf')})
    assert response.status_code == 200
    assert len(response.json()['data']['lines']) == 2


def test_leave_ocr_rejects_broken_pdf(client, auth):
    response = client.post('/leave/ocr', headers=auth,
        files={'image': ('leave.pdf', b'%PDF-broken', 'application/pdf')})
    assert response.status_code == 400


def test_leave_ocr_rejects_too_many_pdf_pages(client, auth):
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new('RGB', (10, 10), 'white').save(
        buffer, format='PDF', save_all=True,
        append_images=[Image.new('RGB', (10, 10), 'white') for _ in range(10)],
    )
    response = client.post('/leave/ocr', headers=auth,
        files={'image': ('leave.pdf', buffer.getvalue(), 'application/pdf')})
    assert response.status_code == 400


def test_leave_ocr_rejects_oversized_pdf_page(client, auth):
    import io

    import pypdfium2 as pdfium

    document = pdfium.PdfDocument.new()
    page = document.new_page(10000, 10000)
    buffer = io.BytesIO()
    document.save(buffer)
    page.close()
    document.close()
    response = client.post('/leave/ocr', headers=auth,
        files={'image': ('leave.pdf', buffer.getvalue(), 'application/pdf')})
    assert response.status_code == 413


def test_leave_ocr_uses_typhoon_without_inventing_confidence(settings, engine, reader, auth):
    from fastapi.testclient import TestClient

    from app.main import create_app

    class TyphoonReader:
        def read(self, frame):
            return 'ใบลาป่วย\n27/10/2569'

    with TestClient(create_app(settings, engine, reader, leave_reader=TyphoonReader())) as client:
        response = client.post('/leave/ocr', headers=auth,
            files={'image': ('leave.png', png(noise_image()), 'image/png')})
    assert response.status_code == 200
    assert response.json()['data']['lines'] == [
        {'text': 'ใบลาป่วย', 'score': None},
        {'text': '27/10/2569', 'score': None},
    ]
