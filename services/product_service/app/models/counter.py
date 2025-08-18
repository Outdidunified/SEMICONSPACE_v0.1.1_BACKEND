from odmantic import Model, Field

class Counter(Model):
    name: str  # e.g., "category", "manufacturer", "pricing"
    value: int = Field(default=0)  # last used counter
