import importlib.util
import io
import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

spec = importlib.util.spec_from_file_location('leave_ocr_worker', Path(__file__).with_name('main.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class Reader:
    def read(self, image):
        return 'TEST EVIDENCE\nRest 2 days'


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(worker.create_app(Reader(), 'x' * 32))
        self.headers = {'X-OCR-Token': 'x' * 32}

    def test_images_and_pdf(self):
        for extension, mime in [('PNG', 'image/png'), ('PDF', 'application/pdf')]:
            with self.subTest(extension=extension):
                data = io.BytesIO()
                Image.new('RGB', (100, 100), 'white').save(data, format=extension)
                response = self.client.post('/leave/ocr', headers=self.headers,
                                            files={'image': ('test.' + extension.lower(), data.getvalue(), mime)})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(len(response.json()['data']['lines']), 2)

    def test_auth_before_parsing_upload(self):
        self.assertEqual(self.client.post('/leave/ocr', content=b'bad').status_code, 401)

    def test_invalid_file(self):
        response = self.client.post('/leave/ocr', headers=self.headers,
                                    files={'image': ('bad.png', b'bad', 'image/png')})
        self.assertEqual(response.status_code, 400)

    def test_provider_failure(self):
        class Unavailable:
            def read(self, image):
                raise RuntimeError('private provider detail')
        client = TestClient(worker.create_app(Unavailable(), 'x' * 32))
        data = io.BytesIO()
        Image.new('RGB', (100, 100), 'white').save(data, format='PNG')
        response = client.post('/leave/ocr', headers=self.headers, files={'image': ('x.png', data.getvalue())})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private provider detail', response.text)

    def test_transfers_images_and_scanned_pdf(self):
        for extension, mime in [('PNG', 'image/png'), ('PDF', 'application/pdf')]:
            data = io.BytesIO()
            Image.new('RGB', (100, 100), 'white').save(data, format=extension)
            response = self.client.post('/transfers/ocr', headers=self.headers,
                files={'image': (f'curriculum.{extension.lower()}', data.getvalue(), mime)})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json()['data']['lines']), 2)

    def test_transfers_require_auth_and_reject_invalid_images(self):
        self.assertEqual(self.client.post('/transfers/ocr', content=b'bad').status_code, 401)
        response = self.client.post('/transfers/ocr', headers=self.headers, files={'image': ('bad.png', b'bad', 'image/png')})
        self.assertEqual(response.status_code, 400)

    def test_transfer_pdf_page_limit(self):
        import pypdfium2 as pdfium
        data = io.BytesIO()
        document = pdfium.PdfDocument.new()
        for _ in range(101):
            page = document.new_page(100, 100)
            page.close()
        document.save(data)
        document.close()
        response = self.client.post('/transfers/ocr', headers=self.headers, files={'image': ('large.pdf', data.getvalue(), 'application/pdf')})
        self.assertEqual(response.status_code, 400)
        self.assertIn('100', response.json()['error']['message'])

    def test_health_and_no_face_engine(self):
        self.assertEqual(self.client.get('/health').json()['service'], 'leave-ocr')
        self.assertNotIn('app.engine', sys.modules)
        self.assertNotIn('insightface', sys.modules)

    def test_timetable_upload_auth_images_and_pdf(self):
        self.assertEqual(self.client.post('/schedules/ocr', content=b'bad').status_code, 401)
        for extension, mime in [('PNG', 'image/png'), ('PDF', 'application/pdf')]:
            data = io.BytesIO()
            Image.new('RGB', (100, 100), 'white').save(data, format=extension)
            response = self.client.post('/schedules/ocr', headers=self.headers,
                files={'image': (f'timetable.{extension.lower()}', data.getvalue(), mime)})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json()['data']['lines']), 2)


if __name__ == '__main__':
    unittest.main()
