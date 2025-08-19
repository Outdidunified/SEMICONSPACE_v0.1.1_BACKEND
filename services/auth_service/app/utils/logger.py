# app/utils/logger.py
import logging
import sys

# -----------------------------
# Formatter
# -----------------------------
formatter = logging.Formatter(
    "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

# -----------------------------
# Console handler only
# -----------------------------
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(formatter)

# -----------------------------
# App logger
# -----------------------------
logger = logging.getLogger("my_app")
logger.setLevel(logging.INFO)
logger.addHandler(console_handler)

# -----------------------------
# Enable library logs (e.g., aiokafka)
# -----------------------------
logging.getLogger("aiokafka").setLevel(logging.INFO)
logging.getLogger("aiokafka").addHandler(console_handler)

# -----------------------------
# Usage examples
# -----------------------------
# logger.info("✅ Server started successfully")
# logger.warning("⚠️ Something might be wrong")
# logger.error("❌ Critical error occurred")
