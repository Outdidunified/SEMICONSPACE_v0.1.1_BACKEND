import os
import logging
import logging.config
from logging.handlers import TimedRotatingFileHandler

_configured = False


def _default_log_dir() -> str:
    # Place logs at repo root/services/product_service/logs
    base_dir = os.path.dirname(os.path.dirname(__file__))  # .../services/product_service/app -> .../services/product_service
    log_dir = os.path.join(base_dir, "logs")
    return log_dir


def setup_logging(log_level: str | None = None, log_dir: str | None = None) -> None:
    """Initialize centralized logging for the whole application.

    - Console + daily rotating file handlers
    - Keeps 7 days of history
    - Captures uvicorn logs as well
    """
    global _configured
    if _configured:
        return

    level_name = (log_level or os.getenv("LOG_LEVEL", "INFO")).upper()
    level = getattr(logging, level_name, logging.INFO)

    logs_path = log_dir or os.getenv("LOG_DIR") or _default_log_dir()
    os.makedirs(logs_path, exist_ok=True)

    app_log_file = os.path.join(logs_path, "app.log")
    access_log_file = os.path.join(logs_path, "access.log")

    # Build dictConfig
    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {
                "format": "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
            "access": {
                "format": "%(asctime)s | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "level": level,
                "formatter": "standard",
                "stream": "ext://sys.stdout",
            },
            "file_app": {
                "class": "logging.handlers.TimedRotatingFileHandler",
                "level": level,
                "formatter": "standard",
                "filename": app_log_file,
                "when": "midnight",
                "backupCount": 7,
                "encoding": "utf-8",
            },
            "file_access": {
                "class": "logging.handlers.TimedRotatingFileHandler",
                "level": level,
                "formatter": "access",
                "filename": access_log_file,
                "when": "midnight",
                "backupCount": 7,
                "encoding": "utf-8",
            },
        },
        "root": {
            "level": level,
            "handlers": ["console", "file_app"],
        },
        "loggers": {
            # Uvicorn internal loggers
            "uvicorn": {
                "level": level,
                "handlers": ["console", "file_app"],
                "propagate": False,
            },
            "uvicorn.error": {
                "level": level,
                "handlers": ["console", "file_app"],
                "propagate": False,
            },
            "uvicorn.access": {
                "level": level,
                "handlers": ["console", "file_access"],
                "propagate": False,
            },
        },
    }

    logging.config.dictConfig(config)
    _configured = True


def get_logger(name: str | None = None) -> logging.Logger:
    """Get a module-specific logger after setup_logging() has been called."""
    return logging.getLogger(name)