from app.models.categories_models import SemiconCategory, SemiconChildCategory
from app.database import engine
from datetime import datetime, timezone
from uuid import uuid4
import logging
import traceback
import httpx  # ✅ REQUIRED to make the HTTP request

logger = logging.getLogger(__name__)

# 🔁 Fetch next available SCID number
async def get_next_semicon_category_counter():
    docs = await engine.find(SemiconCategory)
    max_id = 0
    for doc in docs:
        try:
            if doc.semicon_category_id is not None:
                current = int(doc.semicon_category_id.split("-")[1])
                max_id = max(max_id, current)
        except Exception:
            continue
    return max_id + 1


# 🔁 Generator for SSCID numbers
class ChildCategoryCounter:
    def __init__(self):
        self.counter = 1

    def next(self):
        val = self.counter
        self.counter += 1
        return val


# 🔨 Recursive child builder
def build_child_category(data: dict, parent_id: str, counter: ChildCategoryCounter) -> SemiconChildCategory:
    now = datetime.now(timezone.utc)
    this_id = f"SCCID-{counter.next()}"

    children_data = data.get("Children", [])
    children = [
        build_child_category(child, this_id, counter)
        for child in children_data
    ]

    return SemiconChildCategory(
        id=uuid4(),
        semicon_child_category_id=this_id,
        semicon_child_parent_id= parent_id,
        digikey_child_category_id=data["CategoryId"],
        digikey_child_name=data["Name"],
        digikey_parent_id=str(data.get("ParentId")) if data.get("ParentId") is not None else None,
        product_count=data.get("ProductCount", 0),
        child_categories=children,
        created_by="admin",
        modified_by="admin",
        created_date=now,
        modified_date=now,
        status=True
    ) # type: ignore


# 🎯 Main category builder
def build_category(data: dict, scid_number: int) -> SemiconCategory:
    now = datetime.now(timezone.utc)
    scid = f"SCID-{scid_number}"
    counter = ChildCategoryCounter()

    children_data = data.get("Children", [])
    child_categories = [
        build_child_category(child, scid, counter)
        for child in children_data
    ]

    return SemiconCategory(
        id=uuid4(),
        semicon_category_id=scid,
        digikey_category_id=data["CategoryId"],
        digikey_name=data["Name"],
        digikey_parent_id=str(data.get("ParentId")) if data.get("ParentId") is not None else None,
        product_count=data.get("ProductCount", 0),
        child_categories=child_categories,
        created_by="admin",
        modified_by="admin",
        created_date=now,
        modified_date=now,
        status=True
    ) # type: ignore


# 🚀 Main sync function
async def fetch_and_sync_semicon_categories():
    url = "http://172.232.110.10:8000/api/digikey/categories"

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            res = await client.get(url)
            res.raise_for_status()
            json_data = res.json()

        categories = json_data.get("Categories", [])
        count = 0

        scid_counter = await get_next_semicon_category_counter()

        for cat_data in categories:
            category_doc = build_category(cat_data, scid_counter)

            existing = await engine.find_one(
                SemiconCategory,
                SemiconCategory.digikey_category_id == cat_data["CategoryId"]
            )

            if existing:
                existing.digikey_name = category_doc.digikey_name
                existing.product_count = category_doc.product_count
                existing.digikey_parent_id = category_doc.digikey_parent_id
                existing.modified_by = "admin"
                existing.modified_date = datetime.now(timezone.utc)
                existing.child_categories = category_doc.child_categories
                await engine.save(existing)
                logger.info(f"✅ saved category: {existing.digikey_name}")
            else:
                await engine.save(category_doc)
                logger.info(f"✅ saved category: {category_doc.digikey_name}")
                scid_counter += 1
            
            count += 1

        return {
            "status": "success",
            "message": f"✅ Synced {count} categories",
            "saved_count": count
        }

    except Exception as e:
        logger.error("❌ Failed to sync categories:\n%s", traceback.format_exc())
        return {
            "status": "failure",
            "message": "Failed to sync categories.",
            "error": str(e)
        }
