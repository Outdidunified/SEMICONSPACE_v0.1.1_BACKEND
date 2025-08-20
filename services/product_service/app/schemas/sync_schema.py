from pydantic import BaseModel, Field

class DigikeySyncRequest(BaseModel):
    query: str = Field(min_length=1)
    max_items: int = Field(default=10, ge=1, le=100)