from datetime import datetime
from uuid import UUID
import uuid
import asyncio
from typing import List, Optional

from app.models.categories_models import SemiconCategory, SemiconChildCategory
from app.models.manufacturers_models import SemiconManufacturer
from app.models.semicon_products import SemiconProduct as SemiconProductListing
from app.models.semicon_products_details import (
    SemiconProduct as SemiconProductDetails,
    BaseProductNumber, Series, Classifications, Manufacturer, Category, ProductStatus
)
from app.models.variant_pricing_models import SemiconProductVariantPricing, PricingTier
from app.models.vendors_product_variant_parameters import VendorProductVariantParameter
from app.models.product_varianants import VendorProduct as VendorProductVariant, Supplier as VariantSupplier
from app.models.vendor_product_variants_models import VendorProduct, Parameter as VariantParameter
from app.utils.counter import (
    get_next_category_counter,
    get_next_manufacturer_counter,
    get_next_variant_counter,
    get_next_pricing_counter,
    get_next_parameter_counter,
    get_vendor_id
)
from app.middleware.database import engine
from app.jobs.kafka.kafka_producer import send_event

async def gather_full_product_data(db, listing_product, details, vendor_product):
    listing_dict = listing_product.dict()
    details_dict = details.dict()
    vendor_dict = vendor_product.dict()

    expanded_variants = []
    for variant_id in vendor_product.product_variants:
        variant = await db.find_one(VendorProductVariant, VendorProductVariant.semicon_product_variant_id == variant_id)
        if not variant:
            continue
        variant_dict = variant.dict()

        # Expand pricing for this variant
        pricing_expanded = []
        for pricing_id in variant.semicon_product_variant_pricing_id:
            pricing = await db.find_one(SemiconProductVariantPricing, SemiconProductVariantPricing.semicon_product_variant_pricing_id == pricing_id)
            if pricing:
                pricing_dict = pricing.dict()
                pricing_dict['pricing'] = [p.dict() if hasattr(p, 'dict') else p for p in pricing.pricing]
                pricing_expanded.append(pricing_dict)
        variant_dict['pricing_details'] = pricing_expanded

        # Expand parameters for this variant
        parameters_expanded = []
        for param in vendor_product.parameters:
            param_doc = await db.find_one(VendorProductVariantParameter, VendorProductVariantParameter.semicon_parameter_id == param.parameter_id)
            if param_doc:
                param_dict = param_doc.dict()
                param_dict.update({
                    'value_id': param.value_id,
                    'value_text': param.value_text
                })
                parameters_expanded.append(param_dict)
        variant_dict['parameters_expanded'] = parameters_expanded

        expanded_variants.append(variant_dict)

    vendor_dict['variants_expanded'] = expanded_variants

    return {
        'listing_product': listing_dict,
        'product_details': details_dict,
        'vendor_product': vendor_dict,
    }

def parse_manufacturer(manu_raw):
    """Parse manufacturer data into (id, name) safely."""
    if isinstance(manu_raw, dict):
        return (
            manu_raw.get("Id") or manu_raw.get("id"),
            manu_raw.get("Name") or manu_raw.get("name")
        )
    elif isinstance(manu_raw, str):
        return None, manu_raw
    return None, None

async def build_child_category_tree(db, parent_id):
    children = await db.find(
        SemiconChildCategory,
        SemiconChildCategory.digikey_parent_id == parent_id
    )
    child_list = []
    for child in children:
        child_list.append({
            "categoryId": child.digikey_child_category_id,
            "name": child.digikey_child_name,
            "parentId": child.digikey_parent_id,
            "productCount": getattr(child, "product_count", 0),
            "imageUrl": getattr(child, "image_url", ""),
            "seoDescription": getattr(child, "seo_description", ""),
            "childCategories": await build_child_category_tree(db, child.digikey_child_category_id)
        })
    return child_list

