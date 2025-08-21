from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
from app.utils.logging_config import setup_logging, get_logger
from fastapi.staticfiles import StaticFiles
from app.middleware.database import client
#from app.job.digikey import save_digikey_product_to_db
from app.jobs.kafka.kafka_producer import start_kafka, stop_kafka
from app.jobs.kafka.kafka_consumer import start_consumer
from app.middleware import errorhandel

# Routers
from app.routes.products_route import router as products_router
from app.routes.categories_route import router as categories_router
# from app.routes.pricing_route import router as pricing_router
# from app.routes.specification_route import router as specification_route
from app.routes.manufacturer_route import router as manufacturer_route
from app.utils.autogenerate import initialize_counters
from app.services.indexes import create_indexes

setup_logging()
logger = get_logger(__name__)





@asynccontextmanager
async def lifespan(app: FastAPI):

    while True:
        try:
            await start_kafka()
            logger.info("✅ Kafka producer started")
            break
        except Exception:
            logger.warning("⏳ Kafka producer not ready, retrying in 3s...", exc_info=True)
            await asyncio.sleep(3)

    
    while True:
        try:
            await client.admin.command("ping")
            logger.info("✅ MongoDB connected successfully")
            break
        except Exception:
            logger.warning("⏳ MongoDB not ready, retrying in 3s...", exc_info=True)
            await asyncio.sleep(3)

    from typing import Coroutine, Any, cast
    consumer_task: asyncio.Task[None] = asyncio.create_task(cast(Coroutine[Any, Any, None], start_consumer()))
    logger.info("🎧 Kafka consumer task launched")

    await initialize_counters()
    print("✅ Counters initialized")

    # Create indexes in background (non-blocking)
    try:
        asyncio.create_task(create_indexes())
        logger.info("🧱 Index creation task launched")
    except Exception:
        logger.warning("Failed to launch index creation task", exc_info=True)

    #await save_digikey_product_to_db()

    yield

   
    consumer_task.cancel()
    logger.info("🛑 Kafka consumer task cancelled")

    await stop_kafka()
    logger.info("✅ Kafka producer stopped")


app = FastAPI(lifespan=lifespan)

# Register request/response logging middleware
from app.middleware.request_logging import register_request_logging
register_request_logging(app)

# Rate limiter disabled

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
app.include_router(products_router)
app.include_router(categories_router)
app.include_router(manufacturer_route)

errorhandel.register_exception_handlers(app)