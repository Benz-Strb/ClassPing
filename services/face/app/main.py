import hmac

from fastapi import FastAPI, Request

from app.config import Settings
from app.engine import FaceEngine
from app.errors import error_response, install_error_handlers

PUBLIC_PATHS = {"/health"}


def create_app(settings: Settings, engine: FaceEngine) -> FastAPI:
    app = FastAPI(title="ClassPing face service", docs_url=None, redoc_url=None)
    install_error_handlers(app)

    @app.middleware("http")
    async def require_token(request: Request, call_next):
        if request.url.path not in PUBLIC_PATHS:
            given = request.headers.get("x-face-token", "")
            if not hmac.compare_digest(given.encode(), settings.token.encode()):
                return error_response(401, "UNAUTHORIZED", "ไม่มีสิทธิ์เรียกระบบตรวจใบหน้า")
        return await call_next(request)

    @app.get("/health")
    def health():
        return {
            "data": {
                "ok": True,
                "model": engine.model_name,
                "embeddingSize": engine.embedding_size,
            }
        }

    return app