async def fetch_and_sync_semicon_product(digikey_data: dict):
    db = engine

    # -------- CATEGORY --------
    if "categoryDetails" in digikey_data:
        category_info = digikey_data["categoryDetails"]
    elif "Category" in digikey_data:
        category_info = {
            "categoryId": digikey_data["Category"].get("CategoryId"),
            "name": digikey_data["Category"].get("Name"),
            "parentId": digikey_data["Category"].get("ParentId"),
            "childCategories": digikey_data["Category"].get("ChildCategories", [])
        }
    else:
        category_info = None

    if not category_info:
        raise ValueError("No category details found in Digikey data")
    #print(f"Category Info: {category_info}")

    category = await db.find_one(
        SemiconCategory,
        SemiconCategory.digikey_category_id == category_info.get("categoryId")
    )
    if not category:
        semicon_category_id = f"SCID-{await get_next_category_counter()}"
        category = SemiconCategory(
            semicon_category_id=semicon_category_id,
            semicon_parent_id=None,
            digikey_category_id=category_info.get("categoryId") if category_info.get("categoryId") is not None else 0,
            digikey_name=category_info.get("name"), # type: ignore
            digikey_parent_id=str(category_info.get("parentId", "")),
            product_count=0,
            child_categories=[],
            created_by="admin",
            modified_by="admin",
            created_date=datetime.utcnow(),
            modified_date=datetime.utcnow(),
            status=True
        )
        await db.save(category)

    # -------- MANUFACTURER --------
    manu_id, manu_name = parse_manufacturer(digikey_data.get("Manufacturer") or digikey_data.get("manufacturer"))
    manufacturer = await db.find_one(
        SemiconManufacturer,
        SemiconManufacturer.digikey_manufacturer_id == manu_id
    )
    manu_s_id = manufacturer.semicon_manufacturer_id if manufacturer else None
    if not manufacturer:
        semicon_manufacturer_id = f"SMID-{await get_next_manufacturer_counter()}"
        manufacturer = SemiconManufacturer(
            semicon_manufacturer_id=semicon_manufacturer_id,
            digikey_manufacturer_id=manu_id or 0,
            digikey_name=manu_name or "",
            created_by="admin",
            modified_by="admin",
            created_date=datetime.utcnow(),
            modified_date=datetime.utcnow(),
            status=True
        )  # type: ignore
        await db.save(manufacturer)

    # --- CHILD CATEGORY --
     # --- CHILD CATEGORY ---
    child_cat = None
    semicon_child_category_id = None
    child_categories_data = []
    target_child_id = category_info.get("childCategories", [{}])[0].get("CategoryId")
    semicon_child_category_id = None
    for cat in category.child_categories:
        if cat.digikey_child_category_id == target_child_id:
            semicon_child_category_id = cat.semicon_child_category_id
            break
    print(f"Found child category ID: {semicon_child_category_id}")


    first_child = (category_info.get("childCategories") or [None])[0]
    if first_child:
        child_cat = await db.find_one(
            SemiconChildCategory,
            SemiconChildCategory.digikey_child_category_id == first_child.get("categoryId")
        )
        if child_cat:
            semicon_child_category_id = child_cat.semicon_child_category_id
            child_categories_data = await build_child_category_tree(
                db,
                category_info.get("categoryId")  # Start from main category
            )
        else:
            child_categories_data = category_info.get("childCategories", [])
    else:
        child_categories_data = category_info.get("childCategories", [])

    # -------- PRODUCT LISTING --------
    first_variation = digikey_data['productVariations'][0]
    first_price_tier = first_variation['StandardPricing'][0]
    first_unit_price = first_price_tier['UnitPrice']
    #pid = f"SPID-{await get_next_product_counter()}"
    semicon_part_number = f"SPNID-{digikey_data.get('manufacturerPartNumber', 'UNKNOWN')}"
    listing_product = SemiconProductListing(
        name=digikey_data.get("name", ""),
        description=digikey_data.get("description", ""),
        image_url=digikey_data.get("photoUrl"),
        datasheet_url=digikey_data.get("datasheetUrl"),
        quantity_available=digikey_data.get("quantityAvailable", 0),
        UnitPrice=first_unit_price or 0.0,
        manufacturerPartNumber=digikey_data.get("manufacturerPartNumber", ""),
        manufacturer_name=digikey_data.get("manufacturer", ""),
        semicon_manufacturer_id=manu_s_id,
        vendor_details=[],
        semicon_part_number=semicon_part_number,
        semicon_category_id=category.semicon_category_id,
        semicon_child_category_id=semicon_child_category_id,
        created_by="admin",
        modified_by="admin",
        status=True
    )

    # -------- PRODUCT DETAILS --------
    details = SemiconProductDetails(
        name=listing_product.name,
        semicon_part_number=listing_product.semicon_part_number or "",
        productId=UUID(digikey_data.get("productId")),
        UnitPrice=listing_product.UnitPrice or 0,
        ProductUrl=digikey_data.get("productUrl"),
        DatasheetUrl=digikey_data.get("datasheetUrl"),
        PhotoUrl=digikey_data.get("photoUrl"),
        BackOrderNotAllowed=str(digikey_data.get("backOrderNotAllowed", "")),
        NormallyStocking=str(digikey_data.get("normallyStocking", "")),
        Discontinued=str(digikey_data.get("discontinued", "")),
        EndOfLife=str(digikey_data.get("endOfLife", "")),
        Ncnr=str(digikey_data.get("ncnr", "")),
        PrimaryVideoUrl=digikey_data.get("primaryVideoUrl") or None,
        BaseProductNumber=BaseProductNumber(**digikey_data.get("baseProductNumber", {})),
        ManufacturerLeadWeeks=digikey_data.get("ManufacturerLeadWeeks"),
        ManufacturerPublicQuantity=int(digikey_data.get("quantityAvailable") or 0),
        Series=Series(**digikey_data["series"]) if digikey_data.get("series") else None,
        Classifications=Classifications(**{
            "ReachStatus": digikey_data.get("classifications", {}).get("ReachStatus") or digikey_data.get("classifications", {}).get("reachStatus"),
            "RohsStatus": digikey_data.get("classifications", {}).get("RohsStatus") or digikey_data.get("classifications", {}).get("rohsStatus"),
            "MoistureSensitivityLevel": digikey_data.get("classifications", {}).get("MoistureSensitivityLevel") or digikey_data.get("classifications", {}).get("moistureSensitivityLevel"),
            "ExportControlClassNumber": digikey_data.get("classifications", {}).get("ExportControlClassNumber") or digikey_data.get("classifications", {}).get("eccn"),
            "HtsusCode": digikey_data.get("classifications", {}).get("HtsusCode") or digikey_data.get("classifications", {}).get("htsusCode")
        }),
        categoryHierarchy=digikey_data.get("categoryHierarchy", []),
        Manufacturer=Manufacturer(Id=manu_id, Name=manu_name, semicon_manufacturer_id=manu_s_id),
        Category=Category(
            CategoryId=category_info.get("categoryId"),
            ParentId=category_info.get("parentId", 0),
            Name=category_info.get("name", ""),
            ProductCount=category_info.get("productCount", 0),
            NewProductCount=category_info.get("newProductCount", 0),
            ImageUrl=category_info.get("imageUrl", ""),
            SeoDescription=category_info.get("seoDescription", ""),
            ChildCategories=child_categories_data
        ),
        OtherNames=digikey_data.get("otherNames", []),
        ProductStatus=ProductStatus(**digikey_data.get("productStatus", {})),
        modified_by="admin",
        status=True
    )
    await db.save(details)

    # -------- VENDOR PRODUCT --------
    # Reuse existing vendor product if present to avoid duplicates
    existing_vendor_product = await db.find_one(
        VendorProduct,
        (VendorProduct.semicon_part_number == semicon_part_number)
        & (VendorProduct.vendor_name == "digikey")
        & (VendorProduct.vendor_product_number == (digikey_data.get("manufacturerPartNumber", "UNKNOWN")))
    )

    if existing_vendor_product:
        vendor_product = existing_vendor_product
        vpid = vendor_product.semicon_vendor_id
    else:
        vpid = f"SVPID-{await get_vendor_id()}"
        print(vpid)
        vendor_product = VendorProduct(
            id=uuid.uuid4(),
            semicon_vendor_id=vpid,
            vendor_name="digikey",
            vendor_product_number=digikey_data.get("manufacturerPartNumber", "UNKNOWN"),
            created_by="admin",
            modified_by="admin",
            status=True,
            product_variants=[],
            semicon_part_number=semicon_part_number,
            parameters=[]
        )

    all_parameters = list(vendor_product.parameters or [])
    variant_ids = list(vendor_product.product_variants or [])

    # Preload existing vendor_part_numbers from already stored variants for this vendor_product
    existing_vpns = set()
    for vid in variant_ids:
        vdoc = await db.find_one(VendorProductVariant, VendorProductVariant.semicon_product_variant_id == vid)
        if vdoc:
            existing_vpns.add(vdoc.vendor_part_number or "UNKNOWN")

    # Dedupe incoming variations by unique vendor part number to avoid duplicate variants
    raw_variations = digikey_data.get("productVariations", [])
    seen_vpns = set(existing_vpns)
    variations = []
    for v in raw_variations:
        vpn = v.get("digiKeyPartNumber") or v.get("DigiKeyProductNumber") or v.get("productNumber") or "UNKNOWN"
        if vpn in seen_vpns:
            continue
        seen_vpns.add(vpn)
        variations.append(v)

    # Deduplicate and upsert parameters once (shared across variants)
    seen_param_values = set()  # key: (parameter_text_lower, value_text_lower)
    for param in digikey_data.get("parameters", []):
        ptext_raw = (param.get("ParameterText") or "").strip()
        vtext_raw = str(param.get("ValueText") or "").strip()
        key = (ptext_raw.lower(), vtext_raw.lower())
        if key in seen_param_values:
            continue
        seen_param_values.add(key)

        # Try to reuse existing parameter meta by DigiKey ParameterId (preferred)
        param_doc = None
        if param.get("ParameterId") is not None:
            param_doc = await db.find_one(
                VendorProductVariantParameter,
                VendorProductVariantParameter.digikey_parameter_id == param.get("ParameterId")
            )
        # Fallback: match by parameter_text when ParameterId is missing
        if not param_doc and ptext_raw:
            param_doc = await db.find_one(
                VendorProductVariantParameter,
                VendorProductVariantParameter.parameter_text == ptext_raw
            )
        if not param_doc:
            spara_id = f"SPARAID-{await get_next_parameter_counter()}"
            param_doc = VendorProductVariantParameter(
                semicon_parameter_id=spara_id,
                digikey_parameter_id=param.get("ParameterId"),
                parameter_text=ptext_raw or "Unknown",
                parameter_type="ParameterType",
                created_by="admin",
                modified_by="admin",
                status=True
            )
            await db.save(param_doc)
        # Append parameter reference if not already present on the vendor_product
        vp_param_key = (param_doc.semicon_parameter_id, str(param.get("ValueId", "")), vtext_raw)
        if not any(
            (pp.parameter_id, pp.value_id, (pp.value_text or "")) == vp_param_key
            for pp in all_parameters
        ):
            all_parameters.append(VariantParameter(
                parameter_id=param_doc.semicon_parameter_id,
                value_id=str(param.get("ValueId", "")),
                value_text=vtext_raw or "Unknown"
            ))

    async def process_variation(variation: dict):
        variant_id = f"SPVID-{await get_next_variant_counter()}"
        vendor_part_number = variation.get("digiKeyPartNumber") or variation.get("DigiKeyProductNumber") or variation.get("productNumber") or "UNKNOWN"
        supplier_id, supplier_name = parse_manufacturer(variation.get("Supplier") or digikey_data.get("Manufacturer"))
        package_type = (variation.get("PackageType") or {}).get("Name") or "Unknown"
        variant_doc = VendorProductVariant(
            id=uuid.uuid4(),
            semicon_product_variant_id=variant_id,
            vendor_part_number=vendor_part_number,
            digikey_product_number=vendor_part_number,
            marketplace=variation.get("marketPlace", False),
            tariff_active=variation.get("tariffActive", False),
            supplier=VariantSupplier(id=supplier_id or 0, name=supplier_name or ""),
            quantity_available_for_package_type=variation.get("QuantityAvailableforPackageType", 0),
            max_quantity_for_distribution=variation.get("MaxQuantityForDistribution", 0),
            standard_package=variation.get("StandardPackage", 0),
            digireel_fee=variation.get("DigiReelFee", 0),
            created_by="admin",
            modified_by="admin",
            status=True,
            package_type=package_type,
            semicon_product_variant_pricing_id=[]
        )
        spvpid = f"SPVPID-{await get_next_pricing_counter()}"
        pricing_doc = SemiconProductVariantPricing(
            minimum_order_quantity=variation.get("MinimumOrderQuantity", 0),
            pricing=[PricingTier(**p) for p in variation.get("StandardPricing", [])],
            created_by="admin",
            modified_by="admin",
            status=True,
            semicon_product_variant_pricing_id=spvpid,
            semicon_product_variant_id=variant_id
        )
        await db.save(pricing_doc)
        variant_doc.semicon_product_variant_pricing_id.append(spvpid)
        await db.save(variant_doc)
        return variant_id

    # Process all variations concurrently
    variant_ids = await asyncio.gather(*(process_variation(v) for v in variations))

    # Assign collected parameters to vendor_product
    vendor_product.parameters = all_parameters
    vendor_product.product_variants = variant_ids
    await db.save(vendor_product)

    # Update listing product with vendor details
    listing_product.vendor_details.append(vpid)
    await db.save(listing_product)

    # Prepare Kafka event
    sb = None
    if details.Category.ChildCategories:
        sb = details.Category.ChildCategories[0].Name
    all_data_dict = {
        "productname": listing_product.name,
        "category": details.Category.Name,
        "manufacturer": manu_name,
        "subcategory": sb,
        "semicon_part_number": listing_product.semicon_part_number,
        "manufacturer_part_number": listing_product.manufacturerPartNumber
    }

    await send_event(topic="product.added", value=all_data_dict)
   
    return listing_product