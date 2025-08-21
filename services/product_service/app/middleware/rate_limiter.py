import os
import time
import asyncio
from typing import Callable, Dict, Tuple, Awaitable
from fastapi import Request
from starlette.responses import JSONResponse, Response
from app.utils.logging_config import get_logger

# Simple in-memory, per-IP rate limiter middleware
# Configure via env:
# - RATE_LIMIT_WINDOW_SECONDS (default 900 = 15 minutes)
# - RATE_LIMIT_MAX_REQUESTS (default =500)

logger = get_logger("rate_limit")


def register_rate_limiter(app) -> None:
    window_seconds = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "900"))
    max_requests = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "1000"))

    lock = asyncio.Lock()
    # counters: ip -> (count, window_start_monotonic)
    counters: Dict[str, Tuple[int, float]] = {}

    @app.middleware("http")
    async def rate_limiter(request: Request, call_next: Callable[[Request], Awaitable[Response]]):  # type: ignore
        # Try to respect proxy header if present, else fall back to client ip
        client_ip = request.headers.get("x-forwarded-for")
        if client_ip:
            client_ip = client_ip.split(",")[0].strip()
        else:
            client_ip = request.client.host if request.client else "unknown"

        now = time.monotonic()

        async with lock:
            count, start_ts = counters.get(client_ip, (0, now))
            # Reset the window if expired
            if now - start_ts >= window_seconds:
                count, start_ts = 0, now
            count += 1
            counters[client_ip] = (count, start_ts)

        if count > max_requests:
            retry_after = max(1, int(window_seconds - (now - start_ts)))
            logger.warning(
                f"429 Too Many Requests from {client_ip} ({count}/{max_requests})"
            )
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "message": "Too many requests, try again later."
                },
                headers={"Retry-After": str(retry_after)}
            )

        # Within limit
        return await call_next(request)