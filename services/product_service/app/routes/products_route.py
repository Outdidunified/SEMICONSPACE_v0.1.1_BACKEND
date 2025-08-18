from fastapi import APIRouter, HTTPException, Query, Request, Path
from typing import Optional, List
import httpx
import re
import uuid
from urllib.parse import quote
from odmantic import query
from app.services.sync_semicon_products import fetch_and_sync_semicon_product
from app.database import engine
from app.models.semicon_products import SemiconProduct
from app.models.semicon_products_details import SemiconProduct as SemiconProductDetails
from app.models.categories_models import SemiconCategory, SemiconChildCategory
from odmantic.query import QueryExpression
from uuid import UUID
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from bson import ObjectId
from app.kafka.kafka_producer import send_event
from app.models.categories_models import SemiconCategory, SemiconChildCategory
import asyncio
from datetime import datetime
router = APIRouter(prefix="/product")

DIGIKEY_BASE_URL = "http://172.232.110.10:8000/api/digikey"  # change to your DigiKey proxy URL

# ======= EXISTING ENDPOINTS =======@router.post("/sync/digikey")
@router.post("/sync/digikey")
async def sync_digikey_product(payload: dict):
    query = payload.get("query")
    if not query:
        raise HTTPException(status_code=400, detail={"status": "failure", "message": "Query is required"})

    async with httpx.AsyncClient(timeout=300) as client:
        search_url = f"{DIGIKEY_BASE_URL}/search/keyword"
        search_resp = await client.post(search_url, json={"query": query})
        if search_resp.status_code != 200:
            raise HTTPException(status_code=500, detail={"status": "failure", "message": "Search API failed"})

        search_data = search_resp.json()
        if not search_data.get("success") or not search_data.get("products"):
            raise HTTPException(status_code=404, detail={"status": "failure", "message": "No products found in search"})

        synced = 0
        skipped = 0
        result_main = []

        for product_basic in search_data["products"]:
            digi_part_number = product_basic["digiKeyPartNumber"]
            manufacturer_part_number = product_basic.get("manufacturerPartNumber", "")
            semicon_part_number = f"SPNID-{manufacturer_part_number}"

            # Check if product already exists
            existing = await engine.find_one(SemiconProduct, SemiconProduct.semicon_part_number == semicon_part_number)
            if existing:
                skipped += 1
                continue

            # Fetch product details
            details_url = f"{DIGIKEY_BASE_URL}/products/{digi_part_number}/productdetails"
            details_resp = await client.get(details_url)
            if details_resp.status_code != 200:
                # Could log this or raise; here we just skip
                skipped += 1
                continue

            details_data = details_resp.json()
            if not details_data.get("success"):
                skipped += 1
                continue

            merged_data = {**product_basic, **details_data["product"]}
            print(f"Synced product: {merged_data}")
            result= await fetch_and_sync_semicon_product(merged_data)
            synced += 1
            result_main.append(result)
           
    return {
        "status": "success",
        "message": f"Sync completed: {synced} products synced, {skipped} products skipped (already exists or failed).",
        "returned_data": result_main
    }



