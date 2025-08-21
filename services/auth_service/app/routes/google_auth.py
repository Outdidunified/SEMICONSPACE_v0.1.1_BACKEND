# app/routes/google_auth.py
import os
import re
import secrets
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import database
from app.models import models
from app.schemas.schemas import APIResponse, GoogleRegisterRequest, GoogleLoginRequest, GoogleSignInRequest
from app.services import kafka_producer
from app.utils.jwt_utils import create_token

# Google token verification
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

router = APIRouter()

@router.get("/auth/google/config")
async def get_google_config():
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="Server missing GOOGLE_CLIENT_ID configuration")
    return {"client_id": client_id}

EMAIL_REGEX = r"^[^@]+@[^@]+\.[^@]+$"
MOBILE_REGEX = r"^(?:\+91)?[6-9]\d{9}$"


def _normalize_phone(phone: str) -> str:
    phone = phone.strip()
    if phone.startswith("+91"):
        phone = phone[3:]
    return phone


async def _get_role_by_id(db: AsyncSession, role_id: int) -> tuple[str, bool] | None:
    result = await db.execute(
        select(models.UserRole.role_name, models.UserRole.status).where(models.UserRole.role_id == role_id)
    )
    # Ensure we return a plain tuple instead of a SQLAlchemy Row for correct typing
    return result.tuples().first()


def _verify_google_id_token(id_token: str, audience: str) -> dict:
    try:
        request_adapter = google_requests.Request()
        claims = google_id_token.verify_oauth2_token(id_token, request_adapter, audience)
        return claims
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")


# @router.post("/auth/google/register", response_model=APIResponse)
# async def google_register(
#     body: GoogleRegisterRequest,
#     db: AsyncSession = Depends(database.get_db),
# ):
#     audience = os.getenv("GOOGLE_CLIENT_ID")
#     if not audience:
#         raise HTTPException(status_code=500, detail="Server missing GOOGLE_CLIENT_ID configuration")

#     claims = _verify_google_id_token(body.id_token, audience)

#     # Safely extract user names from Google claims
#     email = claims.get("email")
#     email_verified = claims.get("email_verified")
#     name = (claims.get("name") or "").strip()
#     parts = name.split() if name else []
#     given_name = claims.get("given_name") or (parts[0] if len(parts) > 0 else "")
#     family_name = claims.get("family_name") or (parts[1] if len(parts) > 1 else "")

#     if not email or not re.match(EMAIL_REGEX, email):
#         raise HTTPException(status_code=400, detail="Google account email is missing or invalid")
#     if email_verified is False:
#         raise HTTPException(status_code=400, detail="Google email is not verified")

#     # Check if user already exists
#     existing = await db.execute(select(models.User).where(models.User.email == email))
#     if existing.scalar_one_or_none():
#         raise HTTPException(status_code=409, detail="User already registered. Please login with Google")

#     # Validate and normalize phone
#     phone = _normalize_phone(body.phone)
#     if not re.match(MOBILE_REGEX, phone):
#         raise HTTPException(status_code=400, detail="Invalid mobile number format")

#     existing_phone = await db.execute(select(models.User).where(models.User.phone == phone))
#     if existing_phone.scalar_one_or_none():
#         raise HTTPException(status_code=400, detail="Phone number already registered")

#     # Validate role
#     role_row = await _get_role_by_id(db, body.role_id)
#     if not role_row:
#         raise HTTPException(status_code=400, detail=f"Role ID '{body.role_id}' not found")
#     role_name, role_status = role_row
#     if not role_status:
#         raise HTTPException(status_code=400, detail=f"Role ID '{body.role_id}' is inactive and cannot be assigned")

#     # Create user with a generated password placeholder (not used)
#     placeholder_password = secrets.token_urlsafe(32)
#     new_user = models.User(
#         first_name=given_name or "",
#         last_name=family_name or "",
#         email=email,
#         phone=phone,
#         password=placeholder_password,
#         role=role_name,
#         role_id=body.role_id,
#         created_by=email,
#         modified_by=None,
#         modified_at=None,
#         status=True,
#     )
#     db.add(new_user)
#     await db.commit()
#     await db.refresh(new_user)

