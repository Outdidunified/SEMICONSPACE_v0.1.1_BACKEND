from fastapi import APIRouter, HTTPException, Query, Request, Path
from typing import Optional, List
import httpx
from urllib.parse import quote
from odmantic import query as odm_query
from app.services.sync_semicon_products import fetch_and_sync_semicon_product
from app.middleware.database import engine
from app.models.semicon_products import SemiconProduct
from app.models.semicon_products_details import SemiconProduct as SemiconProductDetails
from app.models.categories_models import SemiconCategory, SemiconChildCategory
from odmantic.query import QueryExpression, desc
from app.models.manufacturers_models import SemiconManufacturer
from uuid import UUID
from typing import Optional
import asyncio
from datetime import datetime
from app.utils.logging_config import get_logger
from app.schemas.sync_schema import DigikeySyncRequest

# Module-level logger for this route module
logger = get_logger(__name__)
router = APIRouter(prefix="/product")

DIGIKEY_BASE_URL = "http://172.232.110.10:8000/api/digikey"  # change to your DigiKey proxy URL

# ======= EXISTING ENDPOINTS =======@router.post("/sync/digikey")
@router.post("/sync/digikey")
async def sync_digikey_product(payload: "DigikeySyncRequest"):
    try:
        from app.schemas.sync_schema import DigikeySyncRequest
        query = payload.query
        max_items = payload.max_items  # already validated

        # Use tuned httpx client
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=5.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10)
        ) as client:
            search_url = f"{DIGIKEY_BASE_URL}/search/keyword"
            search_resp = await client.post(search_url, json={"query": query})
            if search_resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Search API failed")

            search_data = search_resp.json()
            if not search_data.get("success") or not search_data.get("products"):
                raise HTTPException(status_code=404, detail="No products found in search")

            products_basic = search_data["products"][:max_items]

            # Pre-check existence in one DB call
            to_check = [f"SPNID-{p.get('manufacturerPartNumber','')}" for p in products_basic]
            existing_list = await engine.find(
                SemiconProduct,
                odm_query.in_(SemiconProduct.semicon_part_number, to_check)
            )
            existing_set = {p.semicon_part_number for p in existing_list}

            to_process = [
                p for p in products_basic
                if f"SPNID-{p.get('manufacturerPartNumber','')}" not in existing_set
            ]

            synced = 0
            skipped = len(products_basic) - len(to_process)
            result_main = []

            sem = asyncio.Semaphore(6)  # limit concurrency

            async def process_product(product_basic: dict):
                nonlocal synced
                try:
                    digi_part_number = product_basic.get("digiKeyPartNumber")
                    if not digi_part_number:
                        return None

                    details_url = f"{DIGIKEY_BASE_URL}/products/{digi_part_number}/productdetails"
                    async with sem:
                        details_resp = await client.get(details_url)

                    if details_resp.status_code != 200:
                        return None

                    details_data = details_resp.json()
                    if not details_data.get("success"):
                        return None

                    merged_data = {**product_basic, **details_data.get("product", {})}

                    res = await fetch_and_sync_semicon_product(merged_data)
                    synced += 1
                    return res
                except Exception as e:
                    # log the error for debugging
                    logger.error(f"Failed to process product {product_basic.get('digiKeyPartNumber')}: {e}")
                    return None

            results = await asyncio.gather(*(process_product(pb) for pb in to_process))
            for r in results:
                if r:
                    result_main.append(r)

        return {
            "status": "success",
            "message": f"Sync completed: {synced} products synced, {skipped} products skipped (already exists or failed).",
            "data": result_main
        }

    except HTTPException as http_exc:
        raise http_exc  # Let FastAPI handler format it
    except Exception as e:
        logger.error(f"Unexpected error during DigiKey sync: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "status": "failure",
                "message": f"Unexpected error during DigiKey sync: {str(e)}"
            }
        )
