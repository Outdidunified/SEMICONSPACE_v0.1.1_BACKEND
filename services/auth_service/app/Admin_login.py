import os
import re
import logging
from typing import Pattern
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta, timezone

from app.database import get_db
from app import models, schemas, kafka_producer
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.environ["JWT_SECRET"]
ALGORITHM = os.environ["JWT_ALGORITHM"]
#ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"])

EMAIL_REGEX: Pattern[str] = re.compile(r"^[^@]+@[^@]+\.[^@]+$")
MOBILE_REGEX: Pattern[str] = re.compile(r"^(?:\+91)?[6-9]\d{9}$")

def is_valid_email(identifier: str) -> bool:
    return bool(EMAIL_REGEX.match(identifier))

def is_valid_mobile(identifier: str) -> bool:
    return bool(MOBILE_REGEX.match(identifier))

def normalize_mobile(identifier: str) -> str:
    """Normalize mobile number to 10-digit format (strip +91 if present)"""
    if identifier.startswith("+91"):
        return identifier[3:]
    return identifier

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_token(data: dict) -> str:
    to_encode = data.copy()
    #expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    #to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
@router.post("/auth/Admin_login", response_model=schemas.TokenResponse)
async def admin_login(request: schemas.LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Admin login endpoint that checks credentials against the user table
    Specifically for admin users (role_id = 1)
    """
    logger = logging.getLogger(__name__)
    
    identifier = request.identifier.strip()
    is_email = is_valid_email(identifier)
    is_mobile = is_valid_mobile(identifier)

    if not (is_email or is_mobile):
        logger.warning("❌ Invalid login identifier format")
        raise HTTPException(status_code=400, detail="Invalid email or mobile number format")

    if is_mobile:
        identifier = normalize_mobile(identifier)

    # Query admin user with allowed role_ids (1, 3, 4, 5)
    result = await db.execute(
        select(models.User).where(
            ((models.User.email == identifier) | (models.User.phone == identifier)) &
            (models.User.role_id.in_([1, 3, 4, 5]))
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        logger.warning(f"❌ Admin login failed: Invalid credentials for identifier: {identifier}")
        raise HTTPException(status_code=404, detail="Invalid admin credentials")
    
    if not getattr(user, "status", False):
        logger.warning(f"❌ User account is inactive: {identifier}")
        raise HTTPException(status_code=403, detail="User account is inactive")
    # 🔄 Changed this line for plain-text comparison

    # Check password against user table
    if request.password != str(user.password):
        logger.warning(f"❌ Incorrect password attempt for admin: {identifier}")
        raise HTTPException(status_code=401, detail="Incorrect password")

    # Create JWT token for admin
    token = create_token({
        "userId": str(user.userId),
        "role": user.role,
        "role_id": user.role_id,
        "email": user.email,
        "type": "admin"
    })

    logger.info(f"✅ Admin logged in successfully: {identifier} (Role ID: {user.role_id})")

    # Send Kafka event for admin login
    try:
        await kafka_producer.send_event(
            "admin.loggedin",
            {
                "action": "admin_login",
                "success": True,
                "userId": str(user.userId),
                "email": user.email,
                "phone": user.phone,
                "role": user.role,
                "role_id": user.role_id,
                "type": "admin",
                "time": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as e:
        logger.error(f"⚠️ Kafka admin login event error for {user.email}: {e}")

    return {
        "access_token": token,
        "token_type": "bearer",
        "userId": str(user.userId),
        "role": user.role,
        "role_id": user.role_id,
        "email": user.email,
        "phone": user.phone,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "type": "admin"
    }
