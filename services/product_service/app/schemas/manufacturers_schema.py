from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SemiconManufacturerCreateSchema(BaseModel):
    digikey_manufacturer_id: int
    digikey_name: str


class SemiconManufacturerUpdateSchema(BaseModel):
    semicon_manufacturer_id: str
    digikey_name: Optional[str] = None
    modified_by: Optional[str] = "admin"


class SemiconManufacturerStatusToggleSchema(BaseModel):
    semicon_manufacturer_id: str
    status: bool
    modified_by: str


class SemiconManufacturerResponseSchema(BaseModel):
    semicon_manufacturer_id: str
    digikey_manufacturer_id: int
    digikey_name: str
    created_by: str
    modified_by: str
    created_date: datetime
    modified_date: datetime
    status: bool
