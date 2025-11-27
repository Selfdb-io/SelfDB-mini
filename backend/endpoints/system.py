# system.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
import psycopg

from db import get_db
from services.backup_service import get_system_initialized

router = APIRouter(prefix="/system", tags=["system"])

# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────

class SystemStatus(BaseModel):
    initialized: bool
    version: str

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
}

# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/status",
    response_model=SystemStatus,
    responses=RESP_ERRORS,
    summary="Get System Status",
    description="Returns system initialization status. Requires API key."
)
async def get_system_status(
    db: psycopg.AsyncConnection = Depends(get_db)
) -> SystemStatus:
    """
    Check if the system has been initialized.
    
    - **initialized**: False on fresh install, True after first login or restore
    - **version**: Current application version
    
    This is a public endpoint used by the frontend to determine
    whether to show the restore option on the login page.
    """
    initialized = await get_system_initialized(db)
    
    return SystemStatus(
        initialized=initialized,
        version="1.0.0"
    )
