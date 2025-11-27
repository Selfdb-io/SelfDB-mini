#users.py
from uuid import UUID
import uuid
from typing import List, Annotated, Dict, Any, Literal
from datetime import timedelta
import psycopg
from psycopg import sql
from psycopg.errors import UniqueViolation
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from models.user import LoginRequest, UserCreate, UserRead, UserUpdate, UserInDB
from db import get_db
from security import (
    get_password_hash, 
    verify_password, 
    create_access_token, 
    Token, 
    ACCESS_TOKEN_EXPIRE_MINUTES,
    get_current_active_user
)
from utils.validation import validate_search_term, SEARCH_TERM_REGEX
from services.backup_service import get_system_initialized, set_system_initialized

router = APIRouter(prefix="/users", tags=["users"])

# ─────────────────────────────────────────────────────────────────────────────
# Documentation & Error Helpers
# ─────────────────────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    detail: str

# Defined responses allow Schemathesis to accept 4xx codes as valid outcomes
RESP_ERRORS = {  
    400: {"model": ErrorResponse, "description": "Bad Request"},  
    401: {"model": ErrorResponse, "description": "Unauthorized"},  
    403: {"model": ErrorResponse, "description": "Forbidden"}, 
    404: {"model": ErrorResponse, "description": "Not Found"},  
    405: {"model": ErrorResponse, "description": "Method Not Allowed"},
    406: {"model": ErrorResponse, "description": "Not Acceptable"},  
    409: {"model": ErrorResponse, "description": "Conflict"},  
}

def strict_query_params(allowed: set[str]):
    """
    Validates query parameters. Returns 400 (not 422) for unknown params 
    to distinguish logic errors from schema validation errors.
    """
    def dependency(request: Request):
        unknown = [k for k in request.query_params.keys() if k not in allowed]
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown query parameters: {', '.join(unknown)}"
            )
        return True
    return dependency

async def get_user_from_db(
    user_id: UUID, 
    db: psycopg.AsyncConnection = Depends(get_db)
) -> UserInDB:
    result = await db.execute("SELECT * FROM users WHERE id = %s", (user_id,))
    record = await result.fetchone()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserInDB(**record)

# ─────────────────────────────────────────────────────────────────────────────
# 1. Static Routes (Must be defined FIRST)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/token", 
    response_model=Token,
    responses=RESP_ERRORS,
    summary="Login"
)
async def login_for_access_token(
    credentials: LoginRequest,  
    db: psycopg.AsyncConnection = Depends(get_db)
):
    result = await db.execute("SELECT * FROM users WHERE email = %s", (credentials.email,))
    user_record = await result.fetchone()
    
    # Generic error to prevent user enumeration
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if not user_record:
        raise auth_error
    
    user = UserInDB(**user_record)

    if not await verify_password(credentials.password, user.password):
        raise auth_error
    
    if not user.is_active:
         raise HTTPException(status_code=400, detail="Inactive user")

    # On first successful login, mark system as initialized
    initialized = await get_system_initialized(db)
    if not initialized:
        await set_system_initialized(db, True)

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return Token(access_token=access_token, token_type="bearer")


@router.get(
    "/me", 
    response_model=UserRead,
    responses=RESP_ERRORS,
    summary="Get Current User"
)
async def read_users_me(
    current_user: UserInDB = Depends(get_current_active_user)
):
    return current_user


@router.get(
    "/count",
    response_model=int,
    dependencies=[Depends(strict_query_params({"search"}))],
    responses=RESP_ERRORS,
    summary="Get User Count"
)
async def get_user_count(
    search: Annotated[str | None, Query(max_length=100, pattern=SEARCH_TERM_REGEX, description="Search term for filtering by email, first name, or last name")] = None,
    db: psycopg.AsyncConnection = Depends(get_db),
    current_user: UserInDB = Depends(get_current_active_user)
) -> int:
    """Get total number of users, optionally filtered by search term. Requires authentication."""
    # Validate search term for safe characters
    search = validate_search_term(search)
    
    if search:
        search_pattern = f"%{search}%"
        result = await db.execute(
            "SELECT COUNT(*) FROM users WHERE email ILIKE %s OR first_name ILIKE %s OR last_name ILIKE %s",
            (search_pattern, search_pattern, search_pattern)
        )
    else:
        result = await db.execute("SELECT COUNT(*) FROM users")
    row = await result.fetchone()
    return row['count'] if row else 0


