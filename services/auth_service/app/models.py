from sqlalchemy import Column, String, DateTime, Integer,Boolean
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.database import Base

class User(Base):
    __tablename__ = "users"

    userId = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    phone = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False)       
    role_id = Column(Integer, nullable=False)     
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, nullable=False)
    modified_by = Column(String, nullable=True)
    modified_at = Column(DateTime, nullable=True)
    status = Column(Boolean, default=True) 


class UserRole(Base):
    __tablename__ = "user_roles"

    role_id = Column(Integer, primary_key=True, nullable=False)
    role_name = Column(String, nullable=False)
    status = Column(Boolean, default=True)
