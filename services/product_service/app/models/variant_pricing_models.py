import uuid
from typing import List,Optional
from pydantic import BaseModel

from odmantic import Model, Field
from datetime import datetime

class PricingTier(BaseModel):
    BreakQuantity: int
    UnitPrice: float
    TotalPrice: float

class SemiconProductVariantPricing(Model):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_field=True)
    #package_type: Optional[str]
    minimum_order_quantity: int
    pricing: List[PricingTier] # assuming it's just an array of numbers, else use List[dict]
    created_by: str
    created_date: datetime = Field(default_factory=datetime.utcnow)
    modified_by: str
    modified_date: datetime = Field(default_factory=datetime.utcnow)
    status: Optional[bool] = None
    semicon_product_variant_pricing_id: str
    semicon_product_variant_id: str


    model_config = {
        "collection": "variant_pricing"
    }
