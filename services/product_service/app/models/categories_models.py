from odmantic import Model, Field, ObjectId
from typing import List, Optional, Union
from datetime import datetime
import uuid

class SemiconChildCategory(Model):
    id: Optional[uuid.UUID] = Field(default=None, primary_field=True)
    semicon_child_category_id: Optional[str] = None
    semicon_child_parent_id: Optional[str] = None
    digikey_child_category_id: Optional[Union[int, str]] = None
    digikey_child_name: Optional[str] = None
    digikey_parent_id: Optional[Union[int, str]] = None
    product_count: int = 0
    child_categories: List["SemiconChildCategory"] = Field(default_factory=list)
    created_by: Optional[str] = None
    modified_by: Optional[str] = None
    created_date: datetime
    modified_date: datetime
    status: bool = True

SemiconChildCategory.model_rebuild()

class SemiconCategory(Model):
    id: Optional[uuid.UUID] = Field(default=None, primary_field=True)
    semicon_category_id: Optional[str] = None
    semicon_parent_id: Optional[str] = None
    digikey_category_id: Optional[Union[int, str]] = None
    digikey_name: Optional[str] = None
    digikey_parent_id: Optional[Union[int, str]] = None
    product_count: int = 0
    child_categories: List[SemiconChildCategory] = Field(default_factory=list)
    created_by: Optional[str] = None
    modified_by: Optional[str] = None
    created_date: Optional[datetime] = None
    modified_date: Optional[datetime] = None
    status: bool = True
    image_url: Optional[str] = None

    model_config = {
        "collection": "categories"
    }

SemiconCategory.model_rebuild()