@router.get("/fetchall")
async def get_all_products(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records to return"),
    search: Optional[str] = Query(None, description="Search term for product name or part number"),
    manufacturer: Optional[str] = Query(None, description="Filter by manufacturer name"),
    category: Optional[str] = Query(None, description="Filter by category name")
):
    try:
        # Log the query parameters
        print(f"Fetching products with skip={skip}, limit={limit}, search={search}, manufacturer={manufacturer}, category={category}")

        # Build query
        query = QueryExpression()
        if search:
            query &= (
                SemiconProduct.name.contains(search, case_sensitive=False) |
                SemiconProduct.semicon_part_number.contains(search, case_sensitive=False) |
                SemiconProduct.manufacturer_part_number.contains(search, case_sensitive=False)
            )
        if manufacturer:
            query &= SemiconProduct.vendor_details.contains(manufacturer)
        if category:
            query &= SemiconProduct.semicon_category_id == category

        # Try fetching with odmantic
        products = await engine.find(SemiconProduct, query, skip=skip, limit=limit)
        print(f"Found {len(products)} products using odmantic query")

        # If no products found, try raw collection to diagnose
        if not products:
            collection = engine.get_collection(SemiconProduct)
            raw_query = {}
            if search:
                raw_query["$or"] = [
                    {"name": {"$regex": search, "$options": "i"}},
                    {"semicon_part_number": {"$regex": search, "$options": "i"}},
                    {"manufacturer_part_number": {"$regex": search, "$options": "i"}}
                ]
            if manufacturer:
                raw_query["vendor_details"] = {"$regex": manufacturer, "$options": "i"}
            if category:
                raw_query["semicon_category_id"] = category

            raw_products = await collection.find(raw_query).skip(skip).limit(limit).to_list(None)
            print(f"Found {len(raw_products)} products using raw collection query")
            if raw_products:
                print("Products found in raw query but not in odmantic query, possible validation issue")
                # Transform raw documents to match SemiconProduct structure
                transformed_products = [{
                    "id": str(doc["_id"]),
                    "name": doc.get("name"),
                    "description": doc.get("description"),
                    "image_url": doc.get("image_url"),
                    "datasheet_url": doc.get("datasheet_url"),
                    "quantity_available": doc.get("quantity_available"),
                    "unit_price": doc.get("UnitPrice"),
                    "currency": doc.get("currency"),
                    "manufacturerPartNumber": doc.get("manufacturerPartNumber"),
                    "vendor_details": doc.get("vendor_details", []),
                    "manufacturer_name": doc.get("manufacturer_name"),
                    "semicon_part_number": doc.get("semicon_part_number"),
                    "semicon_category_id": doc.get("semicon_category_id"),
                    "semicon_child_category_id": doc.get("semicon_child_category_id"),
                    "created_by": doc.get("created_by"),
                    "created_date": doc.get("created_date"),
                    "modified_by": doc.get("modified_by"),
                    "modified_date": doc.get("modified_date"),
                    "status": doc.get("status")
                } for doc in raw_products]
                return transformed_products

        return {
            "error": False,
            "message": f"products fetched successfully",
            "data": products,
        }

    except Exception as e:
        print(f"Error fetching products: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching products: {str(e)}")

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
                "error": False,
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
            "error": False,
            "message": "Total products count retrieved successfully",
            "total_products": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error counting products: {str(e)}")
