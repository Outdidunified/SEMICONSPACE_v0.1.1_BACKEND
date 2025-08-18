# from __future__ import annotations
# from pydantic import BaseModel
# from typing import List, Optional, Union, Dict, Any
# from datetime import datetime
# from app.models.vendor_product_model import VendorProduct
# from app.models.pricing_models import VendorBulkPricing



# class Parameter(BaseModel):
#     parameter_id: Optional[str] = None
#     value_id: Optional[str] = None
#     value_text: Optional[str] = None
#     parameter_text: Optional[str] = None
#     parameter_type: Optional[str] = None


# class PricingTierSchema(BaseModel):
#     break_quantity: int = 1
#     unit_price: float = 0.0
#     total_price: float = 0.0


# class VendorSchema(BaseModel):
#     vendor: str
#     manufacturer_part_number: Optional[str] = None
#     unitprice: Optional[float] = None
#     product_url: Optional[str] = None
#     standard_pricing: List[PricingTierSchema] = []
#     my_pricing: List[PricingTierSchema] = []


# class SemiconProductCreateRequest(BaseModel):
#     semicon_product_id: str
#     manufacturer_id: Optional[str] = None
#     category_id: Optional[str] = None
#     sub_category_id: Optional[str] = None
#     series: Optional[str] = None
#     status: Optional[bool] = True
#     description_short: Optional[str] = None
#     description_detailed: Optional[str] = None
#     package_type: Optional[str] = None
#     datasheet_url: Optional[str] = None
#     image_url: Optional[str] = None
#     parameters: List[Parameter] = []
#     vendors: List[VendorSchema] = []
#     product_id: Optional[str] = None


# class SemiconProductAddRequest(BaseModel):
#     product_name: str
#     manufacturer_name: str
#     category_name: str
#     subcategory_name: str
#     series: Optional[str] = None
#     status: Optional[bool] = True
#     description_short: Optional[str] = None
#     description_detailed: Optional[str] = None
#     package_type: Optional[str] = None
#     datasheet_url: Optional[str] = None
#     image_url: Optional[str] = None
#     parameters: List[Parameter] = []
#     vendors: List[VendorSchema] = []
#     product_id: Optional[str] = None


# class SemiconProductResponse(BaseModel):
#     semicon_product_id: str
#     product_name: str
#     manufacturer_id: Optional[str] = None
#     category_id: Optional[str] = None
#     sub_category_id: Optional[str] = None
#     series: Optional[str] = None
#     status: Optional[bool] = None
#     description_short: Optional[str] = None
#     description_detailed: Optional[str] = None
#     package_type: Optional[str] = None
#     datasheet_url: Optional[str] = None
#     image_url: Optional[str] = None
#     parameters: List[Parameter] = []
#     vendors: List[VendorSchema] = []
#     product_id: Optional[str] = None
#     created_by: Optional[str] = None
#     created_date: datetime
#     modified_by: Optional[str] = None
#     modified_date: datetime


# class APIResponse(BaseModel):
#     status: str
#     data: Union[SemiconProductResponse, List[SemiconProductResponse], dict]


# class PriceTier(BaseModel):
#     BreakQuantity: int
#     UnitPrice: float
#     TotalPrice: float


# class ProductVariation(BaseModel):
#     Supplier: dict
#     PackageType: dict
#     StandardPricing: List[PriceTier]


# class SeriesSchema(BaseModel):
#     Name: str


# class CategorySchema(BaseModel):
#     CategoryId: str
#     Name: str
#     ChildCategories: Optional[List[dict]] = None


# class ManufacturerSchema(BaseModel):
#     Id: str
#     Name: str


# class ProductStatus(BaseModel):
#     Status: str


# class EnrichedProductResponseSchema(BaseModel):
#     ProductDescription: str
#     DetailedDescription: str
#     Manufacturer: ManufacturerSchema
#     ManufacturerProductNumber: str
#     DatasheetUrl: Optional[str] = None
#     PhotoUrl: Optional[str] = None
#     Series: SeriesSchema
#     Category: CategorySchema
#     ProductStatus: ProductStatus
#     Parameters: List[Parameter]  # this is mine
#     vendor_product: Optional[VendorProduct]
#     vendor_pricing: List[VendorBulkPricing] = []
