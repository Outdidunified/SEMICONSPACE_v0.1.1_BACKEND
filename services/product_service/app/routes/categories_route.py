from fastapi import APIRouter, HTTPException, Query, status,Path
from app.services.sync_semicon_categories import fetch_and_sync_semicon_categories
from app.schemas.categories_schema import SemiconCategoryCreateSchema, SemiconCategoryUpdateSchema
from app.models.categories_models import SemiconCategory
from app.database import engine
from typing import List, Optional
from datetime import datetime
from fastapi.encoders import jsonable_encoder
#from app.models.semicon_products import SemiconProducts
from odmantic.query import QueryExpression
from app.models.semicon_products import SemiconProduct
from logging import getLogger as logger

router = APIRouter(prefix="/product")

# 🚀 Sync categories
@router.post("/sync/categories", tags=["Sync"])
async def sync_semicon_categories():
    result = await fetch_and_sync_semicon_categories()
    if result["status"] == "success":
        return {
            "error": False,
            "message": f"Synced {result.get('saved_count', 0)} categories successfully",
            "data": []
        }
    else:
        raise HTTPException(
            status_code=500,
            detail={
                "error": True,
                "message": "Failed to sync categories",
                "data": []
            }
        )

def transform_category_doc(doc):
    """Transform raw MongoDB document to standard API response format"""
    def transform_child_category(child):
        """Transform nested child category objects, excluding _id"""
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
            #"image_url": child.get("image_url"),
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
@router.get("/categories/all", tags=["Semicon Categories"])
async def get_all_semicon_categories():
    """Get all categories with standardized response format"""
    try:
        # Access the raw MongoDB collection to bypass odmantic validation
        collection = engine.get_collection(SemiconCategory)
        categories = await collection.find().to_list(None)  # Fetch all documents

        # Transform raw documents to the standardized format
        cleaned_data = [transform_category_doc(doc) for doc in categories]
        
        return {
            "error": False,
            "message": "Categories fetched successfully",
            "data": jsonable_encoder(cleaned_data)
        }
    except Exception as e:
        print(f"Error fetching categories: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": True,
                "message": f"Failed to fetch categories: {str(e)}",
                "data": []
            }
        )
@router.get("/categories/{category_id}", tags=["Semicon Categories"])
async def get_category_by_id(category_id: str):
    """Get a specific category by ID"""
    try:
        # Access the raw MongoDB collection to bypass odmantic validation
        collection = engine.get_collection(SemiconCategory)
        category = await collection.find_one({"semicon_category_id": category_id})
        
        if not category:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": True,
                    "message": f"Category with ID {category_id} not found",
                    "data": []
                }
            )
        
        # Transform the raw document to the standardized format
        transformed_category = transform_category_doc(category)
        
        return {
            "error": False,
            "message": "Category fetched successfully",
            "data": jsonable_encoder(transformed_category)
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching category: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": True,
                "message": f"Failed to fetch category: {str(e)}",
                "data": []
            }
        )

@router.get("/categories/child/{child_category_id}", tags=["Semicon Categories"])
async def get_child_category_by_id(child_category_id: str):
    """Get a specific child category by semicon_child_category_id"""
    try:
        # Access the raw MongoDB collection to bypass odmantic validation
        collection = engine.get_collection(SemiconCategory)
        
        # Search for child category across all parent categories
        pipeline = [
            {
                "$unwind": "$child_categories"
            },
            {
                "$match": {
                    "child_categories.semicon_child_category_id": child_category_id
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "parent_category": {
                        "semicon_category_id": "$semicon_category_id",
                        "digikey_name": "$digikey_name"
                    },
                    "child_category": {
                        "semicon_child_category_id": "$child_categories.semicon_child_category_id",
                        "semicon_child_parent_id": "$child_categories.semicon_child_parent_id",
                        "digikey_child_category_id": "$child_categories.digikey_child_category_id",
                        "digikey_child_name": "$child_categories.digikey_child_name",
                        "digikey_parent_id": "$child_categories.digikey_parent_id",
                        "product_count": "$child_categories.product_count",
                        "created_by": "$child_categories.created_by",
                        "created_date": "$child_categories.created_date",
                        "modified_by": "$child_categories.modified_by",
                        "modified_date": "$child_categories.modified_date",
                        "status": "$child_categories.status",
                        "child_categories": "$child_categories.child_categories"
                    }
                }
            }
        ]
        
        cursor = collection.aggregate(pipeline)
        result = await cursor.to_list(None)
        
        if not result:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": True,
                    "message": f"Child category with ID {child_category_id} not found",
                    "data": []
                }
            )
        
        # Transform the result to match the standard format
        child_category_data = result[0]["child_category"]
        parent_category_data = result[0]["parent_category"]
        
        # Transform nested child categories if any
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
            "error": False,
            "message": "Child category fetched successfully",
            "data": {
                "parent_category": jsonable_encoder(parent_category_data),
                "child_category": jsonable_encoder(child_category_data)
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching child category: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": True,
                "message": f"Failed to fetch child category: {str(e)}",
                "data": []
            }
        )
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
# @router.get("/categories/getproducts/{category_id}", tags=["Semicon Categories"])
# async def get_products_by_category(category_id: str):
#     products = await engine.find(
#         SemiconProduct,
#         SemiconProduct.semicon_category_id == category_id
#     )

