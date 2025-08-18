from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging
from fastapi.staticfiles import StaticFiles
from app.database import client
#from app.job.digikey import save_digikey_product_to_db
from app.kafka.kafka_producer import start_kafka, stop_kafka
from app.kafka.kafka_consumer import start_consumer

# Routers
from app.routes.products_route import router as products_router
from app.routes.categories_route import router as categories_router
# from app.routes.pricing_route import router as pricing_router
# from app.routes.specification_route import router as specification_route
from app.routes.manufacturer_route import router as manufacturer_route
from app.autogenerate import initialize_counters

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)





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

    consumer_task = asyncio.create_task(start_consumer())
    logger.info("🎧 Kafka consumer task launched")

    await initialize_counters()
    print("✅ Counters initialized")

    #await save_digikey_product_to_db()

    yield

   
    consumer_task.cancel()
    logger.info("🛑 Kafka consumer task cancelled")

    await stop_kafka()
    logger.info("✅ Kafka producer stopped")


app = FastAPI(lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#app.mount("/static", StaticFiles(directory="static"), name="static")
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # If it's a 200 "failure" response, return it as-is
    if exc.status_code == 200 and isinstance(exc.detail, dict):
        return JSONResponse(
            status_code=200,
            content=exc.detail
        )

    # Default error wrapper
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "Error": "true",
            "status_code": exc.status_code,
            "message": exc.detail
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    message = "; ".join([f"{e['loc'][-1]}: {e['msg']}" for e in errors])
    return JSONResponse(
        status_code=422,
        content={
            "Error": "true",
            "status_code": 422,
            "message": message
        }
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "Error": "true",
            "status_code": 500,
            "message": "Internal Server Error"
        }
    )

app.include_router(products_router)
app.include_router(categories_router)
app.include_router(manufacturer_route)
