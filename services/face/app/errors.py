import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

logger = logging.getLogger("face")


class FaceError(Exception):
    """error ที่ตั้งใจส่งให้ API อ่าน code ไปทำงานต่อได้"""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


CODE_BY_STATUS = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
}


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(FaceError)
    async def face_error(_: Request, exc: FaceError):
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        return error_response(400, "BAD_REQUEST", "ข้อมูลที่ส่งมาไม่ครบหรือไม่ถูกต้อง")

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException):
        code = CODE_BY_STATUS.get(exc.status_code, "HTTP_ERROR")
        return error_response(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def unknown_error(_: Request, exc: Exception):
        # รายละเอียดเก็บใน log อย่างเดียว ไม่ส่งออกไป
        logger.exception("unhandled error", exc_info=exc)
        return error_response(500, "INTERNAL", "ระบบตรวจใบหน้ามีปัญหา")
