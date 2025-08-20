from fastapi import APIRouter, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from app.middleware.database import engine
from app.models.semicon_products import SemiconProduct
from app.models.categories_models import SemiconCategory
from app.services import sync_semicon_categories as categories_sync
from app.utils.logging_config import get_logger as logger

router = APIRouter(prefix="/product")
# -------------------- Sync Categories -------------------- #
@router.post("/sync/categories", tags=["Sync"])
async def sync_semicon_categories():
    try:
        result = await categories_sync.fetch_and_sync_semicon_categories()
        if result.get("status") == "success":
            return {
                "success": True,
                "message": f"Synced {result.get('saved_count', 0)} categories successfully",
                "data": []
            }
        raise HTTPException(status_code=500, detail="Failed to sync categories")
    except HTTPException:
        raise
    except Exception as e:
        logger().error(f"Error syncing categories: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Exception occurred while syncing categories: {str(e)}"
        )

# -------------------- Helper: Transform Category -------------------- #
def transform_category_doc(doc):
    """Transform raw MongoDB document to standard API response format"""
    def transform_child_category(child):
        return {
            "semicon_child_category_id": child.get("semicon_child_category_id"),
            "semicon_child_parent_id": child.get("semicon_child_parent_id"),
            "digikey_child_category_id": child.get("digikey_child_category_id"),
            "digikey_child_name": child.get("digikey_child_name"),
            "digikey_parent_id": child.get("digikey_parent_id"),
            "product_count": child.get("product_count", 0),
            "created_by": child.get("created_by"),
            "created_date": child.get("created_date"),
            "modified_by": child.get("modified_by"),
            "modified_date": child.get("modified_date"),
            "status": child.get("status", True),
            "child_categories": [transform_child_category(grandchild) for grandchild in child.get("child_categories", [])]
        }

    return {
        "_id": str(doc["_id"]) if "_id" in doc else None,
        "semicon_category_id": doc.get("semicon_category_id"),
        "semicon_parent_id": doc.get("semicon_parent_id"),
        "digikey_category_id": doc.get("digikey_category_id"),
        "digikey_name": doc.get("digikey_name"),
        "digikey_parent_id": doc.get("digikey_parent_id"),
        "product_count": doc.get("product_count", 0),
        "created_by": doc.get("created_by"),
        "created_date": doc.get("created_date"),
        "modified_by": doc.get("modified_by"),
        "modified_date": doc.get("modified_date"),
        "status": doc.get("status", True),
        "image_url": doc.get("image_url"),
        "child_categories": [transform_child_category(child) for child in doc.get("child_categories", [])]
    }

