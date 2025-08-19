# app/login.py
import logging
import re
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import datetime, timezone
from app.models import models
from app.schemas.schemas import LoginRequest
from app.config.database import get_db
from app.services import kafka_producer
from app.utils.jwt_utils import create_token


router = APIRouter()
logger = logging.getLogger("auth")

EMAIL_REGEX = re.compile(r"^[^@]+@[^@]+\.[^@]+$")
MOBILE_REGEX = re.compile(r"^(?:\+91)?[6-9]\d{9}$")


def is_valid_email(identifier: str) -> bool:
    return bool(EMAIL_REGEX.match(identifier))

def is_valid_mobile(identifier: str) -> bool:
    return bool(MOBILE_REGEX.match(identifier))

def normalize_mobile(identifier: str) -> str:
    """Normalize mobile number to 10-digit format (strip +91 if present)"""
    if identifier.startswith("+91"):
        return identifier[3:]
    return identifier
@router.post("/auth/admin_login")
async def admin_login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Admin login endpoint for users with role_id in [1,3,4,5]
    """
    logger = logging.getLogger(__name__)
    
    identifier = request.identifier.strip()
    is_email = bool(EMAIL_REGEX.match(identifier))
    is_mobile = bool(MOBILE_REGEX.match(identifier))

    # Validate identifier
    if not (is_email or is_mobile):
        if "@" in identifier or "." in identifier or identifier.isalnum():
            detail_msg = "Invalid email format"
        elif identifier.isdigit() or identifier.startswith("+"):
            detail_msg = "Invalid mobile number format"
        else:
            detail_msg = "Invalid login identifier"
        logger.warning(f"❌ {detail_msg}: {identifier}")
        raise HTTPException(status_code=400, detail=detail_msg)

    # Normalize mobile
    if is_mobile:
        identifier = normalize_mobile(identifier)

    # Fetch admin user
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

    # Plain-text password check
    if request.password != str(user.password):
        logger.warning(f"❌ Incorrect password attempt for admin: {identifier}")
        raise HTTPException(status_code=401, detail="Incorrect password")

    # Create JWT token
    token = create_token({
        "userId": str(user.userId),
        "role": user.role,
        "role_id": user.role_id,
        "email": user.email,
        "type": "admin"
    })

    logger.info(f"✅ Admin logged in successfully: {identifier} (Role ID: {user.role_id})")

    # Kafka event
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

    # Success response
    return {
        "success": True,
        "message": "Admin logged in successfully",
        "data": {
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
    }