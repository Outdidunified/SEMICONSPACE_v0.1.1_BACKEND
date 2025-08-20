# Atomic counters for ID generation
from typing import Optional
from odmantic import AIOEngine
from pymongo import ReturnDocument

from app.models.counter import Counter
from app.middleware.database import engine


async def get_next_counter(name: str, db: AIOEngine = engine) -> int:
    """Return the next integer for a named counter using an atomic DB increment.

    This avoids race conditions when called concurrently (e.g., via asyncio.gather).
    """
    coll = db.get_collection(Counter)
    doc: Optional[dict] = await coll.find_one_and_update(
        {"name": name},
        {"$inc": {"value": 1}, "$setOnInsert": {"name": name}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    # When upserting with $inc, missing value starts from 0 -> becomes 1
    return int(doc["value"])  # type: ignore[index]


# Wrappers for each type
async def get_next_category_counter() -> int:
    return await get_next_counter("category")


async def get_next_manufacturer_counter() -> int:
    return await get_next_counter("manufacturer")


async def get_next_variant_counter() -> int:
    return await get_next_counter("variant")


async def get_next_pricing_counter() -> int:
    return await get_next_counter("pricing")


async def get_next_parameter_counter() -> int:
    return await get_next_counter("parameter")


async def get_vendor_id() -> int:
    return await get_next_counter("vendor")