# import os
# import re
# import logging
# from typing import Pattern
# from fastapi import APIRouter, HTTPException, Depends
# from sqlalchemy.ext.asyncio import AsyncSession
# from sqlalchemy.future import select
# from passlib.context import CryptContext
# from jose import jwt
# from datetime import datetime, timedelta, timezone

# from app.database import get_db
# from app import models, schemas, kafka_producer
# from dotenv import load_dotenv

# load_dotenv()

# router = APIRouter()
# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# SECRET_KEY = os.environ["JWT_SECRET"]
# ALGORITHM = os.environ["JWT_ALGORITHM"]
# #ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"])

# EMAIL_REGEX: Pattern[str] = re.compile(r"^[^@]+@[^@]+\.[^@]+$")
# MOBILE_REGEX: Pattern[str] = re.compile(r"^(?:\+91)?[6-9]\d{9}$")

# def is_valid_email(identifier: str) -> bool:
#     return bool(EMAIL_REGEX.match(identifier))

# def is_valid_mobile(identifier: str) -> bool:
#     return bool(MOBILE_REGEX.match(identifier))

# def normalize_mobile(identifier: str) -> str:
#     """Normalize mobile number to 10-digit format (strip +91 if present)"""
#     if identifier.startswith("+91"):
#         return identifier[3:]
#     return identifier

# def verify_password(plain_password: str, hashed_password: str) -> bool:
#     return pwd_context.verify(plain_password, hashed_password)

# def create_token(data: dict) -> str:
#     to_encode = data.copy()
#     #expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
#     #to_encode["exp"] = expire
#     return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# @router.post("/auth/Ordermanager_login", response_model=schemas.TokenResponse)
# async def login_user(request: schemas.LoginRequest, db: AsyncSession = Depends(get_db)):
#     logger = logging.getLogger(__name__)
    
#     identifier = request.identifier.strip()
#     is_email = is_valid_email(identifier)
#     is_mobile = is_valid_mobile(identifier)

#     if not (is_email or is_mobile):
#         logger.warning("❌ Invalid login identifier format")
#         raise HTTPException(status_code=400, detail="Invalid email or mobile number format")

#     if is_mobile:
#         identifier = normalize_mobile(identifier)

#     result = await db.execute(
#         select(models.User).where(
#             (models.User.email == identifier) | (models.User.phone == identifier)
#         )
#     )
#     user = result.scalar_one_or_none()

#     if not user:
#         detail_msg = "Invalid Email credentials" if is_email else "Invalid Mobile credentials"
#         logger.warning(f"❌ Login failed: {detail_msg} for identifier: {identifier}")
#         raise HTTPException(status_code=404, detail=detail_msg)

#     # 🔄 Changed this line for plain-text comparison
#     if request.password != str(user.password):
#         logger.warning(f"❌ Incorrect password attempt for user: {identifier}")
#         raise HTTPException(status_code=401, detail="Incorrect password")
    
#     if request.role_id != 4:
#         logger.warning(f"❌ Unauthorized access attempt for user: {identifier}")
#         raise HTTPException(status_code=403, detail="Unauthorized Access") 

#     role_id_value = getattr(user, 'role_id', None)
#     if role_id_value != 4:
#         logger.warning(f"❌ Login attempt by unauthorized role: {identifier} (role_id: {role_id_value})")
#         raise HTTPException(status_code=403, detail="Invalid Order Manager")

#     token = create_token({
#         "userId": str(user.userId),
#         "role": user.role,
#         "email": user.email
#     })

#     logger.info(f"✅ User logged in successfully: {identifier}")

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
#     except Exception as e:
#         logger.error(f"⚠️ Kafka login event error for {user.email}: {e}")

#     return {
#         "access_token": token,
#         "token_type": "bearer",
#         "userId": str(user.userId),
#         "role": user.role,
#         "role_id": user.role_id,
#         "email": user.email,
#         "phone": user.phone,
#         "first_name": user.first_name,
#         "last_name": user.last_name,
#     }