# Fetch details for one product with URL-encoding
async def fetch_details(part_number: str, client: httpx.AsyncClient):
    #encoded_part_number = quote(part_number)
    collection2 = engine.get_collection(SemiconProduct)
    print(f"Fetching details for part number: {part_number}")
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
            search_query = {
                "$or": [
                    {"name": {"$regex": query, "$options": "i"}},
                    {"Manufacturer.Name": {"$regex": query, "$options": "i"}},
                    {"Category.ChildCategories.Name": {"$regex": query, "$options": "i"}},
                    {"Category.Name": {"$regex": query, "$options": "i"}},
                    {"manufacturerPartNumber": {"$regex": query, "$options": "i"}},
                    {"semicon_part_number": {"$regex": query, "$options": "i"}}
                ]
            }

            collection = engine.get_collection(SemiconProductDetails)
            collection2 = engine.get_collection(SemiconProduct)
            mongo_matches = await collection.find(search_query).to_list(length=None)
            if not mongo_matches:
                mongo_matches = await collection2.find(search_query).to_list(length=None)
                print(2)


            mongo_part_numbers = {
                doc.get("semicon_part_number")
                for doc in mongo_matches if doc.get("semicon_part_number")
            }

            # 2. Get details for Mongo matches
            mongo_details = await asyncio.gather(
                *(safe_fetch_details(pn, client) for pn in mongo_part_numbers),
                return_exceptions=False
            )
            if mongo_details and len(mongo_details) > 0:
                return {
                    "message": "Products retrieved successfully from local database",
                    "count": len(mongo_details),
                    "data": mongo_details
                }

            # 3. DigiKey sync
            digi_url = "http://172.232.110.10:8003/product/sync/digikey"
            digi_products = []

            digi_resp = await client.post(digi_url, json={"query": query})

            if digi_resp.status_code == 404:
                print(f"[INFO] DigiKey: No products found for query '{query}'")
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

                products = digi_data.get("products", [])
                if isinstance(products, list):
                    digi_products = products
                else:
                    print("[WARN] DigiKey returned invalid product list")

            digi_part_numbers = {
                p.get("semicon_part_number")
                for p in digi_products if p.get("semicon_part_number")
            }

            # 4. Only fetch DigiKey products that aren't in Mongo
            new_part_numbers = digi_part_numbers - mongo_part_numbers

            # 5. Get details for DigiKey products
            digi_details = await asyncio.gather(
                *(safe_fetch_details(pn, client) for pn in new_part_numbers),
                return_exceptions=False
            )

            # 6. Merge results
            all_results = mongo_details + digi_details
            all_results = [r for r in all_results if r]  # remove None
            if not all_results:
                fallback_query = {
                    "$or": [
                         {"name": {"$regex": query, "$options": "i"}},
                         {"Manufacturer.Name": {"$regex": query, "$options": "i"}},
                         {"Category.ChildCategories.Name": {"$regex": query, "$options": "i"}},
                         {"Category.Name": {"$regex": query, "$options": "i"}},
                         {"manufacturerPartNumber": {"$regex": query, "$options": "i"}},
                         {"semicon_part_number": {"$regex": query, "$options": "i"}}
                    ]
                }
                    
                mongo_matches = await collection.find(fallback_query).to_list(length=None)
                mongo_part_numbers = {
                    doc.get("semicon_part_number")
                    for doc in mongo_matches if doc.get("semicon_part_number")
                 }
                mongo_details = await asyncio.gather(
                    *(safe_fetch_details(pn, client) for pn in mongo_part_numbers),
                    return_exceptions=False
                )
            all_results = mongo_details+ digi_details
            all_results = [r for r in all_results if r]
            if not all_results:
                raise HTTPException(status_code=404, detail="No products found")

            return {
                "message": "Products retrieved successfully",
                "count": len(all_results),
                "data": all_results
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
        
    return {
        total_parent_categories,
        total_child_categories
    }
    

@router.get("/analytics/count/all")
async def get_all_counts():
    collection = engine.get_collection(SemiconManufacturer)
        
        # Fetch all manufacturers
    manufacturers = await collection.find({"status": True}).to_list(None)
        
    total_active_manufacturers = len(manufacturers)
    total_active_category,total_active_child_category = await get_category_counts()
    total_product_count = await engine.count(SemiconProduct)

    return {

        "total_active_manufacturers": total_active_manufacturers,
        "total_active_categories": total_active_category,
        "total_active_child_categories": total_active_child_category,
        "total_products": total_product_count
     }

@router.get("/quantity-price/check/{semicon_part_number:path}/{quantity}")
async def check_product_availability(semicon_part_number: str, quantity: int = Path(..., ge=1, description="Quantity to check availability for")):
    """
    Check if a product exists, has sufficient quantity available, and calculate the total price using semicon_part_number (excluding Digi-Reel®).
    Validates the requested quantity against the minimum_order_quantity for the selected package type.
    
    Args:
        semicon_part_number: The semicon part number of the product
        quantity: The requested quantity to check availability for
        
    Returns:
        Product details with pricing if available, or error message if not found/insufficient quantity/minimum order not met
    """
    try:
        # Validate quantity
        if quantity <= 0:
            raise HTTPException(
                status_code=400, 
                detail={"error": True, "message": "Quantity must be greater than 0"}
            )
        
        # Find product by semicon_part_number
        product = await engine.find_one(SemiconProduct, SemiconProduct.semicon_part_number == semicon_part_number)
        
        # Check if product exists
        if not product:
            raise HTTPException(
                status_code=404, 
                detail={
                    "error": True, 
                    "message": "Product not found",
                    "semicon_part_number": semicon_part_number
                }
            )
        
        # Check if product has quantity information
        if product.quantity_available is None:
            raise HTTPException(
                status_code=400, 
                detail={
                    "error": True, 
                    "message": "Product quantity information not available",
                    "semicon_part_number": semicon_part_number
                }
            )
        
        # Check if sufficient quantity is available
        if product.quantity_available < quantity:
            raise HTTPException(
                status_code=400, 
                detail={
                    "error": True, 
                    "message": f"Insufficient quantity available. Requested: {quantity}, Available: {product.quantity_available}",
                    "semicon_part_number": semicon_part_number,
                    "requested_quantity": quantity,
                    "available_quantity": product.quantity_available
                }
            )
        
        # Fetch product details to get variants and pricing
        product_details = await get_product_by_id(semicon_part_number)
        variants = product_details["data"]["detailed_info"]["ProductVariants"]
        
        # Filter allowed package types (Cut Tape and Tape & Reel)
        allowed_package_types = ["Cut Tape (CT)", "Tape & Reel (TR)","Tray","Bulk", "Tube", "Reel", "Box"]
        matching_variants = [v for v in variants if v["package_type"] in allowed_package_types]
        
        if not matching_variants:
            raise HTTPException(
                status_code=400, 
                detail={
                    "error": True, 
                    "message": "No pricing available for Cut Tape or Tape & Reel",
                    "semicon_part_number": semicon_part_number
                }
            )
        
        # Find a variant that satisfies the minimum order quantity
        selected_variant = None
        for variant in matching_variants:
            pricing_details = variant.get("pricing_details", {})
            if not pricing_details or not pricing_details.get("pricing"):
                continue
            minimum_order_quantity = pricing_details.get("minimum_order_quantity", 1)
            if quantity >= minimum_order_quantity:
                selected_variant = variant
                break
        
        if not selected_variant:
            # Collect minimum order quantities for error message
            min_quantities = {
                v["package_type"]: v.get("pricing_details", {}).get("minimum_order_quantity", 1)
                for v in matching_variants
            }
            raise HTTPException(
                status_code=400,
                detail={
                    "error": True,
                    "message": f"Requested quantity ({quantity}) is less than the minimum order quantity for available package types: {min_quantities}",
                    "semicon_part_number": semicon_part_number,
                    "requested_quantity": quantity,
                    "minimum_order_quantities": min_quantities
                }
            )
        
        # Extract pricing details
        pricing_details = selected_variant.get("pricing_details", {})
        minimum_order_quantity = pricing_details.get("minimum_order_quantity", 1)
        
        # Find the appropriate pricing tier
        pricing_tiers = sorted(pricing_details["pricing"], key=lambda x: x["BreakQuantity"])
        unit_price = None
        for tier in pricing_tiers:
            if quantity >= tier["BreakQuantity"]:
                unit_price = tier["UnitPrice"]
            else:
                break
        if not unit_price:
            unit_price = pricing_tiers[0]["UnitPrice"]  # Default to the lowest tier if quantity is less than minimum
        
        # Calculate total price
        total_price = unit_price * quantity
        
        # Return product details with pricing
        return {
            "error": False,
            "message": "Product available",
            "data": {
                "product": {
                    "id": str(product.id),
                    "name": product.name,
                    "semicon_part_number": product.semicon_part_number,
                    "manufacturer_part_number": product.manufacturerPartNumber,
                    "manufacturer_name": product.manufacturer_name,
                    "quantity_available": product.quantity_available,
                    "unit_price": unit_price,
                    "currency": product.currency or "INR",  # Fallback to INR if currency is not set
                    "description": product.description,
                    "image_url": product.image_url,
                    "datasheet_url": product.datasheet_url,
                    "vendor_details": product.vendor_details,
                    "status": product.status
                },
                "requested_quantity": quantity,
                "package_type": selected_variant["package_type"],
                "minimum_order_quantity": minimum_order_quantity,
                "total_price": total_price,
                "availability_status": "available"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={
                "error": True, 
                "message": f"Error checking product availability: {str(e)}",
                "semicon_part_number": semicon_part_number
            }
        )

@router.get("/fetch/all-products")
async def get_semicon_products(
    category_id: Optional[str] = Query(None),
    child_category_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),      # page number (default 1)
    limit: int = Query(20, ge=1, le=100)  # items per page (default 20, max 100)
):
    # Build query expression conditionally
    expr = None
    if category_id and child_category_id:
        expr = (SemiconProduct.semicon_category_id == category_id) & (SemiconProduct.semicon_child_category_id == child_category_id)
    elif category_id:
        expr = (SemiconProduct.semicon_category_id == category_id)
    elif child_category_id:
        expr = (SemiconProduct.semicon_child_category_id == child_category_id)

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
            sort=SemiconProduct.created_date.desc(),
            skip=skip,
            limit=limit
        )
    else:
        products = await engine.find(
            SemiconProduct,
            sort=SemiconProduct.created_date.desc(),
            skip=skip,
            limit=limit
        )

    if not products:
        return {
            "status": "success",
            "page": page,
            "limit": limit,
            "total_products": total_count,
            "total_pages": (total_count + limit - 1) // limit,
            "data": []
        }

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
        "status": "success",
        "page": page,
        "limit": limit,
        "Total_product_count": total_count,
        "total_pages": (total_count + limit - 1) // limit,
        "data": result
    }

    
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
        return {"status": "success", "data": []}

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

    return {"status": "success", "data": result}

