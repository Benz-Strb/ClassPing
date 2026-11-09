"""Leave-evidence OCR worker; never constructs or imports a face engine."""
import hmac
import os
import sys
from pathlib import Path
from threading import Lock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'face'))

from fastapi import FastAPI, File, Header, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from app.documents import MAX_DOCUMENT_BYTES, document_frames
from app.errors import FaceError


def create_app(reader, token: str) -> FastAPI:
    if len(token) < 32:
        raise ValueError('LEAVE_OCR_SERVICE_TOKEN must contain at least 32 characters')
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    lock = Lock()

    @app.middleware('http')
    async def protect_upload(request, call_next):
        if request.url.path in ('/leave/ocr', '/transfers/ocr'):
            if not hmac.compare_digest(token, request.headers.get('x-ocr-token', '')):
                return JSONResponse(status_code=401, content={'error': {'code': 'UNAUTHORIZED'}})
            length = request.headers.get('content-length', '')
            if length.isdigit() and int(length) > MAX_DOCUMENT_BYTES + 1024 * 1024:
                return JSONResponse(status_code=413, content={'error': {'message': 'ไฟล์หลักฐานต้องไม่เกิน 25 MB'}})
        return await call_next(request)

    @app.get('/health')
    def health():
        return {'service': 'leave-ocr', 'ready': True}

    @app.post('/leave/ocr')
    async def read(image: UploadFile = File(...), x_ocr_token: str = Header(default='')):
        if not hmac.compare_digest(token, x_ocr_token):
            return JSONResponse(status_code=401, content={'error': {'code': 'UNAUTHORIZED'}})
        data = await image.read(MAX_DOCUMENT_BYTES + 1)
        await image.close()
        if len(data) > MAX_DOCUMENT_BYTES:
            return JSONResponse(status_code=413, content={'error': {'message': 'ไฟล์หลักฐานต้องไม่เกิน 25 MB'}})

        def recognize():
            lines = []
            with lock:
                for frame in document_frames(data):
                    result = reader.read(frame)
                    if isinstance(result, str):
                        lines.extend({'text': text.strip(), 'score': None} for text in result.splitlines() if text.strip())
                    else:
                        lines.extend({'text': text, 'score': score} for text, score in result if text.strip())
            return {'data': {'lines': lines}}

        try:
            return await run_in_threadpool(recognize)
        except FaceError as error:
            return JSONResponse(status_code=error.status, content={'error': {'code': error.code, 'message': error.message}})
        except Exception:
            return JSONResponse(status_code=503, content={'error': {'code': 'OCR_UNAVAILABLE', 'message': 'บริการอ่านข้อความหลักฐานยังไม่พร้อม'}})

    @app.post('/transfers/ocr')
    async def transfer_read(image: UploadFile = File(...), x_ocr_token: str = Header(default='')):
        if not hmac.compare_digest(token, x_ocr_token):
            return JSONResponse(status_code=401, content={'error': {'code': 'UNAUTHORIZED'}})
        data = await image.read(10 * 1024 * 1024 + 1)
        await image.close()
        if len(data) > 10 * 1024 * 1024:
            return JSONResponse(status_code=413, content={'error': {'message': 'ไฟล์ต้องไม่เกิน 10 MB'}})

        def recognize_transfer():
            from contextlib import closing
            import pypdfium2 as pdfium
            from app.documents import PDF_LOCK
            # Text PDFs retain table rows better and avoid OCR on hundreds of pages.
            if data.startswith(b'%PDF-'):
                with PDF_LOCK, closing(pdfium.PdfDocument(data)) as document:
                    if not 1 <= len(document) <= 100:
                        raise FaceError(400, 'INVALID_DOCUMENT', 'PDF ต้องมี 1–100 หน้า')
                    pages = []
                    for index in range(len(document)):
                        with closing(document[index]) as page, closing(page.get_textpage()) as textpage:
                            pages.append(textpage.get_text_range())
                if all(len(text.strip()) >= 40 for text in pages):
                    return {'data': {'lines': [{'text': line.strip(), 'score': None} for page in pages for line in page.splitlines() if line.strip()]}}
            lines = []
            with lock:
                for frame in document_frames(data, max_pages=100):
                    result = reader.read(frame)
                    if isinstance(result, str):
                        lines.extend({'text': text.strip(), 'score': None} for text in result.splitlines() if text.strip())
                    else:
                        lines.extend({'text': text, 'score': score} for text, score in result if text.strip())
            return {'data': {'lines': lines}}
        try:
            return await run_in_threadpool(recognize_transfer)
        except FaceError as error:
            return JSONResponse(status_code=error.status, content={'error': {'code': error.code, 'message': error.message}})
        except Exception:
            return JSONResponse(status_code=400, content={'error': {'code': 'INVALID_DOCUMENT', 'message': 'อ่านเอกสารไม่ได้ กรุณาตรวจไฟล์หรือลองใหม่'}})

    return app


def build_app():
    if os.getenv('TYPHOON_OCR_API_KEY', '').strip():
        from app.typhoon_ocr import TyphoonTextReader
        reader = TyphoonTextReader()
    else:
        from app.ocr import PaddleTextReader
        reader = PaddleTextReader()
    return create_app(reader, os.getenv('LEAVE_OCR_SERVICE_TOKEN', ''))
