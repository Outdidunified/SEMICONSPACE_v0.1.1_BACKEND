from odmantic import Model, Field
from uuid import UUID, uuid4
from typing import List, Optional
from datetime import datetime

class SemiconProduct(Model):
    id: UUID = Field(default_factory=uuid4, primary_field=True)
    name: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    datasheet_url: Optional[str] = None
    quantity_available: Optional[int] = None
    UnitPrice: Optional[float] = None
    currency: Optional[str] = "USD"
    manufacturerPartNumber: Optional[str] = None
    vendor_details: List[str] = Field(default_factory=list)
    manufacturer_name: Optional[str] = None
    semicon_manufacturer_id: Optional[str] = None
    semicon_part_number: Optional[str] = Field(default=None, unique=True)
    semicon_category_id: Optional[str] = None
    semicon_child_category_id: Optional[str] = None
    created_by: Optional[str] = None
    created_date: datetime = Field(default_factory=datetime.utcnow)
    modified_by: Optional[str] = None
    modified_date: datetime = Field(default_factory=datetime.utcnow)
    status: Optional[bool] = None

    model_config = {
        "collection": "semicon_products"
    }