import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlalchemy.orm import declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL not set in .env")

Base = declarative_base()

# ✅ Compatible engine for asyncpg
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,  # ensures dead connections are detected
    future=True
)

SessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)

async def get_db():
    async with SessionLocal() as session:
        yield session
