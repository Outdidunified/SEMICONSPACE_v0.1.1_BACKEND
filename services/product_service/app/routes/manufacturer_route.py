from fastapi import APIRouter, HTTPException, Query
from odmantic import ObjectId
from fastapi.encoders import jsonable_encoder
from app.middleware.database import engine
from app.models.manufacturers_models import SemiconManufacturer
from app.models.semicon_products import SemiconProduct
from app.models.semicon_products_details import SemiconProduct as SemiconProducts
from app.models.semicon_products import SemiconProduct as SemiconProductModel
from app.services.sync_semicon_manufacturers import fetch_and_sync_semicon_manufacturers
from app.utils.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/product")


# ---------------- Sync Manufacturers ----------------
@router.post("/sync/manufacturers/all", tags=["Sync"])
async def sync_semicon_manufacturers():
    """Sync all manufacturers from external source"""
    try:
        result = await fetch_and_sync_semicon_manufacturers()
        if result["status"] == "success":
            return {
                "status": "success",
                "message": f"Synced {result.get('saved_count', 0)} manufacturers successfully",
                "data": result
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to sync manufacturers")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing manufacturers: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# ---------------- Utility: Transform Mongo Doc ----------------
def transform_mongo_doc(doc):
    """Transform MongoDB document to standard API response format"""
    doc_dict = doc.dict()
    return {
        "created_by": doc_dict.get("created_by"),
        "created_date": doc_dict.get("created_date").isoformat().replace("+00:00", "Z") if doc_dict.get("created_date") else None,
        "digikey_manufacturer_id": doc_dict.get("digikey_manufacturer_id"),
        "digikey_name": doc_dict.get("digikey_name"),
        "modified_by": doc_dict.get("modified_by"),
        "modified_date": doc_dict.get("modified_date").isoformat().replace("+00:00", "Z") if doc_dict.get("modified_date") else None,
        "semicon_manufacturer_id": doc_dict.get("semicon_manufacturer_id"),
        "status": doc_dict.get("status")
    }



#------------get all Manufacturers WITH OUT pagenation------
@router.get("/manufacturer/all", tags=["Semicon Manufacturer"])
async def get_all_manufacturersall():
    """
    Get all manufacturers without pagination
    """
    try:
        raw_data = await engine.find(SemiconManufacturer)
        cleaned_data = [transform_mongo_doc(doc) for doc in raw_data]

        return {
            "status": "success",
            "message": "Manufacturers fetched successfully",
            "data": jsonable_encoder(cleaned_data)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching manufacturers: {str(e)}")
        try:
            raw_docs = await engine.find(SemiconManufacturer)
            cleaned_data = []
            for doc in raw_docs:
                try:
                    manufacturer = SemiconManufacturer.model_validate(doc)
                    cleaned_data.append(transform_mongo_doc(manufacturer))
                except Exception as inner_e:
                    logger.warning(f"Skipping invalid manufacturer document: {inner_e}")

            return {
                "status": "success",
                "message": "Manufacturers fetched successfully (some invalid documents skipped)",
                "data": jsonable_encoder(cleaned_data)
            }
        except Exception as inner_e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch manufacturers: {str(inner_e)}")

# ---------------- Get All Manufacturers ----------------
@router.get("/manufacturer/all/index", tags=["Semicon Manufacturer"])
async def get_all_manufacturers(
    page: int = Query(1, ge=1, description="Page number"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records to return")
):
    """
    Get all manufacturers with pagination and standardized response format
    """
    try:
        raw_data = await engine.find(SemiconManufacturer, skip=skip, limit=limit)
        cleaned_data = [transform_mongo_doc(doc) for doc in raw_data]
        total_count = await engine.count(SemiconManufacturer)

        return {
            "status": "success",
            "message": "Manufacturers fetched successfully",
            "data": {
                "manufacturers": jsonable_encoder(cleaned_data),
                "pagination": {"total": total_count, "skip": skip, "limit": limit}
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching manufacturers: {str(e)}")
        try:
            raw_docs = await engine.find(SemiconManufacturer, limit=limit, skip=skip)
            cleaned_data = []
            for doc in raw_docs:
                try:
                    manufacturer = SemiconManufacturer.model_validate(doc)
                    cleaned_data.append(transform_mongo_doc(manufacturer))
                except Exception as inner_e:
                    logger.warning(f"Skipping invalid manufacturer document: {inner_e}")

            total_count = await engine.count(SemiconManufacturer)

            return {
                "status": "success",
                "message": "Manufacturers fetched successfully (some invalid documents skipped)",
                "data": {
                    "manufacturers": jsonable_encoder(cleaned_data),
                    "pagination": {"total": total_count, "skip": skip, "limit": limit}
                }
            }
        except Exception as inner_e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch manufacturers: {str(inner_e)}")


# ---------------- Get Products Count by Manufacturer ----------------
@router.get("/manufacturer/{manufacturer_id}/products/count", tags=["Products by Manufacturer"])
async def get_products_count_by_manufacturer(manufacturer_id: str):
    """Get the count of products for a specific manufacturer"""
    try:
        manufacturer_id = str(manufacturer_id).strip()
        if not manufacturer_id:
            raise HTTPException(status_code=400, detail="Manufacturer ID cannot be empty or whitespace")

        count = await engine.count(
            SemiconProducts,
            SemiconProducts.Manufacturer.semicon_manufacturer_id == manufacturer_id
        )

        return {
            "status": "success",
            "message": f"Counted {count} products for manufacturer '{manufacturer_id}'",
            "data": {"count": count}
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error counting products: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error while counting products")


# ---------------- Get Categories by Manufacturer ----------------
@router.get("/manufacturer/{manufacturer_id}/categories", tags=["Products by Manufacturer"])
async def get_categories_by_manufacturer(
    manufacturer_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=10000)
):
    """Get unique SEMICON category IDs for all products of a manufacturer, with product counts per category"""
    try:
        manufacturer_id = str(manufacturer_id).strip()
        if not manufacturer_id:
            raise HTTPException(status_code=400, detail="Manufacturer ID cannot be empty or whitespace")

        # Use semicon_products collection which stores semicon_category_id
        collection = engine.get_collection(SemiconProductModel)

        match_stage = {
            "$match": {
                "semicon_manufacturer_id": manufacturer_id,
                "semicon_category_id": {"$ne": None}
            }
        }  # Uses compound index (semicon_manufacturer_id, semicon_category_id) if available

        # Aggregate unique SEMICON categories with product counts
        pipeline = [
            match_stage,
            {
                "$group": {
                    "_id": "$semicon_category_id",
                    "product_count": {"$sum": 1}
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "semicon_category_id": "$_id",
                    "product_count": 1
                }
            },
            {"$sort": {"product_count": -1}},
            {"$skip": skip},
            {"$limit": limit}
        ]

        results = await collection.aggregate(pipeline).to_list(length=None)

        # Get total unique SEMICON category count (without pagination)
        count_pipeline = [
            match_stage,
            {"$group": {"_id": "$semicon_category_id"}},
            {"$count": "total"}
        ]
        count_doc = await collection.aggregate(count_pipeline).to_list(length=None)
        total_count = count_doc[0]["total"] if count_doc else 0

        return {
            "status": "success",
            "message": f"Found {len(results)} semicon categories for manufacturer '{manufacturer_id}'",
            "data": {
                "categories": results,
                "pagination": {"total": total_count, "skip": skip, "limit": limit}
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching semicon categories for manufacturer {manufacturer_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error while fetching categories")


# ---------------- Analytics: Active Manufacturer Counts ----------------
@router.get("/analytics/count/manufacturers", tags=["Analytics"])
async def get_manufacturer_counts():
    """Get the count of active manufacturers and their details"""
    try:
        collection = engine.get_collection(SemiconManufacturer)
        manufacturers = await collection.find({"status": True}).to_list(None)
        total_active_manufacturers = len(manufacturers)
        manufacturers_data = [
            {"name": m.get("digikey_name", "Unknown"), "manufacturer_id": m.get("semicon_manufacturer_id", "")}
            for m in manufacturers
        ]
        return {
            "status": "success",
            "message": "Manufacturer counts retrieved successfully",
            "data": {"total_active_manufacturers": total_active_manufacturers, "manufacturers": manufacturers_data}
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error counting manufacturers: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to count manufacturers")


# ---------------- Get Products by Manufacturer with MPN ----------------
@router.get("/manufacturer/{manufacturer_id}/products", tags=["Products by Manufacturer"])
async def get_products_by_manufacturer2(
    manufacturer_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000)
):
    """Get products for a manufacturer, including mapped MPNs"""
    try:
        manufacturer_id = str(manufacturer_id).strip()
        if not manufacturer_id:
            raise HTTPException(status_code=400, detail="Manufacturer ID cannot be empty or whitespace")

        manufacturer_doc = await engine.find_one(
            SemiconManufacturer,
            SemiconManufacturer.semicon_manufacturer_id == manufacturer_id
        )
        if not manufacturer_doc:
            raise HTTPException(status_code=404, detail=f"Manufacturer with ID '{manufacturer_id}' not found")

        products = await engine.find(
            SemiconProducts,
            SemiconProducts.Manufacturer.semicon_manufacturer_id == manufacturer_id,
            skip=skip,
            limit=limit
        )

        semicon_parts = [p.semicon_part_number for p in products if getattr(p, "semicon_part_number", None)]
        mpn_map = {}
        if semicon_parts:
            sp_collection = engine.get_collection(SemiconProductModel)
            sp_docs = await sp_collection.find({"semicon_part_number": {"$in": semicon_parts}}).to_list(length=None)
            mpn_map = {doc.get("semicon_part_number"): doc.get("manufacturerPartNumber") for doc in sp_docs}

        response_data = []
        for product in products:
            item = jsonable_encoder(product)
            semipn = getattr(product, "semicon_part_number", None)
            item["manufacturerPartNumber"] = mpn_map.get(semipn)
            response_data.append(item)

        total_count = await engine.count(
            SemiconProducts,
            SemiconProducts.Manufacturer.semicon_manufacturer_id == manufacturer_id
        )

        return {
            "status": "success",
            "message": f"Successfully retrieved {len(response_data)} products for manufacturer '{manufacturer_id}'",
            "data": {
                "products": jsonable_encoder(response_data),
                "pagination": {"total": total_count, "skip": skip, "limit": limit}
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching products for manufacturer {manufacturer_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
