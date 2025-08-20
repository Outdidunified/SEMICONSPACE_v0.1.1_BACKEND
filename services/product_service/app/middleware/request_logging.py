import time
from typing import Callable, Awaitable
from fastapi import Request
from starlette.responses import Response
from app.utils.logging_config import get_logger

logger = get_logger("request")

async def _get_body_preview(request: Request, max_len: int = 500) -> str:
    try:
        body = await request.body()
        if not body:
            return ""
        text = body.decode(errors="ignore")
        return text[:max_len]
    except Exception:
        return ""

def register_request_logging(app):
    @app.middleware("http")
    async def log_requests(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:  # type: ignore
        start_time = time.perf_counter()
        client = request.client.host if request.client else "-"
        method = request.method
        path = request.url.path
        query = request.url.query
        ua = request.headers.get("user-agent", "-")

        # Optional: small preview of body for non-binary requests
        body_preview = ""
        if method in {"POST", "PUT", "PATCH"}:
            body_preview = await _get_body_preview(request)

        logger.info(f"REQ {method} {path}?{query} from {client} UA={ua} body={body_preview}")

        try:
            response = await call_next(request)
            return response
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000
            status = getattr(response, "status_code", 0) if 'response' in locals() else 500
            logger.info(f"RES {method} {path} {status} {duration_ms:.2f}ms")