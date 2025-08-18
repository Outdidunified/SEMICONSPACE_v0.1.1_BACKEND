from pydantic import BaseModel, Field
from uuid import UUID
from typing import List, Optional
from datetime import datetime


class PricingTierSchema(BaseModel):
    quantity: int = Field(alias="break_quantity")
    price: float = Field(alias="unit_price")
    total_price: Optional[float] = None

    model_config = {
        "from_attributes": True,
        "populate_by_name": True
    }


class VendorBulkPricingCreate(BaseModel):
    vendor_product_id: str
    standard_pricing: List[PricingTierSchema]
    my_pricing: List[PricingTierSchema]
    status: Optional[bool] = True


class VendorBulkPricingUpdate(BaseModel):

    pricing_record_id: Optional[str] = None
    standard_pricing: Optional[List[PricingTierSchema]] = None
    my_pricing: Optional[List[PricingTierSchema]] = None
    status: Optional[bool] = None


class VendorBulkPricingResponse(BaseModel):
    id: UUID
    vendor_product_id: str
    pricing_record_id: Optional[str]
    standard_pricing: List[PricingTierSchema]
    my_pricing: List[PricingTierSchema]
    status: Optional[bool]
    created_by: Optional[str]
    created_date: Optional[datetime]
    modified_by: Optional[str]
    modified_date: Optional[datetime]

    model_config = {
        "from_attributes": True
    }
