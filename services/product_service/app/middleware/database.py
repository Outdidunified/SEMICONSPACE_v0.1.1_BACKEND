import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from odmantic import AIOEngine

load_dotenv()

mongo_url = os.getenv("MONGODB_URL", "")
if not mongo_url:
    raise ValueError("MONGODB_URL environment variable is not set")

client = AsyncIOMotorClient(mongo_url, uuidRepresentation="standard")
engine = AIOEngine(client=client, database="SEMICON_PRODUCT_SERVICE_V_1")
