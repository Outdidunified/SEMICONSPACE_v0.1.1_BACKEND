import uuid
from odmantic import Model, Field
from datetime import datetime
from typing import Optional
class VendorProductVariantParameter(Model):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_field=True)
    semicon_parameter_id: str
    digikey_parameter_id: Optional[int] = None

    parameter_text: str
    parameter_type: str
    created_by: str
    created_date: datetime = Field(default_factory=datetime.utcnow)
    modified_by: str
    modified_date: datetime = Field(default_factory=datetime.utcnow)
    status: Optional[bool] = None  # e.g., "active"

    model_config = {
        "collection" :"vendors_product_variant_parameters"
     }