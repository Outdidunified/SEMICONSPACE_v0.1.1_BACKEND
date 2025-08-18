from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime
from typing import Optional

class RegisterRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    password: str
    role_id: int


class LoginRequest(BaseModel):
    identifier: str 
    password: str
    role_id: Optional[int]=2


class UserResponse(BaseModel):
    userId: UUID
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    role: str
    role_id: int
    created_at: datetime
    created_by: str
    modified_by: Optional[str]
    modified_at: Optional[datetime]

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    userId: UUID
    role: str
    role_id: int
    email: EmailStr
    phone: str
    first_name: str
    last_name: str

    class Config:
        from_attributes = True