# ─────────────────────────────────────────────────────────────────────────────
# 2. Collection Routes
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/", 
    response_model=UserRead, 
    status_code=status.HTTP_201_CREATED,
    responses=RESP_ERRORS,
    summary="Create User"
)
async def create_user(
    user: UserCreate, 
    db: psycopg.AsyncConnection = Depends(get_db)
):
    # Allow self-registration (no admin check needed here)
    hashed_password = await get_password_hash(user.password.get_secret_value())
    user_id = uuid.uuid4()

    try:
        await db.execute(
            """
            INSERT INTO users (id, email, password, first_name, last_name, role, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (user_id, user.email, hashed_password, user.first_name, user.last_name, "USER", True)
        )
        await db.commit()
        
        result = await db.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        created_record = await result.fetchone()
        return UserInDB(**created_record)

    except UniqueViolation:
        await db.rollback()
        # Idempotency: If exact user exists, return it. If conflict (different details), raise 409.
        result = await db.execute("SELECT * FROM users WHERE email = %s", (user.email,))
        existing = await result.fetchone()
        if existing:
            # Optional: Check if other fields match before returning
            return UserInDB(**existing)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already taken")
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get(
    "/", 
    response_model=List[UserRead],
    dependencies=[Depends(strict_query_params({"skip", "limit", "search", "sort_by", "sort_order"}))],
    responses=RESP_ERRORS,
    summary="List Users"
)
async def read_users(
    skip: Annotated[int, Query(ge=0, le=2147483647)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    search: Annotated[str | None, Query(max_length=100, pattern=SEARCH_TERM_REGEX, description="Search term for filtering by email, first name, or last name")] = None,
    sort_by: Annotated[Literal["created_at", "email", "first_name", "last_name"], Query(description="Field to sort by")] = "created_at",
    sort_order: Annotated[Literal["asc", "desc"], Query(description="Sort order (ascending or descending)")] = "desc",
    db: psycopg.AsyncConnection = Depends(get_db),
    current_user: UserInDB = Depends(get_current_active_user)
):
    """
    List users with optional search and sorting. Requires authentication.
    
    - **search**: Filter by email, first name, or last name (case-insensitive, printable ASCII only)
    - **sort_by**: Field to sort by (created_at, email, first_name, last_name)
    - **sort_order**: Sort direction (asc or desc, default: desc)
    """
    try:
        # Validate search term for safe characters
        search = validate_search_term(search)
        
        # Build the ORDER BY clause safely using psycopg sql module
        order_direction = sql.SQL("DESC") if sort_order == "desc" else sql.SQL("ASC")
        order_by = sql.SQL("ORDER BY {} {}").format(
            sql.Identifier(sort_by),
            order_direction
        )
        
        if search:
            search_pattern = f"%{search}%"
            query = sql.SQL("""
                SELECT * FROM users 
                WHERE email ILIKE %s OR first_name ILIKE %s OR last_name ILIKE %s
                {} 
                LIMIT %s OFFSET %s
            """).format(order_by)
            result = await db.execute(query, (search_pattern, search_pattern, search_pattern, limit, skip))
        else:
            query = sql.SQL("SELECT * FROM users {} LIMIT %s OFFSET %s").format(order_by)
            result = await db.execute(query, (limit, skip))
        
        records = await result.fetchall()
        return [UserInDB(**record) for record in records]
    except psycopg.errors.DataError:
         raise HTTPException(status_code=400, detail="Invalid offset or limit")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Dynamic Routes (Using Path Converters)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{user_id:uuid}", 
    response_model=UserRead,
    responses=RESP_ERRORS
)
async def read_user(
    user: UserInDB = Depends(get_user_from_db),
    current_user: UserInDB = Depends(get_current_active_user)
):
    return user


@router.patch(
    "/{user_id:uuid}", 
    response_model=UserRead,
    responses=RESP_ERRORS
)
async def update_user(
    user_id: UUID,
    user_update: UserUpdate,
    db: psycopg.AsyncConnection = Depends(get_db),
    user_in_db: UserInDB = Depends(get_user_from_db),
    current_user: UserInDB = Depends(get_current_active_user)
):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    update_data = user_update.model_dump(exclude_unset=True)
    update_data = {k: v for k, v in update_data.items() if v is not None}

    if not update_data:
        return user_in_db

    set_clauses = []
    values = []
    for field, value in update_data.items():
        if field == "password" and hasattr(value, 'get_secret_value'):
            value = await get_password_hash(value.get_secret_value())
        set_clauses.append(f"{field} = %s")
        values.append(value)
    
    values.append(user_id)
    query = f"UPDATE users SET {', '.join(set_clauses)} WHERE id = %s RETURNING *"
    
    try:
        result = await db.execute(query, tuple(values))
        updated_record = await result.fetchone()
        await db.commit()
        if not updated_record:
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return UserInDB(**updated_record)
    except UniqueViolation:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already taken")


@router.delete(
    "/{user_id:uuid}", 
    status_code=status.HTTP_204_NO_CONTENT,
    responses=RESP_ERRORS
)
async def delete_user(
    user_id: UUID, 
    db: psycopg.AsyncConnection = Depends(get_db),
    current_user: UserInDB = Depends(get_current_active_user)
):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    result = await db.execute("DELETE FROM users WHERE id = %s", (user_id,))
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return None
