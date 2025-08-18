from pydantic import BaseModel, Field, HttpUrl
from typing import Optional
from datetime import datetime


class VendorProductBase(BaseModel):
    product_id: str
    vendor_product_id: str

    manufacturer_part_number: Optional[str] = None
    unitprice: Optional[float] = None
    product_url: Optional[HttpUrl] = None

    vendor: Optional[str] = None
    pricing: Optional[str] = None

    status: Optional[bool] = True

class VendorProductUpdateRequest(BaseModel):
    vendor_product_id: str 
    manufacturer_part_number: Optional[str] = None
    unitprice: Optional[float] = None
    product_url: Optional[HttpUrl] = None
    vendor: Optional[str] = None
    pricing: Optional[str] = None
    status: Optional[bool] = None
    modified_by: Optional[str] = None


class VendorProductResponse(VendorProductBase):
    id: str = Field(..., alias="_id")
    created_by: Optional[str] = None
    created_date: Optional[datetime] = None
    modified_by: Optional[str] = None
    modified_date: Optional[datetime] = None

    class Config:
        from_attributes = True
        allow_population_by_field_name = True
