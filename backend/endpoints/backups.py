# backups.py
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
import psycopg

from db import get_db
from models.user import UserInDB
from security import get_current_active_user
from services.backup_service import (
    BackupInfo,
    BackupResult,
    RestoreResult,
    create_backup,
    list_backups,
    get_backup_path,
    delete_backup,
    get_system_initialized,
    set_system_initialized,
)

router = APIRouter(prefix="/backups", tags=["backups"])

# ─────────────────────────────────────────────────────────────────────────────
# Response Models
# ─────────────────────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    detail: str

RESP_ERRORS = {
    400: {"model": ErrorResponse, "description": "Bad Request"},
    401: {"model": ErrorResponse, "description": "Unauthorized"},
    403: {"model": ErrorResponse, "description": "Forbidden"},
    404: {"model": ErrorResponse, "description": "Not Found"},
    405: {"model": ErrorResponse, "description": "Method Not Allowed"},
    406: {"model": ErrorResponse, "description": "Not Acceptable"},
}

# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────

def require_admin(current_user: UserInDB = Depends(get_current_active_user)):
    """Dependency to require admin role."""
    if current_user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

# ─────────────────────────────────────────────────────────────────────────────
# Collection Endpoints (no path parameters)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=List[BackupInfo],
    responses=RESP_ERRORS,
    summary="List Backups",
    description="List all available backups. Admin only."
)
async def list_all_backups(
    current_user: UserInDB = Depends(require_admin)
) -> List[BackupInfo]:
    """Get list of all backup files with metadata."""
    return await list_backups()

@router.post(
    "",
    response_model=BackupResult,
    responses=RESP_ERRORS,
    summary="Create Backup",
    description="Create a new backup of the database and configuration. Admin only."
)
async def create_new_backup(
    current_user: UserInDB = Depends(require_admin)
) -> BackupResult:
    """
    Create a new backup containing:
    - PostgreSQL database dump
    - .env configuration file
    
    The backup is saved as a tar.gz archive.
    """
    result = await create_backup()
    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.message
        )
    return result

# ─────────────────────────────────────────────────────────────────────────────
# Static Path Endpoints (MUST be defined BEFORE dynamic /{filename} routes)
# ─────────────────────────────────────────────────────────────────────────────

@router.api_route(
    "/restore",
    methods=["DELETE", "GET", "PUT", "PATCH"],
    include_in_schema=False
)
async def restore_method_not_allowed():
    """Explicitly return 405 for unsupported methods on /restore."""
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Method not allowed",
        headers={"Allow": "POST"}
    )

@router.post(
    "/restore",
    response_model=RestoreResult,
    responses=RESP_ERRORS,
    summary="Restore from Backup",
    description="Upload and restore from a backup file (gzip-compressed tar archive). Only works on fresh installs.",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["file"],
                        "properties": {
                            "file": {
                                "type": "string",
                                "format": "binary",
                                "description": "Backup file (gzip-compressed tar archive)"
                            }
                        }
                    }
                }
            }
        }
    }
)
async def restore_from_backup_file(
    file: UploadFile = File(..., description="Backup file (gzip-compressed tar archive)"),
    db: psycopg.AsyncConnection = Depends(get_db)
) -> RestoreResult:
    """
    Restore database from an uploaded backup file.
    
    **Security**: This endpoint only works when the system is NOT initialized
    (fresh install). Once a user has logged in, this endpoint becomes disabled.
    
    The backup file must be a valid gzip-compressed tar archive containing:
    - database.sql: PostgreSQL dump file
    - .env: Configuration file (optional)
    """
    # Check if system is already initialized
    initialized = await get_system_initialized(db)
    
    if initialized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System is already initialized. Restore is only available on fresh installs."
        )
    
    # Read file contents
    try:
        backup_data = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {str(e)}"
        )
    
    # Import restore function here to avoid circular imports
    from services.backup_service import restore_from_backup
    
    result = await restore_from_backup(backup_data)
    
    # Return result directly - success=false indicates restore failed
    # This allows proper error messages without HTTP error codes
    return result

# ─────────────────────────────────────────────────────────────────────────────
# Dynamic Path Endpoints (with {filename} parameter)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{filename}/download",
    responses={
        **RESP_ERRORS,
        200: {
            "content": {"application/gzip": {}},
            "description": "Backup file download"
        }
    },
    summary="Download Backup",
    description="Download a backup file. Admin only."
)
async def download_backup(
    filename: str,
    current_user: UserInDB = Depends(require_admin)
):
    """Download a specific backup file."""
    backup_path = await get_backup_path(filename)
    
    if not backup_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup file not found"
        )
    
    return FileResponse(
        path=str(backup_path),
        filename=filename,
        media_type="application/gzip"
    )

@router.delete(
    "/{filename}",
    response_model=dict,
    responses=RESP_ERRORS,
    summary="Delete Backup",
    description="Delete a backup file. Admin only."
)
async def delete_backup_file(
    filename: str,
    current_user: UserInDB = Depends(require_admin)
) -> dict:
    """Delete a specific backup file."""
    success = await delete_backup(filename)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup file not found"
        )
    
    return {"message": f"Backup {filename} deleted successfully"}

