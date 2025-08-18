from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


class SubCategorySchema(BaseModel):
    sub_category_id: str                       # SSCID-58
    category_id: str                           # SCID-3
    name: str
    imageUrl: Optional[str] = None
    SeoDescription: Optional[str] = None
    status: Optional[bool] = True
    created_by: Optional[str] = None
    created_date: Optional[datetime] = None
    modified_by: Optional[str] = None
    modified_date: Optional[datetime] = None


class SubCategoryUpdateSchema(BaseModel):
    sub_category_id: str
    category_id: Optional[str] = None
    name: Optional[str] = None
    imageUrl: Optional[str] = None
    SeoDescription: Optional[str] = None
    status: Optional[bool] = True
    created_by: Optional[str] = None
    created_date: Optional[datetime] = None
    modified_by: Optional[str] = None
    modified_date: Optional[datetime] = None


class SubCategoryResponseSchema(SubCategorySchema):
    id: UUID

    class Config:
        from_attributes = True
        json_encoders = {
            UUID: lambda u: str(u)
        }
