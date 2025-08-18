import uuid
from odmantic import Model, EmbeddedModel, Field
from datetime import datetime
from typing import List
from typing import Optional

class Supplier(EmbeddedModel):
    id: int
    name: str
# class parameter(EmbeddedModel):
#     parameter_id: str
#     value_id: str
#     value_text: str

class VendorProduct(Model):
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_field=True)
    semicon_product_variant_id: str
    vendor_part_number: str
    digikey_product_number: str
    marketplace: bool
    tariff_active: bool
    supplier: Supplier
    quantity_available_for_package_type: int
    max_quantity_for_distribution: int
    standard_package: int
    digireel_fee: int
    created_by: str
    created_date: datetime = Field(default_factory=datetime.utcnow)
    modified_by: str
    modified_date: datetime = Field(default_factory=datetime.utcnow)
    status: Optional[bool] = None
    package_type: Optional[str] = None
    #parameters: List[parameter] 
    semicon_product_variant_pricing_id: List[str] = Field(default_factory=list)

    model_config = {
        "collection": "product_variants"
    }