#     # Kafka event (ignore failures)
#     try:
#         await kafka_producer.send_event(
#             "user.registered",
#             {
#                 "success": True,
#                 "data": {
#                     "action": "registered",
#                     "userId": str(new_user.userId),
#                     "first_name": new_user.first_name,
#                     "last_name": new_user.last_name,
#                     "email": new_user.email,
#                     "phone": new_user.phone,
#                     "password": placeholder_password,
#                     "role": new_user.role,
#                     "role_id": new_user.role_id,
#                     "created_at": new_user.created_at.isoformat(),
#                     "created_by": new_user.created_by,
#                     "modified_at": new_user.modified_at.isoformat() if new_user.modified_at is not None else None,
#                     "modified_by": new_user.modified_by if new_user.modified_by is not None else None
#                 }
#             }
#         )
#     except Exception:
#         pass

#     token = create_token({
#         "userId": str(new_user.userId),
#         "role": str(new_user.role),
#         "email": str(new_user.email),
#     })

#     # Also emit a logged-in event so clients can treat registration as an immediate login
#     try:
#         await kafka_producer.send_event(
#             "user.loggedin",
#             {
#                 "action": "login",
#                 "success": True,
#                 "userId": str(new_user.userId),
#                 "email": new_user.email,
#                 "phone": new_user.phone,
#                 "role": new_user.role,
#                 "role_id": new_user.role_id,
#                 "time": datetime.now(timezone.utc).isoformat(),
#             },
#         )
#     except Exception:
#         pass

#     return {
#         "success": True,
#         "message": "User registered and logged in successfully with Google",
#         "data": {
#             "access_token": token,
#             "token_type": "bearer",
#             "userId": str(new_user.userId),
#             "role": new_user.role,
#             "role_id": new_user.role_id,
#             "email": new_user.email,
#             "phone": new_user.phone,
#             "first_name": new_user.first_name,
#             "last_name": new_user.last_name,
#         },
#     }


# @router.post("/auth/google/login", response_model=APIResponse)
# async def google_login(
#     body: GoogleLoginRequest,
#     db: AsyncSession = Depends(database.get_db),
# ):
#     audience = os.getenv("GOOGLE_CLIENT_ID")
#     if not audience:
#         raise HTTPException(status_code=500, detail="Server missing GOOGLE_CLIENT_ID configuration")

#     claims = _verify_google_id_token(body.id_token, audience)

#     email = claims.get("email")
#     email_verified = claims.get("email_verified")
#     if not email or not re.match(EMAIL_REGEX, email):
#         raise HTTPException(status_code=400, detail="Google account email is missing or invalid")
#     if email_verified is False:
#         raise HTTPException(status_code=400, detail="Google email is not verified")

#     # Fetch user
#     result = await db.execute(select(models.User).where(models.User.email == email))
#     user = result.scalar_one_or_none()
#     if not user:
#         raise HTTPException(status_code=404, detail="User not registered. Please register with Google first")

#     if not getattr(user, "status", False):
#         raise HTTPException(status_code=403, detail="User account is inactive")

#     token = create_token({
#         "userId": str(user.userId),
#         "role": str(user.role),
#         "email": str(user.email),
#     })

#     # Kafka event (ignore failures)
#     try:
#         await kafka_producer.send_event(
#             "user.loggedin",
#             {
#                 "action": "login",
#                 "success": True,
#                 "userId": str(user.userId),
#                 "email": user.email,
#                 "phone": user.phone,
#                 "role": user.role,
#                 "role_id": user.role_id,
#                 "time": datetime.now(timezone.utc).isoformat(),
#             },
#         )
#     except Exception:
#         pass

#     return {
#         "success": True,
#         "message": "User logged in successfully with Google",
#         "data": {
#             "access_token": token,
#             "token_type": "bearer",
#             "userId": str(user.userId),
#             "role": user.role,
#             "role_id": user.role_id,
#             "email": user.email,
#             "phone": user.phone,
#             "first_name": user.first_name,
#             "last_name": user.last_name,
#         },
#     }