# -------------------- Get All Categories (No Pagination) -------------------- #
@router.get("/categories/all", tags=["Semicon Categories"])
async def get_all_semicon_categories2():
    try:
        collection = engine.get_collection(SemiconCategory)
        categories = await collection.find().to_list(None)
        cleaned_data = [transform_category_doc(doc) for doc in categories]

        return {
            "success": True,
            "message": "Categories fetched successfully",
            "data": jsonable_encoder(cleaned_data)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger().error(f"Error fetching categories: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch categories: {str(e)}")

# -------------------- Get Category by ID -------------------- #
@router.get("/categories/{category_id}", tags=["Semicon Categories"])
async def get_category_by_id(category_id: str):
    try:
        collection = engine.get_collection(SemiconCategory)
        category = await collection.find_one({"semicon_category_id": category_id})

        if not category:
            raise HTTPException(status_code=404, detail=f"Category with ID {category_id} not found")

        transformed_category = transform_category_doc(category)

        return {
            "success": True,
            "message": "Category fetched successfully",
            "data": jsonable_encoder(transformed_category)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger().error(f"Error fetching category {category_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch category: {str(e)}")

# -------------------- Get Categories with Pagination -------------------- #
@router.get("/categories/all/index", tags=["Semicon Categories"])
async def get_all_semicon_categories_paginated(page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100)):
    try:
        collection = engine.get_collection(SemiconCategory)
        total_count = await collection.count_documents({})
        skip = (page - 1) * limit

        categories = await collection.find().skip(skip).limit(limit).to_list(length=limit)
        cleaned_data = [transform_category_doc(doc) for doc in categories]

        return {
            "success": True,
            "message": "Categories fetched successfully",
            "data": {
                "page": page,
                "limit": limit,
                "total_categories": total_count,
                "total_pages": (total_count + limit - 1) // limit,
                "categories": cleaned_data
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger().error(f"Error fetching paginated categories: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch categories: {str(e)}")

# -------------------- Get Child Category by ID -------------------- #
@router.get("/categories/child/{child_category_id}", tags=["Semicon Categories"])
async def get_child_category_by_id(child_category_id: str):
    try:
        collection = engine.get_collection(SemiconCategory)
        pipeline = [
            # Match first so the index on child_categories.semicon_child_category_id can be used
            {"$match": {"child_categories.semicon_child_category_id": child_category_id}},
            {"$project": {
                "_id": 0,
                "parent_category": {"semicon_category_id": "$semicon_category_id", "digikey_name": "$digikey_name"},
                # Extract the first matching child without unwinding the whole array
                "child_category": {
                    "$first": {
                        "$filter": {
                            "input": "$child_categories",
                            "as": "c",
                            "cond": {"$eq": ["$$c.semicon_child_category_id", child_category_id]}
                        }
                    }
                }
            }}
        ]
        cursor = collection.aggregate(pipeline)
        result = await cursor.to_list(None)

        if not result or not result[0].get("child_category"):
            raise HTTPException(status_code=404, detail=f"Child category {child_category_id} not found")

        child_category_data = result[0]["child_category"]
        parent_category_data = result[0]["parent_category"]

        if "child_categories" in child_category_data:
            child_category_data["child_categories"] = [
                {
                    "semicon_child_category_id": grandchild.get("semicon_child_category_id"),
                    "semicon_child_parent_id": grandchild.get("semicon_child_parent_id"),
                    "digikey_child_category_id": grandchild.get("digikey_child_category_id"),
                    "digikey_child_name": grandchild.get("digikey_child_name"),
                    "digikey_parent_id": grandchild.get("digikey_parent_id"),
                    "product_count": grandchild.get("product_count", 0),
                    "created_by": grandchild.get("created_by"),
                    "created_date": grandchild.get("created_date"),
                    "modified_by": grandchild.get("modified_by"),
                    "modified_date": grandchild.get("modified_date"),
                    "status": grandchild.get("status", True)
                }
                for grandchild in child_category_data.get("child_categories", [])
            ]

        return {
            "success": True,
            "message": "Child category fetched successfully",
            "data": {
                "parent_category": jsonable_encoder(parent_category_data),
                "child_category": jsonable_encoder(child_category_data)
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger().error(f"Error fetching child category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch child category: {str(e)}")

# -------------------- Get Products by Category & Subcategory with Pagination -------------------- #
@router.get("/categories/{category_id}/subcategories/{child_category_id}/getproducts", tags=["Semicon Categories"])
async def get_products_by_category_and_subcategory_paginated(
    category_id: str,
    child_category_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    try:
        collection = engine.get_collection(SemiconProduct)
        total_count = await collection.count_documents({
            "semicon_category_id": category_id,
            "semicon_child_category_id": child_category_id
        })

        if total_count == 0:
            raise HTTPException(status_code=404, detail="No products found for this category & subcategory")

        skip = (page - 1) * limit
        # Fetch ODMantic models to use model_dump safely
        products = await engine.find(
            SemiconProduct,
            (SemiconProduct.semicon_category_id == category_id) &
            (SemiconProduct.semicon_child_category_id == child_category_id),
            skip=skip,
            limit=limit
        )

        category = await engine.find_one(SemiconCategory, SemiconCategory.semicon_category_id == category_id)
        category_name = category.digikey_name if category else None
        subcategory_name = None
        if category and hasattr(category, "child_categories"):
            for child in category.child_categories:
                if child.semicon_child_category_id == child_category_id:
                    subcategory_name = child.digikey_child_name
                    break

        result = []
        for p in products:
            prod_dict = p.model_dump()
            prod_dict["category_name"] = category_name
            prod_dict["subcategory_name"] = subcategory_name
            result.append(prod_dict)

        return {
            "success": True,
            "message": "Products fetched successfully",
            "page": page,
            "limit": limit,
            "total_products": total_count,
            "total_pages": (total_count + limit - 1) // limit,
            "data": result
        }
    except HTTPException:
        raise
    except Exception as e:
        logger().error(f"Error fetching products: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch products: {str(e)}")

# -------------------- Get Products by Category (No Subcategory Filter) -------------------- #
@router.get("/categories/{category_id}/getproducts", tags=["Semicon Categories"])
async def get_products_by_category(category_id: str):
    try:
        products = await engine.find(SemiconProduct, SemiconProduct.semicon_category_id == category_id)
        if not products:
            raise HTTPException(status_code=404, detail="No products found for this category")

        category = await engine.find_one(SemiconCategory, SemiconCategory.semicon_category_id == category_id)
        category_name = category.digikey_name if category else None

        result = []
        for p in products:
            prod_dict = p.model_dump()
            prod_dict["category_name"] = category_name
            result.append(prod_dict)

        return {
            "success": True,
            "message": "Products fetched successfully",
            "data": result
        }
    except HTTPException:
        raise
    except Exception as e:
        logger().error(f"Error fetching products: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch products: {str(e)}")

@router.get("/analytics/count/categories", tags=["Analytics"])
async def get_category_counts():
    """Get counts of all categories and subcategories with names"""
    try:
        # Access the raw MongoDB collection to bypass odmantic validation
        collection = engine.get_collection(SemiconCategory)
        
        # Fetch all categories
        categories = await collection.find().to_list(None)
        
        total_parent_categories = len(categories)
        total_child_categories = 0
        total_grandchild_categories = 0
        
        categories_data = []
        
        for category in categories:
            parent_info = {
                "name": category.get("digikey_name", "Unknown"),
                "parent_category_id": category.get("semicon_category_id", ""),
                "child_count": len(category.get("child_categories", [])),
                "children": []
            }
            
            # Count child categories
            child_categories = category.get("child_categories", [])
            total_child_categories += len(child_categories)
            
            # Process child categories
            for child in child_categories:
                child_info = {
                    "name": child.get("digikey_child_name", "Unknown"),
                    "child_category_id": child.get("semicon_child_category_id", ""),
                    "grandchild_count": len(child.get("child_categories", []))
                }
                
                # Count grandchild categories
                grandchild_categories = child.get("child_categories", [])
                total_grandchild_categories += len(grandchild_categories)
                
                parent_info["children"].append(child_info)
            
            categories_data.append(parent_info)
        
        return {
            "error": False,
            "message": "Category counts retrieved successfully",
            "data": {
                "total_parent_categories": total_parent_categories,
                "total_child_categories": total_child_categories,
                "total_grandchild_categories": total_grandchild_categories,
                "categories": categories_data
            }
        }
        
    except Exception as e:
        print(f"Error counting categories: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": True,
                "message": f"Failed to count categories: {str(e)}",
                "data": []
            }
        )