@router.get("/quantity-price2/check/{semicon_part_number:path}/{quantity}")
async def check_product_availability(semicon_part_number: str, quantity: int = Path(..., ge=1, description="Quantity to check availability for")):
    """
    Check if a product exists, has sufficient quantity available, and calculate the total price for all allowed package types using semicon_part_number (excluding Digi-Reel®).
    Validates the requested quantity against the minimum_order_quantity for each package type.
    
    Args:
        semicon_part_number: The semicon part number of the product
        quantity: The requested quantity to check availability for
        
    Returns:
        Product details with pricing for all valid package types if available, or error message if not found/insufficient quantity/minimum order not met
    """
    try:
        # Validate quantity
        if quantity <= 0:
            raise HTTPException(
                status_code=400, 
                detail={"error": True, "message": "Quantity must be greater than 0"}
            )
        
        # Find product by semicon_part_number
        product = await engine.find_one(SemiconProduct, SemiconProduct.semicon_part_number == semicon_part_number)
        
        # Check if product exists
        if not product:
            raise HTTPException(
                status_code=404, 
                detail={
                    "error": True, 
                    "message": "Product not found",
                    "semicon_part_number": semicon_part_number
                }
            )
        
        # Check if product has quantity information
        if product.quantity_available is None:
            raise HTTPException(
                status_code=400, 
                detail={
                    "error": True, 
                    "message": "Product quantity information not available",
                    "semicon_part_number": semicon_part_number
                }
            )
        
        # Check if sufficient quantity is available
        if product.quantity_available < quantity:
            raise HTTPException(
                status_code=400, 
                detail={
                    "error": True, 
                    "message": f"Insufficient quantity available. Requested: {quantity}, Available: {product.quantity_available}",
                    "semicon_part_number": semicon_part_number,
                    "requested_quantity": quantity,
                    "available_quantity": product.quantity_available
                }
            )
        
        # Fetch product details to get variants and pricing
        product_details = await get_product_by_id(semicon_part_number)
        variants = product_details["data"]["detailed_info"]["ProductVariants"]
        
        # Filter allowed package types (all except DigiReel)
        allowed_package_types = ["Cut Tape (CT)", "Tape & Reel (TR)", "Tray", "Bulk", "Tube", "Reel", "Box"]
        matching_variants = [v for v in variants if v["package_type"] in allowed_package_types and "DigiReel" not in v["package_type"]]
        
        if not matching_variants:
            raise HTTPException(
                status_code=400, 
                detail={
                    "error": True, 
                    "message": "No pricing available for supported package types",
                    "semicon_part_number": semicon_part_number
                }
            )
        
        # Collect all variants that satisfy the minimum order quantity
        valid_variants = []
        for variant in matching_variants:
            pricing_details = variant.get("pricing_details", {})
            if not pricing_details or not pricing_details.get("pricing"):
                continue
            minimum_order_quantity = pricing_details.get("minimum_order_quantity", 1)
            if quantity >= minimum_order_quantity:
                # Find the appropriate pricing tier
                pricing_tiers = sorted(pricing_details["pricing"], key=lambda x: x["BreakQuantity"])
                unit_price = None
                for tier in pricing_tiers:
                    if quantity >= tier["BreakQuantity"]:
                        unit_price = tier["UnitPrice"]
                    else:
                        break
                if not unit_price:
                    unit_price = pricing_tiers[0]["UnitPrice"]  # Default to the lowest tier if quantity is less than minimum
                
                # Calculate total price
                total_price = unit_price * quantity
                
                valid_variants.append({
                    "package_type": variant["package_type"],
                    "minimum_order_quantity": minimum_order_quantity,
                    "unit_price": unit_price,
                    "total_price": total_price
                })
        
        if not valid_variants:
            # Collect minimum order quantities for error message
            min_quantities = {
                v["package_type"]: v.get("pricing_details", {}).get("minimum_order_quantity", 1)
                for v in matching_variants
            }
            raise HTTPException(
                status_code=400,
                detail={
                    "error": True,
                    "message": f"Requested quantity ({quantity}) is less than the minimum order quantity for available package types: {min_quantities}",
                    "semicon_part_number": semicon_part_number,
                    "requested_quantity": quantity,
                    "minimum_order_quantities": min_quantities
                }
            )
        
        # Return product details with pricing for all valid variants
        return {
            "error": False,
            "message": "Product available",
            "data": {
                "product": {
                    "id": str(product.id),
                    "name": product.name,
                    "semicon_part_number": product.semicon_part_number,
                    "manufacturer_part_number": product.manufacturerPartNumber,
                    "manufacturer_name": product.manufacturer_name,
                    "quantity_available": product.quantity_available,
                    "currency": product.currency or "INR",  # Fallback to INR if currency is not set
                    "description": product.description,
                    "image_url": product.image_url,
                    "datasheet_url": product.datasheet_url,
                    "vendor_details": product.vendor_details,
                    "status": product.status
                },
                "requested_quantity": quantity,
                "variants": valid_variants,
                "availability_status": "available"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={
                "error": True, 
                "message": f"Error checking product availability: {str(e)}",
                "semicon_part_number": semicon_part_number
            }
        )


@router.get("/fetch/top-products")
async def get_top_products():
    try:
        ANALYTICS_API = "http://172.232.102.237:8006/order/admin/analytics"
        # 1. Call Analytics API
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(ANALYTICS_API)
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch analytics data")
            analytics_data = response.json()

        top_products = analytics_data.get("data", {}).get("topProducts", [])[:6]
        if not top_products:
            return {"error": "true", "message": "No top products found", "status": "success", "data": []}

        # 2. Extract product_ids
        product_ids = [p["product_id"] for p in top_products]

        # 3. Fetch products from DB by semicon_part_number
        products = await engine.find(
            SemiconProduct,
            SemiconProduct.semicon_part_number.in_(product_ids)
        )
        if not products:
            return {"error": "true", "message": "No products found", "status": "success", "data": []}

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

        return {"error": "false",
                "message": "Top products fetched successfully",
                "status": "success",
                "data": result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))