# main.py
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config.database import engine, Base
from app.routes.register import router as register_router
from app.routes.login import router as login_router
from app.routes.Admin_login import router as admin_login_router
from app.services.kafka_producer import start_kafka, stop_kafka
from app.services.kafka_consumer import start_consumer
from app.utils.logger import logger
from app.middlewares import errorhandel

consumer_task: asyncio.Task | None = None

# ---------------- FastAPI app ---------------- #
app = FastAPI()

# ---------------- Middleware ---------------- #
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Routers ---------------- #
app.include_router(register_router)
app.include_router(login_router)
app.include_router(admin_login_router)

# Google auth routes
from app.routes.google_auth import router as google_auth_router
app.include_router(google_auth_router)

# ---------------- Exception Handlers ---------------- #
errorhandel.register_exception_handlers(app)

# ---------------- Startup Event ---------------- #
@app.on_event("startup")
async def startup_event():
    global consumer_task
    # Start Kafka producer
    try:
        await start_kafka()
        logger.info("✅ Kafka producer started")
    except Exception as e:
        logger.warning(f"⚠️ Kafka startup failed: {e}. Continuing without Kafka.")

    # Wait for DB connection and create tables
    attempt = 0
    while True:
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("✅ Database connected and tables created")
            break
        except OperationalError as e:
            attempt += 1
            logger.warning(f"⏳ Attempt {attempt}: Waiting for DB to be ready... ({e})")
            await asyncio.sleep(5)

    # Start Kafka consumer task
    consumer_task = asyncio.create_task(start_consumer())
    logger.info("🚀 Kafka consumer task started")

# ---------------- Shutdown Event ---------------- #
@app.on_event("shutdown")
async def shutdown_event():
    global consumer_task
    if consumer_task:
        consumer_task.cancel()
        try:
            await consumer_task
        except asyncio.CancelledError:
            logger.info("🛑 Kafka consumer task stopped")
    await stop_kafka()
    logger.info("🛑 Kafka producer stopped")
