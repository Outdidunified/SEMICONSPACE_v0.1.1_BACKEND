from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime

class ProductSpecificationCreate(BaseModel):
    #semicon_product_id: str
   # parameter_id: str
    parameter_text: Optional[str] = Field(alias="parameterText")
    parameter_type: Optional[str] = Field(alias="parameterType")
    created_by: Optional[str] = None
    status: Optional[bool] = True

class ProductSpecificationUpdate(BaseModel):
    parameter_id: Optional[str] = None
    parameter_text: Optional[str] = None
    parameter_type: Optional[str] = None
    modified_by: Optional[str] = None
    status: Optional[bool] = None


class ProductSpecificationResponse(BaseModel):
    #semicon_product_id: Optional[str] = None
    parameter_id: Optional[str] = None
    parameter_text: Optional[str]  # 🔁 Remove alias
    parameter_type: Optional[str]  # 🔁 Remove alias
    status: Optional[bool] = None
    created_by: Optional[str]
    created_date: datetime
    modified_by: Optional[str]
    modified_date: datetime

    class Config:
        orm_mode = True
