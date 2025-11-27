from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID
import re

# Table name pattern: lowercase letters, numbers, underscores, must start with letter
TABLE_NAME_PATTERN = r'^[a-z][a-z0-9_]*$'

def validate_table_name(v: Optional[str]) -> Optional[str]:
    """Validate table name follows SQL naming conventions."""
    if v is None:
        return v
    
    if len(v) < 1 or len(v) > 63:
        raise ValueError('Table name must be between 1 and 63 characters')
    
    if not re.match(TABLE_NAME_PATTERN, v):
        raise ValueError('Table name must start with lowercase letter and only contain lowercase letters, numbers, and underscores')
    
    # Reserved SQL keywords that shouldn't be used as table names
    reserved_words = {'table', 'user', 'users', 'select', 'insert', 'update', 'delete', 'from', 'where'}
    if v.lower() in reserved_words:
        raise ValueError(f'Table name "{v}" is a reserved keyword and cannot be used')
    
    return v

# ─────────────────────────────────────────────────────────────────────────────
# 1. Base Model
# ─────────────────────────────────────────────────────────────────────────────
class TableBase(BaseModel):
    name: str = Field(min_length=1, max_length=63, pattern=TABLE_NAME_PATTERN, strict=True)
    schema: Dict[str, Any] = Field(..., description="JSON schema definition for table structure")
    public: bool = Field(default=False, strict=True)
    description: Optional[str] = Field(None, max_length=500)
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    
    model_config = ConfigDict(
        extra='ignore',
        json_schema_extra={
            "examples": [{
                "name": "products",
                "schema": {"type": "object", "properties": {"name": {"type": "string"}}},
                "public": True,
                "description": "Product catalog table"
            }]
        }
    )

# ─────────────────────────────────────────────────────────────────────────────
# 2. Database Model
# ─────────────────────────────────────────────────────────────────────────────
class TableInDB(TableBase):
    id: UUID
    owner_id: UUID
    row_count: int = Field(default=0)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

# ─────────────────────────────────────────────────────────────────────────────
# 3. Create Model
# ─────────────────────────────────────────────────────────────────────────────
class TableCreate(BaseModel):
    name: str = Field(
        min_length=1, 
        max_length=63, 
        pattern=TABLE_NAME_PATTERN, 
        strict=True,
        json_schema_extra={
            "pattern": TABLE_NAME_PATTERN,
            "description": "Table name (lowercase letters, numbers, underscores, must start with letter)"
        }
    )
    schema: Dict[str, Any] = Field(..., description="JSON schema definition for table structure")
    public: bool = Field(default=False, strict=True)
    description: Optional[str] = Field(None, max_length=500)
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        return validate_table_name(v)
    
    @field_validator('schema')
    @classmethod
    def validate_schema(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure schema is a valid non-empty dictionary."""
        if not v:
            raise ValueError('Schema cannot be empty')
        if not isinstance(v, dict):
            raise ValueError('Schema must be a JSON object')
        return v
    
    model_config = ConfigDict(
        extra='forbid',
        json_schema_extra={
            "examples": [{
                "name": "products",
                "schema": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "price": {"type": "number"}
                    }
                },
                "public": True,
                "description": "Product catalog table",
                "metadata": {"version": "1.0"}
            }]
        }
    )

# ─────────────────────────────────────────────────────────────────────────────
# 4. Read Model
# ─────────────────────────────────────────────────────────────────────────────
class TableRead(TableBase):
    id: UUID
    owner_id: UUID
    row_count: int = Field(default=0)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)

# ─────────────────────────────────────────────────────────────────────────────
# 5. Update Model
# ─────────────────────────────────────────────────────────────────────────────
class TableUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=63, pattern=TABLE_NAME_PATTERN)
    schema: Optional[Dict[str, Any]] = None
    public: Optional[bool] = None
    description: Optional[str] = Field(None, max_length=500)
    metadata: Optional[Dict[str, Any]] = None
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        return validate_table_name(v)
    
    @field_validator('schema')
    @classmethod
    def validate_schema(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Ensure schema is a valid non-empty dictionary if provided."""
        if v is not None:
            if not v:
                raise ValueError('Schema cannot be empty')
            if not isinstance(v, dict):
                raise ValueError('Schema must be a JSON object')
        return v
    
    model_config = ConfigDict(
        extra='forbid',
        json_schema_extra={
            "examples": [{
                "description": "Updated product table",
                "public": False
            }]
        }
    )
