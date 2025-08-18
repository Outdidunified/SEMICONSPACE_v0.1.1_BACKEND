import httpx
import logging
from app.models.manufacturers_models import SemiconManufacturer
from app.database import engine
from datetime import datetime
import uuid
import traceback

logger = logging.getLogger(__name__)


async def get_next_semicon_manufacturer_counter() -> int:
    """Finds the next SMID-xxx counter by scanning existing manufacturer IDs."""
    docs = await engine.find(SemiconManufacturer)
    max_id = 0
    for doc in docs:
        try:
            if doc.semicon_manufacturer_id is not None:
                current = int(doc.semicon_manufacturer_id.split("-")[1])
                max_id = max(max_id, current)
        except Exception:
            continue
    return max_id + 1


async def fetch_and_sync_semicon_manufacturers() -> dict:
    print("🔄 Fetching and syncing manufacturers from DigiKey.. ")
    url = "http://172.232.110.10:8000/api/digikey/manufacturers"
    timeout = httpx.Timeout(350)
    created_by = "admin"
    modified_by = "admin"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            print(1)
            response = await client.get(url)
            response.raise_for_status()
            manufacturers_data = response.json().get("Manufacturers", [])
    except Exception as e:
        logger.error(f"❌ Failed to fetch manufacturers from DigiKey:\n{traceback.format_exc()}")
        return {
            "status": "failure",
            "message": "Failed to fetch manufacturers.",
            "error": str(e)
        }

    logger.info(f"🔁 Fetched {len(manufacturers_data)} manufacturers")

    smid_counter = await get_next_semicon_manufacturer_counter()
    added_count = 0
    updated_count = 0

    for mfg in manufacturers_data:
        digikey_id = mfg["Id"]
        name = mfg["Name"]
        semicon_id = f"SMID-{smid_counter}"  # We keep this tied to DigiKey ID

        now = datetime.utcnow()

        existing = await engine.find_one(SemiconManufacturer, SemiconManufacturer.digikey_manufacturer_id == digikey_id)

        if existing:
            existing.digikey_name = name
            existing.modified_by = modified_by
            existing.modified_date = now
            await engine.save(existing)
            updated_count += 1
            logger.info(f"🔁 Updated manufacturer: {name}")
        else:
            new_mfg = SemiconManufacturer(
                #id=str(uuid.uuid4()),
                semicon_manufacturer_id=semicon_id,
                digikey_manufacturer_id=digikey_id,
                digikey_name=name,
                created_by=created_by,
                modified_by=modified_by,
                created_date=now,
                modified_date=now,
                status=True
            ) # pyright: ignore[reportCallIssue]
            await engine.save(new_mfg)
            added_count += 1
            logger.info(f"✅ Added manufacturer: {name}")
            smid_counter += 1

    return {
        "status": "success",
        "added_count": added_count,
        "updated_count": updated_count,
        "message": f"✅ Added {added_count}, Updated {updated_count} manufacturers",
        "saved_count": added_count + updated_count
    }
