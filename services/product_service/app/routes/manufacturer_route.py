from fastapi import APIRouter, Depends, HTTPException, Query
from odmantic import ObjectId
from datetime import datetime
from typing import Optional
from app.database import engine, client
from app.models.manufacturers_models import SemiconManufacturer
from app.models.semicon_products import SemiconProduct
from app.models.semicon_products_details import SemiconProduct as SemiconProducts
from app.schemas.manufacturers_schema import (
    SemiconManufacturerCreateSchema,
    SemiconManufacturerUpdateSchema,
)
#rom app.counter get_next_manufacturer_counter
from app.models.semicon_products import SemiconProduct as SemiconProductModel
from fastapi.encoders import jsonable_encoder
from app.services.sync_semicon_manufacturers import fetch_and_sync_semicon_manufacturers
import logging

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/product")




@router.post("/sync/manufacturers/all", tags=["Sync"])
async def sync_semicon_manufacturers():
    result = await fetch_and_sync_semicon_manufacturers()
    if result["status"] == "success":
        return {
            "error": False,
            "message": f"Synced {result.get('saved_count', 0)} manufacturers successfully",
            "data": []
        }
    else:
        raise HTTPException(
            status_code=500,
            detail={
                "error": True,
                "message": "Failed to sync manufacturers",
                "data": []
            }
        )
def transform_mongo_doc(doc):
    """Transform MongoDB document to standard API response format"""
    doc_dict = doc.dict()
    
    # Create ordered dictionary with _id first
    ordered_dict = {
        "created_by": doc_dict.get("created_by"),
        "created_date": doc_dict.get("created_date").isoformat().replace("+00:00", "Z") if doc_dict.get("created_date") else None,
        "digikey_manufacturer_id": doc_dict.get("digikey_manufacturer_id"),
        "digikey_name": doc_dict.get("digikey_name"),
        "modified_by": doc_dict.get("modified_by"),
        "modified_date": doc_dict.get("modified_date").isoformat().replace("+00:00", "Z") if doc_dict.get("modified_date") else None,
        "semicon_manufacturer_id": doc_dict.get("semicon_manufacturer_id"),
        "status": doc_dict.get("status")
    }
    
    return ordered_dict


@router.get("/manufacturer/all", tags=["Semicon Manufacturer"])
async def get_all_manufacturers():
    """Get all manufacturers with standardized response format"""
    try:
        raw_data = await engine.find(SemiconManufacturer)
        cleaned_data = [transform_mongo_doc(doc) for doc in raw_data]
        
        return {
            "error": False,
            "message": "Manufacturers fetched successfully",
            "data": jsonable_encoder(cleaned_data)
        }
    except Exception as e:
        logger.error(f"Error fetching manufacturers: {str(e)}")
        # Fallback to raw MongoDB query if ODMantic validation fails
        raw_docs = await engine.find(SemiconManufacturer, limit=1000)
        cleaned_data = []

        for doc in raw_docs:
            try:
                manufacturer = SemiconManufacturer.model_validate(doc)
                cleaned_data.append(transform_mongo_doc(manufacturer))
            except Exception as e:
                logger.warning(f"Skipping invalid manufacturer document: {e}")

        return {
            "error": False,
            "message": "Manufacturers fetched successfully (some invalid documents may have been skipped)",
            "data": jsonable_encoder(cleaned_data)
        }


@router.get("/manufacturer/{manufacturer_id}/products", tags=["Products by Manufacturer"])
async def get_products_by_manufacturer(
    manufacturer_id: str,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Max number of records to return"),
):
    """
    Get all products filtered by semicon_manufacturer_id with pagination.
    """
    # Query products by semicon_manufacturer_id and active status=True
    products = await engine.find(
        SemiconProduct,
        SemiconProduct.semicon_manufacturer_id == manufacturer_id,
        skip=skip,
        limit=limit
    )
    if not products:
        raise HTTPException(status_code=404, detail=f"No products found for manufacturer ID {manufacturer_id}")

    return {
        "status": "success",
        "count": len(products),
        "data": jsonable_encoder(products),
        "pagination": {
            "skip": skip,
            "limit": limit
        }
    }


@router.get("/manufacturer/{manufacturer_id}/products/count", tags=["Products by Manufacturer"])
async def get_products_count_by_manufacturer(manufacturer_id: str):
    """
    Get count of products for a specific manufacturer
    
    Args:
        manufacturer_id: The manufacturer ID from semicon_products_details collection
    
    Returns:
        Count of products associated with the manufacturer
    """
    try:
        # Clean and validate manufacturer_id
        manufacturer_id = str(manufacturer_id).strip()
        if not manufacturer_id:
            raise HTTPException(
                status_code=400,
                detail={"error": True, "message": "Manufacturer ID cannot be empty or just whitespace"}
            )
        
        # Count products for this manufacturer
        count = await engine.count(
            SemiconProduct,
            SemiconProduct.Manufacturer.semicon_manufacturer_id == str(manufacturer_id)
        )
        
        logger.info(f"Counted {count} products for manufacturer '{manufacturer_id}'")
        
        return {
            "error": False,
            "message": f"Successfully counted products for manufacturer '{manufacturer_id}'",
            "data": {"count": count}
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions (400, 404, etc.)
        raise
    except Exception as e:
        logger.error(f"Error counting products for manufacturer '{manufacturer_id}': {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"error": True, "message": f"Internal server error while counting products"}
        )
@router.get("/analytics/count/manufacturers", tags=["Analytics"])
async def get_manufacturer_counts():
    """Get counts of active manufacturers with details"""
    try:
        # Access the raw MongoDB collection to bypass odmantic validation
        collection = engine.get_collection(SemiconManufacturer)
        
        # Fetch all manufacturers
        manufacturers = await collection.find({"status": True}).to_list(None)
        
        total_active_manufacturers = len(manufacturers)
        
        manufacturers_data = []
        
        for manufacturer in manufacturers:
            manufacturer_info = {
                "name": manufacturer.get("digikey_name", "Unknown"),
                "manufacturer_id": manufacturer.get("semicon_manufacturer_id", ""),
            }
            
            manufacturers_data.append(manufacturer_info)
        
        return {
            "error": False,
            "message": "Manufacturer counts retrieved successfully",
            "data": {
                "total_active_manufacturers": total_active_manufacturers,
                "manufacturers": manufacturers_data
            }
        }
        
    except Exception as e:
        logger.error(f"Error counting manufacturers: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": True,
                "message": f"Failed to count manufacturers: {str(e)}",
                "data": []
            }
        )
