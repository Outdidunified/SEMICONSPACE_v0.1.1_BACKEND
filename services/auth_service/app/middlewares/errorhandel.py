from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import logging

# Centralized logger
logger = logging.getLogger("my_app")


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Handle standard HTTP exceptions (404, 403, 401, etc.)
    """
    logger.error(f"⚠️ HTTP Error {exc.status_code}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": exc.detail if isinstance(exc.detail, str) else "Error occurred"
        },
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handle request validation errors (422)
    """
    missing_fields = []
    for error in exc.errors():
        if error["type"] == "missing":
            missing_fields.append(error["loc"][-1])
        elif error["type"] == "string_type" and error["msg"] == "Field required":
            missing_fields.append(error["loc"][-1])

    logger.warning(f"⚠️ Validation error: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "message": "Missing or invalid required fields",
            "data": missing_fields if missing_fields else []
        },
    )


async def internal_exception_handler(request: Request, exc: Exception):
    """
    Handle uncaught exceptions (500)
    """
    logger.exception(f"💥 Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error. Please try again later."
        },
    )


# Function to register all handlers in FastAPI app
def register_exception_handlers(app):
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, internal_exception_handler)
