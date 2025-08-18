from __future__ import annotations
from odmantic import Model, Field
from datetime import datetime
from bson import ObjectId
import uuid
from typing import Optional, Union

class SemiconManufacturer(Model):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_field=True)
    semicon_manufacturer_id: Optional[str] = Field(default=None)
    digikey_manufacturer_id: Optional[int] = Field(default=None)
    digikey_name: Optional[str] = Field(default=None)
    created_by: Optional[str] = Field(default="system")
    modified_by: Optional[str] = Field(default="system")
    created_date: datetime = Field(default_factory=datetime.utcnow)
    modified_date: datetime = Field(default_factory=datetime.utcnow)
    status: Union[bool, str] = Field(default=True)

    model_config = {
        "collection": "manufacturers"
    }

