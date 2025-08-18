import asyncio
from app.database import client  
db = client["product_service"]  

async def create_collections():
    await db.create_collection("categories")
    await db.create_collection("products")
    await db.create_collection("manufacturers")
    await db.create_collection("product_pricings")
    await db.create_collection("product_specifications")
asyncio.run(create_collections())
