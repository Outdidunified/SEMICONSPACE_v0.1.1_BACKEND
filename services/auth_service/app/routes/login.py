# app/login.py
import logging
import re
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import datetime, timezone
from app.config import database
from app.models import models
from app.schemas.schemas import LoginRequest
from app.services import kafka_producer
from app.utils.jwt_utils import create_token

router = APIRouter()
logger = logging.getLogger("auth")

EMAIL_REGEX = r"^[^@]+@[^@]+\.[^@]+$"
MOBILE_REGEX = r"^(?:\+91)?[6-9]\d{9}$"


@router.post("/auth/login")
async def login_user(request: LoginRequest, db: AsyncSession = Depends(database.get_db)):
    identifier = request.identifier.strip()
    is_email = bool(re.match(EMAIL_REGEX, identifier))
    is_mobile = bool(re.match(MOBILE_REGEX, identifier))

    if not (is_email or is_mobile):
        detail_msg = "Invalid email format" if "@" in identifier else "Invalid mobile number format"
        logger.warning(f"❌ {detail_msg}: {identifier}")
        raise HTTPException(status_code=400, detail=detail_msg)

    # Normalize mobile
    if is_mobile and identifier.startswith("+91"):
        identifier = identifier[3:]

    # Fetch user
    result = await db.execute(
        select(models.User).where(
            (models.User.email == identifier) | (models.User.phone == identifier)
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        detail_msg = "Invalid Email credentials" if is_email else "Invalid Mobile credentials"
        logger.warning(f"❌ Login failed: {detail_msg} for {identifier}")
        raise HTTPException(status_code=404, detail=detail_msg)

    if not getattr(user, "status", False):
        logger.warning(f"❌ User inactive: {identifier}")
        raise HTTPException(status_code=403, detail="User account is inactive")

    # Plain-text password check
    if request.password != str(user.password):
        logger.warning(f"❌ Incorrect password for: {identifier}")
        raise HTTPException(status_code=401, detail="Incorrect password")

    # Role check (example: role_id 2)
    if getattr(user, 'role_id', None) != 2:
        logger.warning(f"❌ Unauthorized role login attempt: {identifier} (role_id: {user.role_id})")
        raise HTTPException(status_code=403, detail="Invalid User")

    # Generate JWT token
    token = create_token({
        "userId": str(user.userId),
        "role": str(user.role),
        "email": str(user.email)
    })

    logger.info(f"✅ User logged in successfully: {identifier}")

    # Kafka event
    try:
        await kafka_producer.send_event(
            "user.loggedin",
            {
                "action": "login",
                "success": True,
                "userId": str(user.userId),
                "email": user.email,
                "phone": user.phone,
                "role": user.role,
                "role_id": user.role_id,
                "time": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as e:
        logger.error(f"⚠️ Kafka login event error for {user.email}: {e}")

    # Return response (cast types to satisfy Pydantic/typing)
    return {
        "success": True,
        "message": "User logged in successfully",
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
        }
    }
