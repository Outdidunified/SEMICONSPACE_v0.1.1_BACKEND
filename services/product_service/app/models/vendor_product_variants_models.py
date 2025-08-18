import uuid
from typing import List,Optional
from odmantic import Model, Field
from datetime import datetime
from odmantic import EmbeddedModel


class Parameter(EmbeddedModel):
    parameter_id: str
    value_id: str
    value_text: str
class VendorProduct(Model):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_field=True)
    semicon_vendor_id: str
    vendor_name: str
    vendor_product_number: str
    created_by: str
    created_date: datetime = Field(default_factory=datetime.utcnow)
    modified_by: str
    modified_date: datetime = Field(default_factory=datetime.utcnow)
    status: Optional[bool] = None
    product_variants: List[str]  # list of SPVID-xxx
    semicon_part_number: str
    parameters: List[Parameter] = Field(default_factory=list)

    model_config = {
        "collection" :"vendor_products"
     }