#     if not products:
#         raise HTTPException(
#             status_code=404,
#             detail={"status": "failure", "message": "No products found for this category"}
#         )

#     return {
#         "status": "success",
#         "data": [product.model_dump() for product in products]
#     }
# @router.get("/semicon_child_categories/getproducts/{semicon_child_category_id}", tags=["Semicon Categories"])
# async def get_products_by_child_category(semicon_child_category_id: str):
#     products = await engine.find(
#         SemiconProduct,
#         SemiconProduct.semicon_child_category_id == semicon_child_category_id
#     )

#     if not products:
#         raise HTTPException(
#             status_code=404,
#             detail={"status": "failure", "message": "No products found for this category"}
#         )

#     return {
#         "status": "success",
#         "data": [product.model_dump() for product in products]
#     }
# @router.get("/categories/{category_id}/subcategories/{child_category_id}/products", tags=["Semicon Categories"])
# async def get_products_by_category_and_subcategory(category_id: str, child_category_id: str):
#     """
#     Get products where BOTH category and subcategory match
#     """
#     products = await engine.find(
#         SemiconProduct,
#         {
#             "semicon_category_id": category_id,
#             "semicon_child_category_id": child_category_id
#         }
#     )

#     if not products:
#         raise HTTPException(
#             status_code=200,
#             detail={
#                  "error": False,
#                  "message": "No products found for this category & subcategory",
#                  "data": []
#             }
#         )

#     return {
#         "status": "success",
#         "data": [product.model_dump() for product in products]
#     }
@router.get("/get/categories/active", tags=["Semicon Categories"])
async def get_categories_with_active_products():
    """
    Get all categories that have at least one active product
    """
    print("Fetching categories with active products...")    
    # Step 1: Fetch only active products
    product_collection = engine.get_collection(SemiconProduct)

    print(f"p:{product_collection}")
    mongo_matches = await product_collection.find({"status": True}).to_list(length=None)

    # Step 2: Extract unique category IDs
    category_ids = {
        doc.get("semicon_category_id")
        for doc in mongo_matches
        if doc.get("semicon_category_id")
    }


    if not category_ids:
        raise HTTPException(
            status_code=404,
            detail={
                "status": "failure",
                "message": "No categories with active products found"
            }
        )

    # Step 3: Fetch category details using raw MongoDB query
    category_collection = engine.get_collection(SemiconCategory)
    category_docs = await category_collection.find({
        "semicon_category_id": {"$in": list(category_ids)},
        "status": True  # optional, if you only want active categories
    }).to_list(length=None)

    # Step 4: Convert raw documents to SemiconCategory objects
    categories = []
    for doc in category_docs:
        try:
            category = SemiconCategory.model_validate(doc)
            categories.append(category)
        except Exception as e:
            logger.warning(f"Skipping invalid category document: {e}")

    return {
        "status": "success",
        "count": len(categories),
        "data": [c.model_dump() for c in categories]
    }

