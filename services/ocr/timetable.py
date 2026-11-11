"""Read timetable PDFs as text, falling back to OCR for scanned documents."""
from contextlib import closing

import pypdfium2 as pdfium

from app.documents import PDF_LOCK, document_frames
from app.errors import FaceError


def read_timetable_lines(data, reader, lock):
    if data.startswith(b'%PDF-'):
        with PDF_LOCK, closing(pdfium.PdfDocument(data)) as document:
            if not 1 <= len(document) <= 100:
                raise FaceError(400, 'INVALID_DOCUMENT', 'PDF ต้องมี 1–100 หน้า')
            pages = []
            for index in range(len(document)):
                with closing(document[index]) as page, closing(page.get_textpage()) as textpage:
                    pages.append(textpage.get_text_range())
        if all(len(text.strip()) >= 40 for text in pages):
            return [{'text': line.strip(), 'score': None}
                    for page in pages for line in page.splitlines() if line.strip()]
    lines = []
    with lock:
        for frame in document_frames(data, max_pages=100):
            result = reader.read(frame)
            if isinstance(result, str):
                lines.extend({'text': text.strip(), 'score': None}
                             for text in result.splitlines() if text.strip())
            else:
                lines.extend({'text': text, 'score': score}
                             for text, score in result if text.strip())
    return lines