@router.get("/{product_id:path}/productdetails")
async def get_product_by_id(product_id: str):
    try:
        # Try to find product by UUID or semicon_part_number
        product = None
        try:
            product_uuid = UUID(product_id)
            product = await engine.find_one(SemiconProduct, SemiconProduct.id == product_uuid)
        except ValueError:
            product = await engine.find_one(SemiconProduct, SemiconProduct.semicon_part_number == product_id)

        if not product:
            print(f"No product found for product_id: {product_id}")
            raise HTTPException(status_code=404, detail="Product not found")

        collection = engine.get_collection(SemiconProduct)
        db = collection.database

        # Step 1: Get product details from semicon_product_details collection
        product_details_doc = await db.semicon_product_details.find_one({
            "semicon_part_number": product.semicon_part_number
        })

        # Step 2: Get vendor products
        vendor_products = await db.vendor_products.find({
            "semicon_part_number": product.semicon_part_number
        }).to_list(length=None)
        
        print(f"📦 Found {len(vendor_products)} vendor products")

        # Step 3: Get product variants and parameters
        product_variants = []
        all_parameters = []
        if vendor_products:
    # Collect all variant IDs
            all_variant_ids = [vid for vp in vendor_products for vid in vp.get('product_variants', [])]
            # Just use stored parameters
            all_parameters = [p for vp in vendor_products for p in vp.get('parameters', [])]

            print(f"🔍 Looking for {len(all_variant_ids)} product variants: {all_variant_ids}")

            print(f"🔍 Looking for {len(all_variant_ids)} product variants: {all_variant_ids}")

            if all_variant_ids:
                # Get product variants
                variants = await db.product_variants.find({
                    "semicon_product_variant_id": {"$in": all_variant_ids}
                }).to_list(length=None)
                
                print(f"✅ Found {len(variants)} product variants")

                # Step 4: Get pricing details for each variant
                for variant in variants:
                    pricing_ids = variant.get('semicon_product_variant_pricing_id', [])
                    if pricing_ids:
                        pricing_docs = await db.variant_pricing.find({
                            "semicon_product_variant_pricing_id": {"$in": pricing_ids}
                        }).to_list(length=None)
                        
                        # Add pricing details to variant
                        variant['pricing_details'] = pricing_docs[0] if pricing_docs else None
                
                product_variants = variants

        # Step 5: Construct the final result structure
        result_doc = {
            "_id": str(product.id),
            "semicon_part_number": product.semicon_part_number,
            "name": product.name,
            "description": product.description,
            "image_url": product.image_url,
            "datasheet_url": product.datasheet_url,
            "quantity_available": product.quantity_available,
            "UnitPrice": product.UnitPrice,
            "currency": product.currency,
            "status": product.status,
            "manufacturerPartNumber": product.manufacturerPartNumber,
            "manufacturer_name": product.manufacturer_name,
            "created_by": product.created_by,
            "created_date": product.created_date.isoformat() if isinstance(product.created_date, datetime) else product.created_date,
            "modified_by": product.modified_by,
            "modified_date": product.modified_date.isoformat() if isinstance(product.modified_date, datetime) else product.modified_date,
            # Add structured data from lookups
            "Category": product_details_doc.get("Category") if product_details_doc else None,
            "Description": {
                "ProductDescription": product.description,
                "DetailedDescription": product_details_doc.get("DetailedDescription") if product_details_doc else None
            },
            "Manufacturer": {
                "Name": product.manufacturer_name,
                "PartNumber": product.manufacturerPartNumber
            },
            "ProductDetails": {
                "UnitPrice": product_details_doc.get("UnitPrice") if product_details_doc else product.UnitPrice,
                "ProductUrl": product_details_doc.get("ProductUrl") if product_details_doc else None,
                "BackOrderNotAllowed": product_details_doc.get("BackOrderNotAllowed") if product_details_doc else None,
                "NormallyStocking": product_details_doc.get("NormallyStocking") if product_details_doc else None,
                "Discontinued": product_details_doc.get("Discontinued") if product_details_doc else None,
                "EndOfLife": product_details_doc.get("EndOfLife") if product_details_doc else None,
                "Ncnr": product_details_doc.get("Ncnr") if product_details_doc else None,
                "ManufacturerLeadWeeks": product_details_doc.get("ManufacturerLeadWeeks") if product_details_doc else None,
                "Series": product_details_doc.get("Series") if product_details_doc else None,
                "Classifications": product_details_doc.get("Classifications") if product_details_doc else None,
                "OtherNames": product_details_doc.get("OtherNames", []) if product_details_doc else [],
                "ProductStatus": product_details_doc.get("ProductStatus") if product_details_doc else None
            },
            "VendorProducts": [
                {**vp, "parameters": all_parameters} for vp in vendor_products
            ],  # Include parameters in each VendorProduct
            "ProductVariants": product_variants
        }

        print(f"✅ Product details built successfully - VendorProducts: {len(vendor_products)}, ProductVariants: {len(product_variants)}, Parameters: {len(all_parameters)}")

        if not (product_details_doc or vendor_products or product_variants):
            print(f"No detailed data found for semicon_part_number: {product.semicon_part_number}")
            return {
                "success": True,
                "message": "Product retrieved successfully",
                "data": {
                    "id": str(product.id),
                    "name": product.name,
                    "semicon_part_number": product.semicon_part_number,
                    "imageurl": product.image_url,
                    "datasheet": product.datasheet_url,
                    "vendor_details": getattr(product, "vendor_details", []),
                    "semicon_category_id": getattr(product, "semicon_category_id", None),
                    "semicon_child_category_id": getattr(product, "semicon_child_category_id", None),
                    "created_by": product.created_by,
                    "created_date": product.created_date.isoformat() if isinstance(product.created_date, datetime) else product.created_date,
                    "modified_by": product.modified_by,
                    "modified_date": product.modified_date.isoformat() if isinstance(product.modified_date, datetime) else product.modified_date,
                    "status": product.status,
                    "detailed_info": {
                        "Category": None,
                        "Description": {
                            "ProductDescription": product.description,
                            "DetailedDescription": None
                        },
                        "Manufacturer": {
                            "Name": getattr(product, "manufacturer_name", None),
                            "PartNumber": getattr(product, "manufacturerPartNumber", None)
                        },
                        "ProductDetails": {
                            "UnitPrice": None,
                            "ProductUrl": None,
                            "BackOrderNotAllowed": None,
                            "NormallyStocking": None,
                            "Discontinued": None,
                            "EndOfLife": None,
                            "Ncnr": None,
                            "ManufacturerLeadWeeks": None,
                            "Series": None,
                            "Classifications": None,
                            "OtherNames": [],
                            "ProductStatus": None
                        },
                        "VendorProducts": [],
                        "ProductVariants": []
                    }
                }
            }

        return {
            "error": False,
            "message": "Product retrieved successfully",
            "data": {
                "id": result_doc["_id"],
                "name": result_doc["name"],
                "semicon_part_number": result_doc["semicon_part_number"],
                "imageurl": result_doc["image_url"],
                "datasheet": result_doc["datasheet_url"],
                "vendor_details": getattr(product, "vendor_details", []),
                "semicon_category_id": getattr(product, "semicon_category_id", None),
                "semicon_child_category_id": getattr(product, "semicon_child_category_id", None),
                "created_by": result_doc["created_by"],
                "created_date": result_doc["created_date"],
                "modified_by": result_doc["modified_by"],
                "modified_date": result_doc["modified_date"],
                "status": result_doc["status"],
                "quantity_available": result_doc["quantity_available"],
                "detailed_info": {
                    "Category": result_doc["Category"],
                    "Description": result_doc["Description"],
                    "Manufacturer": result_doc["Manufacturer"],
                    "ProductDetails": result_doc["ProductDetails"],
                    "VendorProducts": result_doc["VendorProducts"],
                    "ProductVariants": result_doc["ProductVariants"]
                }
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching product {product_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching product: {str(e)}")
@router.get("/analytics/count/totalproducts")
async def get_total_products():
    try:
        count = await engine.count(SemiconProduct)
        return {
            "success": True,
            "message": "Total products count retrieved successfully",
            "total_products": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error counting products: {str(e)}")
# Fetch details for one product with URL-encoding
async def fetch_details(part_number: str, client: httpx.AsyncClient):
    #encoded_part_number = quote(part_number)
    collection2 = engine.get_collection(SemiconProduct)
    # Debug print removed for performance
    products = await collection2.find_one({"semicon_part_number": part_number})
    return products if products else {"semicon_part_number": part_number, "error": "Product not found"}
    
async def safe_fetch_details(part_number: str, client: httpx.AsyncClient):
    try:
        data = await fetch_details(part_number, client)
        if not data:
            print(f"[WARN] Empty data returned for {part_number}")
        return data
    except Exception as e:
        print(f"[WARN] Failed to fetch details for {part_number}: {repr(e)}")
        return {"semicon_part_number": part_number, "error": str(e)}
@router.get("/search/{query:path}")
async def search_and_get_details(query: str):
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=5.0)) as client:
            # 1. Search in Mongo
            # Search only in semicon_product_details; remove manufacturerPartNumber filter
            # If query looks like an SMID (e.g., SMID-1234), include exact Manufacturer.semicon_manufacturer_id match
            smid_filter = []
            if isinstance(query, str) and query.upper().startswith("SMID-"):
                smid_filter = [{"Manufacturer.semicon_manufacturer_id": query}]

            search_query = {
                "$or": [
                    {"name": {"$regex": query, "$options": "i"}},
                    {"Manufacturer.Name": {"$regex": query, "$options": "i"}},
                    {"Category.ChildCategories.Name": {"$regex": query, "$options": "i"}},
                    {"Category.Name": {"$regex": query, "$options": "i"}},
                    {"semicon_part_number": {"$regex": query, "$options": "i"}},
                    *smid_filter
                ]
            }

            collection = engine.get_collection(SemiconProductDetails)
            collection2 = engine.get_collection(SemiconProduct)
            # Only search in details collection (no fallback to semicon_products)
            # Use minimal indexes: name and semicon_part_number
            mongo_matches = await collection.find(search_query, projection={"_id": 0, "semicon_part_number": 1, "name": 1}).to_list(length=30)

            mongo_part_numbers = {
                doc.get("semicon_part_number")
                for doc in mongo_matches if doc.get("semicon_part_number")
            }

            # Also search by manufacturerPartNumber in semicon_products (uses index)
            sp_matches = await collection2.find(
                {"manufacturerPartNumber": {"$regex": query, "$options": "i"}},
                projection={"_id": 0, "semicon_part_number": 1}
            ).to_list(length=30)
            mongo_part_numbers.update({doc.get("semicon_part_number") for doc in sp_matches if doc.get("semicon_part_number")})

            # 2. Get details for Mongo matches
            # Bulk fetch details in one query for performance
            mongo_details_docs = []
            if mongo_part_numbers:
                mongo_details_docs = await collection2.find({
                    "semicon_part_number": {"$in": list(mongo_part_numbers)}
                }).to_list(length=len(mongo_part_numbers))
            mongo_details = mongo_details_docs
            if mongo_details and len(mongo_details) > 0:
                return {
                    "success": True,
                    "message": "Products retrieved successfully from local database",
                    "count": len(mongo_details),
                    "data": mongo_details
                }

            # 3. DigiKey sync
            digi_url = "http://172.232.110.10:8003/product/sync/digikey"
            digi_products = []

            digi_resp = await client.post(digi_url, json={"query": query, "max_items": 10})

            if digi_resp.status_code == 404:
                # No remote products found — skip gracefully
                digi_products = []
            elif digi_resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"DigiKey sync failed ({digi_resp.status_code}): {digi_resp.text}"
                )
            else:
                try:
                    digi_data = digi_resp.json()
                except ValueError:
                    raise HTTPException(
                        status_code=502,
                        detail=f"DigiKey returned non-JSON: {digi_resp.text[:200]}"
                    )

                products = digi_data.get("data", []) or digi_data.get("products", [])
                if isinstance(products, list):
                    digi_products = products
                # else silently ignore invalid formats for performance

            digi_part_numbers = {
                p.get("semicon_part_number")
                for p in digi_products if p.get("semicon_part_number")
            }

            # 4. Only fetch DigiKey products that aren't in Mongo
            new_part_numbers = digi_part_numbers - mongo_part_numbers

            # 5. Get details for DigiKey products (bulk fetch instead of per-item)
            digi_details = []
            if new_part_numbers:
                digi_details = await collection2.find({
                    "semicon_part_number": {"$in": list(new_part_numbers)}
                }).to_list(length=len(new_part_numbers))

            # 6. Merge results
            all_results = mongo_details + digi_details
            all_results = [r for r in all_results if r]  # remove None
            if not all_results:
                # Fallback: only search in details collection, no manufacturerPartNumber filter
                fallback_query = {
                    "$or": [
                        {"name": {"$regex": query, "$options": "i"}},
                        {"Manufacturer.Name": {"$regex": query, "$options": "i"}},
                        {"Category.ChildCategories.Name": {"$regex": query, "$options": "i"}},
                        {"Category.Name": {"$regex": query, "$options": "i"}},
                        {"semicon_part_number": {"$regex": query, "$options": "i"}},
                        *smid_filter
                    ]
                }

                fallback_matches = await collection.find(fallback_query).to_list(length=30)
                fallback_part_numbers = {
                    doc.get("semicon_part_number")
                    for doc in fallback_matches if doc.get("semicon_part_number")
                }
                if fallback_part_numbers:
                    mongo_details = await collection2.find({
                        "semicon_part_number": {"$in": list(fallback_part_numbers)}
                    }).to_list(length=len(fallback_part_numbers))
                else:
                    mongo_details = []

            all_results = mongo_details + digi_details
            all_results = [r for r in all_results if r]
            if not all_results:
                raise HTTPException(status_code=404, detail="No products found")

            return {
                "success": True,
                "message": "Products retrieved successfully",
                "data": {"products": all_results,
                         "count": len(all_results)}
            }

    except httpx.ConnectError as e:
        raise HTTPException(status_code=502, detail=f"Connection failed: {str(e)}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Request error: {str(e)}")  

async def get_category_counts():
    """Get counts of all categories and subcategories with names"""
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
        
    return (
        total_parent_categories,
        total_child_categories
    )
    
@router.get("/analytics/count/all")
async def get_all_counts():
    try:
        collection = engine.get_collection(SemiconManufacturer)

        # Fetch all active manufacturers
        manufacturers = await collection.find({"status": True}).to_list(None)
        total_active_manufacturers = len(manufacturers)

        # Active categories & child categories
        total_active_category, total_active_child_category = await get_category_counts()

        # Products count
        total_product_count = await engine.count(SemiconProduct)

        return {
            "success": True,
            "message": "Fetched all counts successfully",
            "data": {
                "total_active_manufacturers": total_active_manufacturers,
                "total_active_categories": total_active_category,
                "total_active_child_categories": total_active_child_category,
                "total_products": total_product_count,
            },
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching counts: {str(e)}",
        )
    
@router.get("/fetch/all-products")
async def get_semicon_productsall(
    category_id: Optional[str] = Query(None),
    child_category_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),       # page number (default 1)
    limit: int = Query(20, ge=1, le=100)  # items per page (default 20, max 100)
):
    try:
        # Build query expression conditionally
        expr = None
        if category_id and child_category_id:
            expr = (
                (SemiconProduct.semicon_category_id == category_id) &
                (SemiconProduct.semicon_child_category_id == child_category_id)
            )
        elif category_id:
            expr = SemiconProduct.semicon_category_id == category_id
        elif child_category_id:
            expr = SemiconProduct.semicon_child_category_id == child_category_id

        # Count total matching products
        if expr is not None:
            total_count = await engine.count(SemiconProduct, expr)
        else:
            total_count = await engine.count(SemiconProduct)

        # Pagination calculation
        skip = (page - 1) * limit

        # Fetch paginated products sorted by created_date DESC
        if expr is not None:
            products = await engine.find(
                SemiconProduct,
                expr,
                sort=desc(SemiconProduct.created_date),
                skip=skip,
                limit=limit
            )
        else:
            products = await engine.find(
                SemiconProduct,
                sort=desc(SemiconProduct.created_date),
                skip=skip,
                limit=limit
            )

        if not products:
            raise HTTPException(status_code=404, detail="No products found")

        # Get unique category IDs
        category_ids = list({p.semicon_category_id for p in products})
        child_category_ids = list({p.semicon_child_category_id for p in products if p.semicon_child_category_id})

        # Fetch category names
        categories = await engine.find(
            SemiconCategory,
            SemiconCategory.semicon_category_id.in_(category_ids)
        )
        category_map = {c.semicon_category_id: c.digikey_name for c in categories}

        # Merge names into product data
        result = []
        for p in products:
            result.append({
                **p.dict(),
                "category_name": category_map.get(p.semicon_category_id),
            })

        return {
            "success": True,
            "message": "Products retrieved successfully",
            "data": {
                "page": page,
                "limit": limit,
                "total_products": total_count,
                "total_pages": (total_count + limit - 1) // limit,
                "products": result
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching products: {str(e)}"
        )

@router.get("/fetch/top-products")
async def get_top_products():
    try:
        ANALYTICS_API = "http://172.232.110.10:8006/order/admin/analytics"
        # 1. Call Analytics API
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(ANALYTICS_API)
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch analytics data")
            analytics_data = response.json()

        top_products = analytics_data.get("data", {}).get("topProducts", [])[:6]
        if not top_products:
            raise HTTPException(status_code=404, detail="No top products found")

        # 2. Extract product_ids
        product_ids = [p["product_id"] for p in top_products]

        # 3. Fetch products from DB by semicon_part_number
        products = await engine.find(
            SemiconProduct,
            SemiconProduct.semicon_part_number.in_(product_ids)
        )
        if not products:
            raise HTTPException(status_code=404, detail="No products found")

        # Build category map
        category_ids = list({p.semicon_category_id for p in products})
        categories = await engine.find(SemiconCategory, SemiconCategory.semicon_category_id.in_(category_ids))
        category_map = {c.semicon_category_id: c.digikey_name for c in categories}

        # 4. Merge analytics data + DB product data
        product_map = {p.semicon_part_number: p for p in products}
        result = []
        for tp in top_products:
            db_product = product_map.get(tp["product_id"])
            if db_product:
                result.append({
                    **db_product.dict(),
                    "category_name": category_map.get(db_product.semicon_category_id),
                    "total_unit_sold": tp["total_sold"],
                })

        return {
            "success": True,
            "message": "Top products fetched successfully",
            "data": result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/fetch/new-arrivals")
async def get_semicon_products(
    category_id: Optional[str] = Query(None),
    child_category_id: Optional[str] = Query(None)
):
    # Build query expression
    expr = QueryExpression()

    # Only fetch products that have a non-empty image_url
    expr &= SemiconProduct.image_url != None
    expr &= SemiconProduct.image_url != ""

    if category_id:
        expr &= (SemiconProduct.semicon_category_id == category_id)
    if child_category_id:
        expr &= (SemiconProduct.semicon_child_category_id == child_category_id)

    # Fetch products sorted by created_date DESC, only 8 with images
    products = await engine.find(
        SemiconProduct,
        expr,
        sort=SemiconProduct.created_date.desc(),
        limit=8
    )

    if not products:
        raise HTTPException(status_code=404, detail="No products found")

    # Get unique category IDs
    category_ids = list({p.semicon_category_id for p in products})
    child_category_ids = list({p.semicon_child_category_id for p in products if p.semicon_child_category_id})

    # Fetch category names
    categories = await engine.find(SemiconCategory, SemiconCategory.semicon_category_id.in_(category_ids))
    category_map = {c.semicon_category_id: c.digikey_name for c in categories}

    # Merge names into product data
    result = []
    for p in products:
        result.append({
            **p.dict(),
            "category_name": category_map.get(p.semicon_category_id),
            # "child_category_name": child_category_map.get(p.semicon_child_category_id)
        })

    return {"success": True, "data": result}
@router.get("/quantity-price/check/{semicon_part_number:path}/{quantity}")
async def check_product_availability(
    semicon_part_number: str,
    quantity: int = Path(..., ge=1, description="Quantity to check availability for"),
):
    """
    Availability + DigiKey-style split pricing:
    - Evaluate ALL bulk package types (TR/Tray/Bulk/Tube/Reel/Box)
    - Use their pack size for full packs
    - Put remainder into Cut Tape (CT) when available
    - Apply proper tiered pricing for each allocated chunk
    - Also return full pricing tables per variant (old functionality)
    (Excludes Digi-Reel®)
    """
    try:
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than 0")

        # --- Find product ---
        product = await engine.find_one(
            SemiconProduct, SemiconProduct.semicon_part_number == semicon_part_number
        )
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        if product.quantity_available is None:
            raise HTTPException(status_code=400, detail="Product quantity info not available")

        if product.quantity_available < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient quantity. Requested: {quantity}, Available: {product.quantity_available}",
            )

        # --- Get product variants ---
        product_details = await get_product_by_id(semicon_part_number)
        variants = product_details["data"]["detailed_info"]["ProductVariants"]

        allowed_package_types = [
            "Cut Tape (CT)", "Tape & Reel (TR)", "Tray", "Bulk", "Tube", "Reel", "Box"
        ]
        matching_variants = [
            v for v in variants
            if v.get("package_type") in allowed_package_types
            and "DigiReel" not in v.get("package_type", "")
        ]
        if not matching_variants:
            raise HTTPException(status_code=400, detail="No pricing available for supported package types")

        # ---------- helpers ----------
        def sorted_tiers(v):
            pd = v.get("pricing_details") or {}
            tiers = list(pd.get("pricing") or [])
            return sorted(tiers, key=lambda x: x["BreakQuantity"])

        def unit_price_for_qty(tiers, qty: int) -> float:
            """Pick highest BreakQuantity <= qty; else first tier."""
            up = None
            for t in tiers:
                if qty >= t["BreakQuantity"]:
                    up = float(t["UnitPrice"])
                else:
                    break
            if up is None and tiers:
                up = float(tiers[0]["UnitPrice"])
            return float(up or 0.0)

        def infer_pack_size(v, tiers) -> int:
            """
            Infer pack size for bulk-ish packages.
            Priority: minimum_order_quantity (>1), else smallest tier >1,
            else 1 (means no fixed pack; e.g., Bulk).
            """
            pd = v.get("pricing_details") or {}
            moq = int(pd.get("minimum_order_quantity") or 0)
            if moq and moq > 1:
                return moq
            if "Tape & Reel" in v.get("package_type", ""):
                # TR usually has a fixed standard pack; pick the smallest tier > 1
                for t in tiers:
                    if t["BreakQuantity"] > 1:
                        return int(t["BreakQuantity"])
            # For Tray/Tube/Bulk/etc: choose smallest tier > 1; else 1
            for t in tiers:
                if t["BreakQuantity"] > 1:
                    return int(t["BreakQuantity"])
            return 1

        # ---------- build old functionality: full pricing tables ----------
        # ---------- choose best split (bulk + CT remainder) ----------
        cut_tape_variant = next((v for v in matching_variants if "Cut Tape" in v["package_type"]), None)
        bulk_variants = [v for v in matching_variants if "Cut Tape" not in v["package_type"]]

        best_split = None
        best_total = float("inf")

        # Try each bulk variant as the main pack
        for bulk in bulk_variants or [None]:
            breakdown = []
            total_price = 0.0

            if bulk is not None:
                bulk_tiers = sorted_tiers(bulk)
                if not bulk_tiers:
                    continue
                pack_size = max(1, infer_pack_size(bulk, bulk_tiers))

                # how many full packs?
                bulk_qty = (quantity // pack_size) * pack_size
                remainder = quantity - bulk_qty

                # price the bulk part using tiered pricing for the actual bulk_qty
                if bulk_qty > 0:
                    up_bulk = unit_price_for_qty(bulk_tiers, bulk_qty)
                    ext_bulk = round(bulk_qty * up_bulk, 4)
                    total_price += ext_bulk
                    breakdown.append({
                        "package_type": bulk["package_type"],
                        "quantity": bulk_qty,
                        "unit_price": up_bulk,
                        "extended_price": ext_bulk,
                    })
            else:
                # No bulk candidate; try CT only below
                bulk_qty = 0
                remainder = quantity

            # price the remainder using CT (if any remainder)
            if remainder > 0:
                if cut_tape_variant:
                    ct_tiers = sorted_tiers(cut_tape_variant)
                    if not ct_tiers:
                        # can't fulfill remainder with CT
                        breakdown = None
                    else:
                        up_ct = unit_price_for_qty(ct_tiers, remainder)
                        ext_ct = round(remainder * up_ct, 4)
                        total_price += ext_ct
                        if breakdown is not None:
                            breakdown.append({
                                "package_type": cut_tape_variant["package_type"],
                                "quantity": remainder,
                                "unit_price": up_ct,
                                "extended_price": ext_ct,
                            })
                else:
                    breakdown = None  # no CT to cover remainder

            if breakdown:
                if total_price < best_total:
                    best_total = total_price
                    best_split = breakdown

        # Final fallback: if no split found but there is some bulk variant that can take everything
        if not best_split:
            for bulk in bulk_variants:
                bulk_tiers = sorted_tiers(bulk)
                if not bulk_tiers:
                    continue
                up_bulk = unit_price_for_qty(bulk_tiers, quantity)
                ext_bulk = round(quantity * up_bulk, 4)
                if ext_bulk < best_total:
                    best_total = ext_bulk
                    best_split = [{
                        "package_type": bulk["package_type"],
                        "quantity": quantity,
                        "unit_price": up_bulk,
                        "extended_price": ext_bulk,
                    }]

        # If still nothing and CT exists, use CT for all
        if not best_split and cut_tape_variant:
            ct_tiers = sorted_tiers(cut_tape_variant)
            if ct_tiers:
                up_ct = unit_price_for_qty(ct_tiers, quantity)
                ext_ct = round(quantity * up_ct, 4)
                best_total = ext_ct
                best_split = [{
                    "package_type": cut_tape_variant["package_type"],
                    "quantity": quantity,
                    "unit_price": up_ct,
                    "extended_price": ext_ct,
                }]

        if not best_split:
            raise HTTPException(status_code=400, detail="Unable to calculate split packaging pricing")

        # --- Success ---
        return {
            "status": "success",
            "message": "Product available",
            "data": {
                "product": {
                    "id": str(product.id),
                    "name": product.name,
                    "semicon_part_number": product.semicon_part_number,
                    "manufacturer_part_number": product.manufacturerPartNumber,
                    "manufacturer_name": product.manufacturer_name,
                    "quantity_available": product.quantity_available,
                    "currency": product.currency or "USD",
                    "description": product.description,
                    "image_url": product.image_url,
                    "datasheet_url": product.datasheet_url,
                    "vendor_details": product.vendor_details,
                    "status": product.status,
                },
                "requested_quantity": quantity,
                "packaging_breakdown": best_split,     # ← chosen split (DigiKey-style)
                "total_price": round(best_total, 4),
                #"pricing_tables": pricing_tables,      # ← old functionality (full tiers per variant)
                "availability_status": "available",
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking availability: {str(e)}")
