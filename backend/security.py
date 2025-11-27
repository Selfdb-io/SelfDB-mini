# security.py
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional
from uuid import UUID
import asyncio
from concurrent.futures import ThreadPoolExecutor
import jwt
from fastapi import Depends, HTTPException, status, Security
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
import psycopg
from db import get_db

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

class SecuritySettings(BaseSettings):
    SECRET_KEY: str  # Required - no fallback
    ALGORITHM: str  # Required - no fallback
    ACCESS_TOKEN_EXPIRE_MINUTES: int  # Required - no fallback
    API_KEY: str  # Required - no fallback
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

security_settings = SecuritySettings()

SECRET_KEY = security_settings.SECRET_KEY
ALGORITHM = security_settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = security_settings.ACCESS_TOKEN_EXPIRE_MINUTES

# API Key Configuration
API_KEY = security_settings.API_KEY
API_KEY_NAME = "X-API-Key"

# Use bcrypt instead of Argon2 for faster password hashing
# rounds=10 ≈ 65ms (vs Argon2's 500ms+), still industry-standard security
# Increase rounds to 12 for production if latency is acceptable
password_hash = PasswordHash((BcryptHasher(rounds=10),))
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/users/token")
# Optional OAuth2 - doesn't raise error if token is missing
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/users/token", auto_error=False)

# Thread pool for CPU-intensive password hashing (bcrypt blocks the event loop!)
_password_executor = ThreadPoolExecutor(max_workers=4)


# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[str] = None

# ─────────────────────────────────────────────────────────────────────────────
# Utilities - ASYNC versions to avoid blocking the event loop
# ─────────────────────────────────────────────────────────────────────────────
def _verify_password_sync(plain_password: str, hashed_password: str) -> bool:
    """Sync version - DO NOT call directly, use verify_password instead."""
    return password_hash.verify(plain_password, hashed_password)

def _get_password_hash_sync(password: str) -> str:
    """Sync version - DO NOT call directly, use get_password_hash instead."""
    return password_hash.hash(password)

async def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password in thread pool to avoid blocking event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _password_executor, _verify_password_sync, plain_password, hashed_password
    )

async def get_password_hash(password: str) -> str:
    """Hash password in thread pool to avoid blocking event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _password_executor, _get_password_hash_sync, password
    )



def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    # Ensure sub is a string
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# ─────────────────────────────────────────────────────────────────────────────
# Dependencies
# ─────────────────────────────────────────────────────────────────────────────
async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: psycopg.AsyncConnection = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id=user_id)
    except InvalidTokenError:
        raise credentials_exception

    # Fetch user from DB
    result = await db.execute("SELECT * FROM users WHERE id = %s", (UUID(token_data.user_id),))
    record = await result.fetchone()
    if record is None:
        raise credentials_exception
    
    return record # Returns dict (with dict_row factory)

from models.user import UserInDB

async def get_current_active_user(
    current_user_record = Depends(get_current_user)
) -> UserInDB:
    user = UserInDB(**current_user_record)
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user

# ─────────────────────────────────────────────────────────────────────────────
# Optional Authentication (for public resources)
# ─────────────────────────────────────────────────────────────────────────────
async def get_optional_current_user(
    token: str | None = Depends(optional_oauth2_scheme),
    db: psycopg.AsyncConnection = Depends(get_db)
) -> UserInDB | None:
    """
    Optional authentication - returns None if no token provided.
    Used for endpoints that support both authenticated and unauthenticated access.
    """
    if not token:
        return None
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        
        # Fetch user from DB
        result = await db.execute("SELECT * FROM users WHERE id = %s", (UUID(user_id),))
        record = await result.fetchone()
        if record is None:
            return None
        
        user = UserInDB(**record)
        if not user.is_active:
            return None
        
        return user
    except (InvalidTokenError, Exception):
        # Invalid token - return None instead of raising error
        return None