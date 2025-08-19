import os
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError

# Load from environment
SECRET_KEY = os.environ.get("JWT_SECRET", "your_jwt_secret")
ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", 60))


def create_token(data: dict, expires_delta: int = ACCESS_TOKEN_EXPIRE_MINUTES) -> str:
    """
    Create JWT access token with optional expiry (default 60 min)
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_delta)
    to_encode.update({"exp": expire})
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return token


def decode_access_token(token: str) -> dict:
    """
    Decode JWT token and return payload
    Raises JWTError if invalid or expired
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        raise e


def verify_token(token: str) -> bool:
    """
    Return True if token is valid, else False
    """
    try:
        decode_access_token(token)
        return True
    except JWTError:
        return False
