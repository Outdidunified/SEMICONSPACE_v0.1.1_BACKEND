# app/register.py
import os
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from jose import jwt

from app import database, models, schemas, kafka_producer
from app.schemas import TokenResponse, RegisterRequest
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT config
SECRET_KEY = os.environ["JWT_SECRET"]
ALGORITHM = os.environ["JWT_ALGORITHM"]
#ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"])

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def create_token(data: dict) -> str:
    to_encode = data.copy()
    #expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    #to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
@router.post("/auth/register", response_model=TokenResponse)
async def register_user(request: RegisterRequest, db: AsyncSession = Depends(database.get_db)):
    existing = await db.execute(
        select(models.User).where(
            (models.User.email == request.email) | (models.User.phone == request.phone)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email or phone already registered")

    role_query = await db.execute(
        select(models.UserRole.role_name, models.UserRole.status)
        .where(models.UserRole.role_id == request.role_id)
    )
    role_row = role_query.first()

    if not role_row:
        raise HTTPException(status_code=400, detail=f"Role ID '{request.role_id}' not found")

    role_name, role_status = role_row
    print(role_status)

    # Check if role status is True (active)
    if role_status is not True:
        raise HTTPException(status_code=400, detail=f"Role ID '{request.role_id}' is inactive and cannot be assigned")

    new_user = models.User(
        first_name=request.first_name,
        last_name=request.last_name,
        email=request.email,
        phone=request.phone,
        password=request.password, 
        role=role_name,
        role_id=request.role_id,
        created_by=request.email,
        modified_by=None,
        modified_at=None,
        status=True
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    try:
        await kafka_producer.send_event(
            "user.registered",
            {
            "success": True,
                "data":{
                    "action": "registered",
                    "userId": str(new_user.userId),
                    "first_name": new_user.first_name,
                    "last_name": new_user.last_name,
                    "email": new_user.email,
                    "phone": new_user.phone,
                    "password": new_user.password,
                    "role": new_user.role,
                    "role_id": new_user.role_id,
                    "created_at": new_user.created_at.isoformat(),
                    "created_by": new_user.created_by,
                    "modified_at": new_user.modified_at.isoformat() if new_user.modified_at is not None else None,
                    "modified_by": new_user.modified_by if new_user.modified_by is not None else None
                }
            }
        )
    except Exception as e:
        print(f"Kafka Error: {e}")

    token = create_token({
        "userId": str(new_user.userId),
        "role": new_user.role,
        "email": new_user.email
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "userId": str(new_user.userId),
        "role": new_user.role,
        "role_id": new_user.role_id,
        "email": new_user.email,
        "phone": new_user.phone,
        "first_name": new_user.first_name,
        "last_name": new_user.last_name,
    }