@router.get("/manufacturers/get-active", tags=["Semicon Manufacturers"])
async def get_manufacturers_with_products():
    """
    Get all manufacturers that have at least one active product
    """
    # Step 1: Fetch only active products
    collection = engine.get_collection(SemiconProducts)
    mongo_matches = await collection.find({"status": True}).to_list(length=None)
    #print(mongo_matches)


    # Step 2: Extract unique manufacturer IDs
    manufacturer_ids = {
        doc.get("semicon_manufacturer_id")
        for doc in mongo_matches
        if doc.get("semicon_manufacturer_id")
    }
    
    print(2)
    if not manufacturer_ids:
        raise HTTPException(
            status_code=404,
            detail={
                "status": "failure",
                "message": "No manufacturers with active products found"
            }
        )
    # Step 3: Fetch manufacturer details using raw MongoDB query
    manufacturer_collection = engine.get_collection(SemiconManufacturer)
    manufacturer_docs = await manufacturer_collection.find({
        "semicon_manufacturer_id": {"$in": list(manufacturer_ids)}
    }).to_list(length=None)
    
    # Convert raw documents to SemiconManufacturer objects
    manufacturers = []
    for doc in manufacturer_docs:
        try:
            manufacturer = SemiconManufacturer.model_validate(doc)
            manufacturers.append(manufacturer)
        except Exception as e:
            logger.warning(f"Skipping invalid manufacturer document: {e}")
    print(3)

    return {
        "status": "success",
        "count": len(manufacturers),
        "data": [m.model_dump() for m in manufacturers]
    }
#@router.get("/by-manufacturer/{manufacturer_id}", tags=["Products"])

@router.get("/manufacturer2/{manufacturer_id}/products", tags=["Products by Manufacturer"])
async def get_products_by_manufacturer2(
    manufacturer_id: str,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records to return")
):
    """
    Get all products for a specific manufacturer
    
    Args:
        manufacturer_id: The manufacturer ID from semicon_products_details collection
        skip: Number of records to skip for pagination
        limit: Maximum number of records to return
    
    Returns:
        List of products associated with the manufacturer
    """
    try:
        # Clean and validate manufacturer_id
        manufacturer_id = str(manufacturer_id).strip()
        if not manufacturer_id:
            raise HTTPException(
                status_code=400,
                detail={"error": True, "message": "Manufacturer ID cannot be empty or just whitespace"}
            )
        
        # Check if manufacturer exists
        manufacturer_doc = await engine.find_one(
            SemiconManufacturer,
            SemiconManufacturer.semicon_manufacturer_id == str(manufacturer_id)
        )
        if not manufacturer_doc:
            raise HTTPException(
                status_code=404,
                detail={"error": True, "message": f"Manufacturer with ID '{manufacturer_id}' not found in manufacturer table"}
            )
        
        # Get all products for this manufacturer
        products = await engine.find(
            SemiconProducts,
            SemiconProducts.Manufacturer.semicon_manufacturer_id == str(manufacturer_id),
            limit=limit,
            skip=skip
        )
        
        # Build mapping from semicon_products to get manufacturerPartNumber and enrich
        semicon_parts = [p.semicon_part_number for p in products if getattr(p, "semicon_part_number", None)]
        mpn_map = {}
        if semicon_parts:
            sp_collection = engine.get_collection(SemiconProductModel)
            sp_docs = await sp_collection.find({"semicon_part_number": {"$in": semicon_parts}}).to_list(length=None)
            mpn_map = {doc.get("semicon_part_number"): doc.get("manufacturerPartNumber") for doc in sp_docs}
        
        # Transform products to response format, adding manufacturerPartNumber when available
        response_data = []
        for product in products:
            item = jsonable_encoder(product)
            semipn = getattr(product, "semicon_part_number", None)
            item["manufacturerPartNumber"] = mpn_map.get(semipn)
            response_data.append(item)
        
        # Get total count for pagination
        total_count = await engine.count(
            SemiconProducts,
            SemiconProducts.Manufacturer.semicon_manufacturer_id == str(manufacturer_id)
        )
        
        logger.info(f"Retrieved {len(response_data)} products for manufacturer '{manufacturer_id}'")
        
        return {
            "error": False,
            "message": f"Successfully retrieved {len(response_data)} products for manufacturer '{manufacturer_id}'",
            "data": jsonable_encoder(response_data),
            "pagination": {
                "total": total_count,
                "skip": skip,
                "limit": limit
            }
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions (400, 404, etc.)
        raise
    except Exception as e:
        logger.error(f"Error retrieving products for manufacturer '{manufacturer_id}': {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"error": True, "message": f"Internal server error while retrieving products"}
        )
