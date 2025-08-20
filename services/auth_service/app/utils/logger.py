# app/utils/logger.py
import logging
import sys
import os
from logging.handlers import TimedRotatingFileHandler

# -----------------------------
# Formatter
# -----------------------------
formatter = logging.Formatter(
    "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

# -----------------------------
# Console handler
# -----------------------------
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(formatter)

# -----------------------------
# File handler (daily rotation, keep 7 days)
# -----------------------------
logs_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "logs")
os.makedirs(logs_dir, exist_ok=True)
log_file_path = os.path.join(logs_dir, "app.log")
file_handler = TimedRotatingFileHandler(log_file_path, when="midnight", interval=1, backupCount=7, encoding="utf-8")
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(formatter)

# -----------------------------
# App logger
# -----------------------------
logger = logging.getLogger("my_app")
logger.setLevel(logging.INFO)
logger.addHandler(console_handler)
logger.addHandler(file_handler)

# -----------------------------
# Enable library logs (e.g., aiokafka)
# -----------------------------
aiokafka_logger = logging.getLogger("aiokafka")
aiokafka_logger.setLevel(logging.INFO)
aiokafka_logger.addHandler(console_handler)
aiokafka_logger.addHandler(file_handler)

# -----------------------------
# Usage examples
# -----------------------------
# logger.info("✅ Server started successfully")
# logger.warning("⚠️ Something might be wrong")
# logger.error("❌ Critical error occurred")