@router.get("/categories/{category_id}/active-subcategories", tags=["Semicon Categories"])
async def get_active_subcategories_for_category(category_id: str):
    """
    Get active subcategories from a category document 
    that have at least one active product.
    """
    # Step 1: Find all active products in this category
    product_collection = engine.get_collection(SemiconProduct)
    products = await product_collection.find({
        "semicon_category_id": category_id,
        "status": True
    }).to_list(length=None)

    if not products:
        raise HTTPException(
            status_code=404,
            detail={
                "status": "failure",
                "message": f"No active products found for category {category_id}"
            }
        )

    # Step 2: Extract subcategory IDs from products
    subcategory_ids_with_products = {
        p.get("semicon_child_category_id")
        for p in products
        if p.get("semicon_child_category_id")
    }

    # Step 3: Fetch the category document
    category_collection = engine.get_collection(SemiconCategory)
    category_doc = await category_collection.find_one({
        "semicon_category_id": category_id
    })

    if not category_doc:
        raise HTTPException(
            status_code=404,
            detail={
                "status": "failure",
                "message": f"Category {category_id} not found"
            }
        )

    # Step 4: Filter child categories by IDs from products and status=True
    active_subcategories = [
        subcat for subcat in category_doc.get("child_categories", [])
        if subcat.get("semicon_child_category_id") in subcategory_ids_with_products
        and subcat.get("status") is True
    ]

    return {
        "status": "success",
        "count": len(active_subcategories),
        "data": active_subcategories
    }
@router.get("/categories/all/index", tags=["Semicon Categories"])
async def get_all_semicon_categories(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """Get all categories with pagination + standardized response format"""
    try:
        collection = engine.get_collection(SemiconCategory)

        # Count total categories
        total_count = await collection.count_documents({})

        # Pagination math
        skip = (page - 1) * limit

        # Fetch paginated documents
        categories = await collection.find().skip(skip).limit(limit).to_list(length=limit)

        # Transform raw documents
        cleaned_data = [transform_category_doc(doc) for doc in categories]

        return {
            "error": False,
            "message": "Categories fetched successfully",
            "page": page,
            "limit": limit,
            "total_categories": total_count,
            "total_pages": (total_count + limit - 1) // limit,
            "data": jsonable_encoder(cleaned_data)
        }

    except Exception as e:
        print(f"Error fetching categories: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": True,
                "message": f"Failed to fetch categories: {str(e)}",
                "data": []
            }
        )



@router.get(
    "/categories/{category_id}/subcategories/{child_category_id}/products", 
    tags=["Semicon Categories"]
)
async def get_products_by_category_and_subcategory(category_id: str, child_category_id: str):
    """
    Get products where BOTH category and subcategory match,
    including category & subcategory names.
    """
    # Fetch products
    products = await engine.find(
        SemiconProduct,
        {
            "semicon_category_id": category_id,
            "semicon_child_category_id": child_category_id
        }
    )

    if not products:
        return {
            "status": "success",
            "message": "No products found for this category & subcategory",
            "data": []
        }

    # Fetch category (with embedded children)
    category = await engine.find_one(
        SemiconCategory, 
        SemiconCategory.semicon_category_id == category_id
    )

    category_name = category.digikey_name if category else None
    subcategory_name = None

    # ✅ find the matching child inside `category.child_categories`
    if category and hasattr(category, "child_categories"):
        for child in category.child_categories:
            if child.semicon_child_category_id == child_category_id:
                subcategory_name = child.digikey_child_name
                break

    # Merge category + subcategory names into product data
    result = []
    for p in products:
        prod_dict = p.dict()
        prod_dict["category_name"] = category_name
        prod_dict["subcategory_name"] = subcategory_name
        result.append(prod_dict)

    return {
        "status": "success",
        "total_products": len(result),
        "data": result
    }
@router.get("/categories/getproducts/{category_id}", tags=["Semicon Categories"])
async def get_products_by_category(category_id: str):
    # 1. Get products in this category
    products = await engine.find(
        SemiconProduct,
        SemiconProduct.semicon_category_id == category_id
    )

    if not products:
        raise HTTPException(
            status_code=404,
            detail={"status": "failure", "message": "No products found for this category"}
        )

    # 2. Fetch category name
    category = await engine.find_one(SemiconCategory, SemiconCategory.semicon_category_id == category_id)
    category_name = category.digikey_name if category else None

    # # 3. Collect all child_category_ids from products
    # child_ids = list({p.semicon_child_category_id for p in products if p.semicon_child_category_id})

    # # 4. Fetch child categories in bulk
    # child_categories = await engine.find(SemiconChildCategory, SemiconChildCategory.semicon_child_category_id.in_(child_ids))
    # child_map = {c.semicon_child_category_id: c.name for c in child_categories}

    # 5. Format response with names
    product_list = []
    for p in products:
        product_data = p.model_dump()
        product_data["category_name"] = category_name
        # product_data["child_category_name"] = child_map.get(p.semicon_child_category_id)
        product_list.append(product_data)

    return {
        "status": "success",
        "data": product_list
    }