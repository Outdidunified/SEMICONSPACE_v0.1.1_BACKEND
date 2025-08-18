from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Union
from datetime import datetime

class SemiconChildCategorySchema(BaseModel):
    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        populate_by_name=True
    )
    
    id: Optional[str] = None
    semicon_child_category_id: Optional[str] = None
    semicon_child_parent_id: Optional[str] = None
    digikey_child_category_id: Optional[Union[int, str]] = None
    digikey_child_name: Optional[str] = None
    digikey_parent_id: Optional[Union[int, str]] = None
    product_count: int = 0
    child_categories: List['SemiconChildCategorySchema'] = []
    created_by: Optional[str] = None
    created_date: Optional[datetime] = None
    modified_by: Optional[str] = None
    modified_date: Optional[datetime] = None
    status: bool = True

class SemiconCategoryCreateSchema(BaseModel):
    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        populate_by_name=True
    )
    
    semicon_category_id: str
    semicon_parent_id: Optional[str] = None
    digikey_category_id: Optional[Union[int, str]] = None
    digikey_name: Optional[str] = None
    digikey_parent_id: Optional[Union[int, str]] = None
    product_count: int = 0
    created_by: Optional[str] = None
    status: str = "active"
    child_categories: List[SemiconChildCategorySchema] = []

class SemiconCategoryUpdateSchema(BaseModel):
    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        populate_by_name=True
    )
    
    semicon_parent_id: Optional[str] = None
    digikey_category_id: Optional[Union[int, str]] = None
    digikey_name: Optional[str] = None
    digikey_parent_id: Optional[Union[int, str]] = None
    product_count: Optional[int] = None
    modified_by: Optional[str] = None
    status: Optional[str] = None
    child_categories: Optional[List[SemiconChildCategorySchema]] = None

class SemiconCategoryResponseSchema(BaseModel):
    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        populate_by_name=True
    )
    
    id: str
    semicon_category_id: str
    semicon_parent_id: Optional[str]
    digikey_category_id: Optional[Union[int, str]]
    digikey_name: Optional[str]
    digikey_parent_id: Optional[Union[int, str]]
    product_count: int
    created_by: Optional[str]
    created_date: Optional[datetime]
    modified_by: Optional[str]
    modified_date: Optional[datetime]
    status: str
    child_categories: List[SemiconChildCategorySchema]

# Forward reference for recursive schema
SemiconChildCategorySchema.model_rebuild()
