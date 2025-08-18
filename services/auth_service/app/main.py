from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import asyncio
from sqlalchemy.exc import OperationalError

from app.register import router as register_router
from app.login import router as login_router
from app.Admin_login import router as admin_login_router
#from app.OrderManager import router as Order_login_router
#from app.Productmanager_login import router as product_manager_login_router
#from app.UserManager import router as user_manager_login_router
from app.kafka_producer import start_kafka, stop_kafka
from app.kafka_consumer import start_consumer
from app.database import engine, Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start Kafka producer
    try:
        await start_kafka()
        logger.info("✅ Kafka producer started")
    except Exception as e:
        logger.warning(f"⚠️ Kafka startup failed: {e}. Continuing without Kafka.")

    # Wait for DB
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

    yield

    consumer_task.cancel()
    await stop_kafka()
    logger.info("🛑 Kafka producer stopped")

# Initialize FastAPI
app = FastAPI(lifespan=lifespan)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(register_router)
app.include_router(login_router)
app.include_router(admin_login_router)
# app.include_router(Order_login_router)
# app.include_router(product_manager_login_router)
# app.include_router(user_manager_login_router)