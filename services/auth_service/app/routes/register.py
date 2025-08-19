# app/register.py
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from dotenv import load_dotenv
from app.services import kafka_producer

from app.config import database
from app.models import models
from app.schemas.schemas import RegisterRequest, APIResponse, TokenResponse
from app.utils.jwt_utils import create_token
from uuid import UUID

load_dotenv()
router = APIRouter()


@router.post("/auth/register", response_model=APIResponse)
async def register_user(request: RegisterRequest, db: AsyncSession = Depends(database.get_db)):
    # Validate password
    if not request.password.strip():
        raise HTTPException(status_code=400, detail="Password cannot be empty")

    # Check existing email
    existing_email = await db.execute(select(models.User).where(models.User.email == request.email))
    email_user = existing_email.scalar_one_or_none()

    # Check existing phone
    existing_phone = await db.execute(select(models.User).where(models.User.phone == request.phone))
    phone_user = existing_phone.scalar_one_or_none()

    if email_user and phone_user:
        raise HTTPException(status_code=400, detail="Email and phone number already registered")
    elif email_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    elif phone_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    # Validate role
    role_query = await db.execute(select(models.UserRole.role_name, models.UserRole.status)
                                  .where(models.UserRole.role_id == request.role_id))
    role_row = role_query.first()
    if not role_row:
        raise HTTPException(status_code=400, detail=f"Role ID '{request.role_id}' not found")

    role_name, role_status = role_row
    if not role_status:
        raise HTTPException(status_code=400, detail=f"Role ID '{request.role_id}' is inactive and cannot be assigned")

    # Create user (plain password)
    new_user = models.User(
        first_name=request.first_name,
        last_name=request.last_name,
        email=request.email,
        phone=request.phone,
        password=request.password,  # Store plain password for now, consider hashing later
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

    # Publish Kafka event (ignore errors)
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

    # Generate JWT token
    token = create_token({
        "userId": str(new_user.userId),
        "role": str(new_user.role),
        "email": str(new_user.email)
    })

    # Return response (explicitly cast types for Pydantic)
    return {
        "success": True,
        "message": "User registered successfully",
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
            "last_name": new_user.last_name,
    }
    }