@router.post("/auth/googleauthentication", response_model=APIResponse)
async def google_signup(
    body: GoogleSignInRequest,
    db: AsyncSession = Depends(database.get_db),
):
    audience = os.getenv("GOOGLE_CLIENT_ID")
    if not audience:
        raise HTTPException(status_code=500, detail="Server missing GOOGLE_CLIENT_ID configuration")

    claims = _verify_google_id_token(body.id_token, audience)

    # Extract verified email and names
    email = claims.get("email")
    email_verified = claims.get("email_verified")
    name = (claims.get("name") or "").strip()
    parts = name.split() if name else []
    given_name = claims.get("given_name") or (parts[0] if len(parts) > 0 else "")
    family_name = claims.get("family_name") or (parts[1] if len(parts) > 1 else "")

    if not email or not re.match(EMAIL_REGEX, email):
        raise HTTPException(status_code=400, detail="Google account email is missing or invalid")
    if email_verified is False:
        raise HTTPException(status_code=400, detail="Google email is not verified")

    # Try login path
    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalar_one_or_none()

    if user:
        if not getattr(user, "status", False):
            raise HTTPException(status_code=403, detail="User account is inactive")

        token = create_token({
            "userId": str(user.userId),
            "role": str(user.role),
            "email": str(user.email),
        })

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
        except Exception:
            pass

        return {
            "success": True,
            "message": "User logged in successfully with Google",
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
            },
        }

    # Registration path (first-time Google sign-in)
    if not body.phone or not body.role_id:
        raise HTTPException(
            status_code=400,
            detail="First-time Google sign-in requires phone and role_id"
        )

    phone = _normalize_phone(body.phone)
    if not re.match(MOBILE_REGEX, phone):
        raise HTTPException(status_code=400, detail="Invalid mobile number format")

    # Check phone unique
    existing_phone = await db.execute(select(models.User).where(models.User.phone == phone))
    if existing_phone.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Phone number already registered")

    # Validate role
    role_row = await _get_role_by_id(db, body.role_id)
    if not role_row:
        raise HTTPException(status_code=400, detail=f"Role ID '{body.role_id}' not found")
    role_name, role_status = role_row
    if not role_status:
        raise HTTPException(status_code=400, detail=f"Role ID '{body.role_id}' is inactive and cannot be assigned")

    placeholder_password = secrets.token_urlsafe(32)
    new_user = models.User(
        first_name=given_name or "",
        last_name=family_name or "",
        email=email,
        phone=phone,
        password=placeholder_password,
        role=role_name,
        role_id=body.role_id,
        created_by=email,
        modified_by=None,
        modified_at=None,
        status=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    try:
        await kafka_producer.send_event(
            "user.registered",
            {
                "success": True,
                "data": {
                    "action": "registered",
                    "userId": str(new_user.userId),
                    "first_name": new_user.first_name,
                    "last_name": new_user.last_name,
                    "email": new_user.email,
                    "phone": new_user.phone,
                    "password": placeholder_password,
                    "role": new_user.role,
                    "role_id": new_user.role_id,
                    "created_at": new_user.created_at.isoformat(),
                    "created_by": new_user.created_by,
                    "modified_at": new_user.modified_at.isoformat() if new_user.modified_at is not None else None,
                    "modified_by": new_user.modified_by if new_user.modified_by is not None else None
                }
            }
        )
    except Exception:
        pass

    token = create_token({
        "userId": str(new_user.userId),
        "role": str(new_user.role),
        "email": str(new_user.email),
    })

    # Also emit a logged-in event so clients can treat registration as an immediate login
    try:
        await kafka_producer.send_event(
            "user.loggedin",
            {
                "action": "login",
                "success": True,
                "userId": str(new_user.userId),
                "email": new_user.email,
                "phone": new_user.phone,
                "role": new_user.role,
                "role_id": new_user.role_id,
                "time": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception:
        pass

    return {
        "success": True,
        "message": "User registered and logged in successfully with Google",
        "data": {
            "access_token": token,
            "token_type": "bearer",
            "userId": str(new_user.userId),
            "role": new_user.role,
            "role_id": new_user.role_id,
            "email": new_user.email,
            "phone": new_user.phone,
            "first_name": new_user.first_name,
            "last_name": new_user.last_name,
        },
    }