# app/utils/counters.py
from app.models.counter import Counter
from app.database import engine



async def get_next_counter(name: str, db=engine) -> int:
    # Find existing counter
    counter = await db.find_one(Counter, Counter.name == name)
    if not counter:
        counter = Counter(name=name, value=1)
        await db.save(counter)
        return counter.value
    
    # Increment
    counter.value += 1
    await db.save(counter)
    return counter.value

# Wrappers for each type
async def get_next_category_counter(): return await get_next_counter("category")
async def get_next_manufacturer_counter(): return await get_next_counter("manufacturer")
async def get_next_variant_counter(): return await get_next_counter("variant")
async def get_next_pricing_counter(): return await get_next_counter("pricing")
async def get_next_parameter_counter(): return await get_next_counter("parameter")
async def get_vendor_id(): return await get_next_counter("vendor")
