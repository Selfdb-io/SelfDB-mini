from pydantic import BaseModel, Field, field_validator, EmailStr, ConfigDict, SecretStr
from typing import Optional
from datetime import datetime
from uuid import UUID, uuid4
from enum import Enum
import re

NAME_PATTERN = r'^[A-Za-z \'\-]+$'
# Updated pattern to require at least: 1 uppercase, 1 lowercase, 1 digit, 1 special char
PASSWORD_PATTERN = r'^[A-Za-z0-9@$!%*?&]{8,72}$'

def validate_password_complexity(v: Optional[SecretStr]) -> Optional[SecretStr]:
    """Shared password validation logic - matches schema exactly."""
    if v is None:
        return v
    
    value = v.get_secret_value()
    
    # Check length
    if len(value) < 8 or len(value) > 72:
        raise ValueError('Password must be between 8 and 72 characters')
    
    # Check allowed characters - ASCII only, no Unicode digits
    # This MUST match the JSON Schema pattern exactly
    if not re.match(r'^[A-Za-z0-9@$!%*?&]+$', value):
        raise ValueError('Password contains invalid characters. Only A-Z, a-z, 0-9, @$!%*?& are allowed')
    
    return v

class UserRole(str, Enum):
    USER = "USER"
    ADMIN = "ADMIN"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Base Model
# ─────────────────────────────────────────────────────────────────────────────
class UserBase(BaseModel):
    email: EmailStr = Field(strict=True)
    first_name: str = Field(max_length=100, pattern=NAME_PATTERN, strict=True, alias='firstName')
    last_name: str = Field(max_length=100, pattern=NAME_PATTERN, strict=True, alias='lastName')
    role: UserRole = Field(default=UserRole.USER)
    is_active: bool = Field(default=True, strict=True, alias='isActive')
    
    model_config = ConfigDict(
        extra='ignore', 
        use_enum_values=True,
        populate_by_name=True  # Allows both snake_case and camelCase
    )

# ─────────────────────────────────────────────────────────────────────────────
# 2. Database Model
# ─────────────────────────────────────────────────────────────────────────────
class UserInDB(UserBase):
    id: UUID
    password: str # Hashed password string
    created_at: Optional[datetime] = None

# ─────────────────────────────────────────────────────────────────────────────
# 3. Create Model
# ─────────────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr = Field(strict=True)
    first_name: str = Field(max_length=100, pattern=NAME_PATTERN, strict=True, alias='firstName')
    last_name: str = Field(max_length=100, pattern=NAME_PATTERN, strict=True, alias='lastName')
    password: SecretStr = Field(
        ...,
        min_length=8, 
        max_length=72, 
        strict=True,
        json_schema_extra={
            "pattern": PASSWORD_PATTERN,  # Now includes complexity requirements
            "format": None
        }
    )

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: SecretStr) -> SecretStr:
        return validate_password_complexity(v)
    
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True  # Allows both snake_case and camelCase
    )

# ─────────────────────────────────────────────────────────────────────────────
# 4. Read Model
# ─────────────────────────────────────────────────────────────────────────────
class UserRead(UserBase):
    id: UUID
    created_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

# ─────────────────────────────────────────────────────────────────────────────
# 5. Update Model
# ─────────────────────────────────────────────────────────────────────────────
class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[SecretStr] = Field(
        None,
        min_length=8,
        max_length=72,
        json_schema_extra={
            "pattern": PASSWORD_PATTERN,  # Now includes complexity requirements
            "format": None
        }
    )
    role: Optional[UserRole] = None
    is_active: Optional[bool] = Field(None, alias='isActive')
    first_name: Optional[str] = Field(None, max_length=100, pattern=NAME_PATTERN, alias='firstName')
    last_name: Optional[str] = Field(None, max_length=100, pattern=NAME_PATTERN, alias='lastName')

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: Optional[SecretStr]) -> Optional[SecretStr]:
        return validate_password_complexity(v)

    model_config = ConfigDict(
        extra='forbid',
        use_enum_values=True,
        populate_by_name=True,  # Allows both snake_case and camelCase
        json_schema_extra={
            "examples": [{
                "email": "updated@example.com",
                "password": "NewPass123!",
                "is_active": False,
            }]
        }
    )

class UserDelete(BaseModel):
    id: UUID

# ─────────────────────────────────────────────────────────────────────────────
# 5. Login model 
# ─────────────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):  
    email: EmailStr = Field(strict=True)
    password: str = Field(
        min_length=1, 
        max_length=72, 
        strict=True,
        json_schema_extra={
            "pattern": r"^[\x20-\x7E]+$",  # ASCII printable only (documented for schema)
            "format": None
        }
    )

    @field_validator('password')
    @classmethod
    def validate_password_chars(cls, v: str) -> str:
        """
        Only validate ASCII characters to prevent malformed Unicode (500 errors).
        Do NOT enforce complexity for login - users may have simple passwords.
        """
        if not all(ord(c) < 128 and c.isprintable() for c in v):
            raise ValueError('Password contains invalid characters')
        return v
    
    model_config = ConfigDict(
        extra='forbid'
    )