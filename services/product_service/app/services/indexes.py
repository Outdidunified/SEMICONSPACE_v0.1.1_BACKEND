from pymongo import ASCENDING
from app.middleware.database import engine
from app.models.semicon_products import SemiconProduct
from app.models.semicon_products_details import SemiconProduct as ProductDetails


async def create_indexes() -> None:
    """Create only the minimal indexes requested to reduce storage usage.

    - semicon_part_number (unique)
    - manufacturerPartNumber (non-unique)
    - name (non-unique)
    """

    # semicon_products
    sp_col = engine.get_collection(SemiconProduct)
    try:
        await sp_col.create_index([("semicon_part_number", ASCENDING)], unique=True)
    except Exception:
        # Ignore if the index already exists or creation fails
        pass
    try:
        await sp_col.create_index([("manufacturerPartNumber", ASCENDING)])
        await sp_col.create_index([("name", ASCENDING)])
    except Exception:
        pass

    # semicon_product_details
    spd_col = engine.get_collection(ProductDetails)
    try:
        await spd_col.create_index([("semicon_part_number", ASCENDING)], unique=True)
    except Exception:
        pass
    try:
        await spd_col.create_index([("name", ASCENDING)])
    except Exception:
        pass