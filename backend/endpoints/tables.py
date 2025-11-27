# tables.py
from uuid import UUID
import uuid
import json
from typing import List, Annotated, Dict, Any, Optional, Literal
from datetime import datetime, timezone
import psycopg
from psycopg import sql
from psycopg.errors import UniqueViolation, UndefinedColumn, DuplicateColumn
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel

from models.table import TableCreate, TableRead, TableUpdate, TableInDB
from db import get_db
from security import get_current_active_user, get_optional_current_user
from models.user import UserInDB
from utils.validation import validate_search_term, SEARCH_TERM_REGEX

router = APIRouter(prefix="/tables", tags=["tables"])

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

# ─────────────────────────────────────────────────────────────────────────────
# Additional Models for Columns and Rows
# ─────────────────────────────────────────────────────────────────────────────

class ColumnDefinition(BaseModel):
    """Model for adding a new column to a table."""
    name: str
    type: str  # e.g., "VARCHAR(255)", "INTEGER", "BOOLEAN", "JSONB"
    nullable: bool = True
    default: Optional[str] = None

class ColumnUpdate(BaseModel):
    """Model for updating column properties."""
    new_name: Optional[str] = None
    type: Optional[str] = None
    nullable: Optional[bool] = None
    default: Optional[str] = None

class TableDataResponse(BaseModel):
    """Response model for table data with metadata."""
    data: List[Dict[str, Any]]
    total: int
    page: int
    page_size: int

# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────

def strip_name(name: str) -> str:
    """Strip leading and trailing whitespace from a name."""
    return name.strip() if name else name


def strip_dict_keys(data: Dict[str, Any]) -> Dict[str, Any]:
    """Strip leading and trailing whitespace from all dictionary keys."""
    return {strip_name(k): v for k, v in data.items()}


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

async def get_table_from_db(
    table_id: UUID, 
    db: psycopg.AsyncConnection = Depends(get_db)
) -> TableInDB:
    result = await db.execute("SELECT * FROM tables WHERE id = %s", (table_id,))
    record = await result.fetchone()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    return TableInDB(**record)

async def require_table_owner(
    table: TableInDB = Depends(get_table_from_db),
    current_user: UserInDB = Depends(get_current_active_user)
) -> tuple[TableInDB, UserInDB]:
    """Ensure current user owns the table or is admin."""
    if table.owner_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only modify tables you own"
        )
    return table, current_user

# ─────────────────────────────────────────────────────────────────────────────
# TABLE COUNT ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/count",
    response_model=int,
    dependencies=[Depends(strict_query_params({"search"}))],
    responses=RESP_ERRORS,
    summary="Get Table Count"
)
async def get_table_count(
    search: Annotated[str | None, Query(max_length=100, pattern=SEARCH_TERM_REGEX, description="Search term for filtering by name or description")] = None,
    db: psycopg.AsyncConnection = Depends(get_db),
    current_user: UserInDB | None = Depends(get_optional_current_user)
) -> int:
    """Get total number of tables accessible to the user, optionally filtered by search term."""
    # Validate search term for safe characters
    search = validate_search_term(search)
    search_pattern = f"%{search}%" if search else None
    
    if current_user is None:
        if search:
            result = await db.execute(
                "SELECT COUNT(*) FROM tables WHERE public = TRUE AND (name ILIKE %s OR description ILIKE %s)",
                (search_pattern, search_pattern)
            )
        else:
            result = await db.execute("SELECT COUNT(*) FROM tables WHERE public = TRUE")
    else:
        if search:
            result = await db.execute(
                "SELECT COUNT(*) FROM tables WHERE (public = TRUE OR owner_id = %s) AND (name ILIKE %s OR description ILIKE %s)",
                (current_user.id, search_pattern, search_pattern)
            )
        else:
            result = await db.execute(
                "SELECT COUNT(*) FROM tables WHERE public = TRUE OR owner_id = %s",
                (current_user.id,)
            )
    row = await result.fetchone()
    return row['count'] if row else 0


# ─────────────────────────────────────────────────────────────────────────────
# TABLE CRUD ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/", 
    response_model=TableRead, 
    status_code=status.HTTP_201_CREATED,
    responses=RESP_ERRORS,
    summary="Create Table"
)
async def create_table(
    table: TableCreate, 
    db: psycopg.AsyncConnection = Depends(get_db),
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Create a new table. Requires authentication."""
    table_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    
    # Use model_dump to get JSON-compatible dict (converts non-JSON types like tuples to lists)
    table_data = table.model_dump(mode='json')
    
    # Strip whitespace from table name
    table_data['name'] = strip_name(table_data['name'])
    
    # Strip whitespace from schema column names
    table_data['schema'] = strip_dict_keys(table_data['schema'])

    try:
        # First, create the actual PostgreSQL table for storing user data
        # Build column definitions from the schema
        schema = table_data['schema']
        column_defs = []
        for col_name, col_def in schema.items():
            col_type = col_def.get('type', 'TEXT').upper()
            # Map common type names to PostgreSQL types
            type_mapping = {
                'TEXT': 'TEXT',
                'STRING': 'VARCHAR(255)',
                'VARCHAR': 'VARCHAR(255)',
                'INTEGER': 'INTEGER',
                'INT': 'INTEGER',
                'BIGINT': 'BIGINT',
                'DECIMAL': 'DECIMAL(10,2)',
                'FLOAT': 'DOUBLE PRECISION',
                'BOOLEAN': 'BOOLEAN',
                'BOOL': 'BOOLEAN',
                'DATE': 'DATE',
                'TIMESTAMP': 'TIMESTAMP WITH TIME ZONE',
                'DATETIME': 'TIMESTAMP WITH TIME ZONE',
                'JSON': 'JSONB',
                'JSONB': 'JSONB',
                'UUID': 'UUID',
            }
            pg_type = type_mapping.get(col_type, col_type)
            nullable = col_def.get('nullable', True)
            null_constraint = '' if nullable else ' NOT NULL'
            column_defs.append(f'"{col_name}" {pg_type}{null_constraint}')
        
        # Create the user's data table
        columns_sql = ', '.join(column_defs) if column_defs else 'id SERIAL PRIMARY KEY'
        create_table_sql = f'CREATE TABLE IF NOT EXISTS "{table_data["name"]}" ({columns_sql})'
        await db.execute(create_table_sql)
        
        # Then insert metadata into the tables registry
        # psycopg3 handles JSON automatically with Json adapter
        await db.execute(
            """
            INSERT INTO tables (id, name, schema, public, owner_id, description, metadata, row_count, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                table_id,
                table_data['name'],
                psycopg.types.json.Json(table_data['schema']),
                table_data['public'],
                current_user.id,
                table_data.get('description'),
                psycopg.types.json.Json(table_data.get('metadata', {})),
                0,
                now,
                now
            )
        )
        await db.commit()
        
        result = await db.execute("SELECT * FROM tables WHERE id = %s", (table_id,))
        created_record = await result.fetchone()
        return TableInDB(**created_record)

    except UniqueViolation:
        await db.rollback()
        # Idempotency: If exact table exists, return it
        result = await db.execute("SELECT * FROM tables WHERE name = %s", (table.name,))
        existing = await result.fetchone()
        if existing:
            return TableInDB(**existing)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Table name already exists")
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get(
    "/", 
    response_model=List[TableRead],
    dependencies=[Depends(strict_query_params({"skip", "limit", "search", "sort_by", "sort_order"}))],
    responses=RESP_ERRORS,
    summary="List Tables"
)
async def read_tables(
    skip: Annotated[int, Query(ge=0, le=2147483647)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    search: Annotated[str | None, Query(max_length=100, pattern=SEARCH_TERM_REGEX, description="Search term for filtering by name or description")] = None,
    sort_by: Annotated[Literal["created_at", "updated_at", "name"], Query(description="Field to sort by")] = "created_at",
    sort_order: Annotated[Literal["asc", "desc"], Query(description="Sort order (ascending or descending)")] = "desc",
    db: psycopg.AsyncConnection = Depends(get_db),
    current_user: UserInDB | None = Depends(get_optional_current_user)
):
    """
    List tables with optional search and sorting.
    
    - **search**: Filter by name or description (case-insensitive, printable ASCII only)
    - **sort_by**: Field to sort by (created_at, updated_at, name)
    - **sort_order**: Sort direction (asc or desc, default: desc)
    
    Returns:
    - For unauthenticated users: Only public tables
    - For authenticated users: Public tables + tables owned by the user
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
        
        search_pattern = f"%{search}%" if search else None
        
        if current_user is None:
            # Unauthenticated - only return public tables
            if search:
                query = sql.SQL("""
                    SELECT * FROM tables 
                    WHERE public = TRUE AND (name ILIKE %s OR description ILIKE %s)
                    {} 
                    LIMIT %s OFFSET %s
                """).format(order_by)
                result = await db.execute(query, (search_pattern, search_pattern, limit, skip))
            else:
                query = sql.SQL("""
                    SELECT * FROM tables 
                    WHERE public = TRUE 
                    {} 
                    LIMIT %s OFFSET %s
                """).format(order_by)
                result = await db.execute(query, (limit, skip))
        else:
            # Authenticated - return public tables OR tables owned by current user
            if search:
                query = sql.SQL("""
                    SELECT * FROM tables 
                    WHERE (public = TRUE OR owner_id = %s) AND (name ILIKE %s OR description ILIKE %s)
                    {} 
                    LIMIT %s OFFSET %s
                """).format(order_by)
                result = await db.execute(query, (current_user.id, search_pattern, search_pattern, limit, skip))
            else:
                query = sql.SQL("""
                    SELECT * FROM tables 
                    WHERE public = TRUE OR owner_id = %s 
                    {} 
                    LIMIT %s OFFSET %s
                """).format(order_by)
                result = await db.execute(query, (current_user.id, limit, skip))
        
        records = await result.fetchall()
        return [TableInDB(**record) for record in records]
    except psycopg.errors.DataError:
        raise HTTPException(status_code=400, detail="Invalid offset or limit")


@router.get(
    "/{table_id:uuid}", 
    response_model=TableRead,
    responses=RESP_ERRORS,
    summary="Get Table"
)
async def read_table(
    table: TableInDB = Depends(get_table_from_db),
    current_user: UserInDB | None = Depends(get_optional_current_user)
):
    """
    Get a specific table by ID.
    - Public tables: Accessible to anyone (with or without authentication)
    - Private tables: Must be authenticated and be the owner
    """
    # If table is public, anyone can access
    if table.public:
        return table
    
    # If table is private, require authentication
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Authentication required to access private tables"
        )
    
    # Check if user is the owner
    if table.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="You do not have access to this table"
        )
    
    return table


@router.patch(
    "/{table_id:uuid}", 
    response_model=TableRead,
    responses=RESP_ERRORS,
    summary="Update Table"
)
async def update_table(
    table_id: UUID,
    table_update: TableUpdate,
    db: psycopg.AsyncConnection = Depends(get_db),
    owner_check: tuple[TableInDB, UserInDB] = Depends(require_table_owner)
):
    """Update a table. Only the owner or admin can update."""
    table_in_db, _ = owner_check
    
    update_data = table_update.model_dump(exclude_unset=True)
    update_data = {k: v for k, v in update_data.items() if v is not None}

    # Strip whitespace from table name if being updated
    if 'name' in update_data:
        update_data['name'] = strip_name(update_data['name'])

    if not update_data:
        return table_in_db

    # If name is being updated, rename the actual PostgreSQL table
    if 'name' in update_data and update_data['name'] != table_in_db.name:
        old_name = table_in_db.name
        new_name = update_data['name']
        try:
            await db.execute(f'ALTER TABLE "{old_name}" RENAME TO "{new_name}"')
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to rename table: {str(e)}"
            )

    # Add updated_at timestamp
    update_data['updated_at'] = datetime.now(timezone.utc)

    set_clauses = []
    values = []
    for field, value in update_data.items():
        set_clauses.append(f"{field} = %s")
        values.append(value)
    
    values.append(table_id)
    query = f"UPDATE tables SET {', '.join(set_clauses)} WHERE id = %s RETURNING *"
    
    try:
        result = await db.execute(query, tuple(values))
        updated_record = await result.fetchone()
        await db.commit()
        if not updated_record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
        return TableInDB(**updated_record)
    except UniqueViolation:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Table name already exists")


@router.delete(
    "/{table_id:uuid}", 
    status_code=status.HTTP_204_NO_CONTENT,
    responses=RESP_ERRORS,
    summary="Delete Table"
)
async def delete_table(
    table_id: UUID, 
    db: psycopg.AsyncConnection = Depends(get_db),
    owner_check: tuple[TableInDB, UserInDB] = Depends(require_table_owner)
) -> Response:
    """Delete a table. Only the owner or admin can delete."""
    table_in_db, _ = owner_check
    
    # Drop the actual PostgreSQL table
    await db.execute(f'DROP TABLE IF EXISTS "{table_in_db.name}"')
    
    # Delete from tables registry
    result = await db.execute("DELETE FROM tables WHERE id = %s", (table_id,))
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────────────────────────────────
# COLUMN MANAGEMENT ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{table_id:uuid}/columns",
    responses=RESP_ERRORS,
    summary="Add Column to Table"
)
async def add_column(
    table_id: UUID,
    column: ColumnDefinition,
    db: psycopg.AsyncConnection = Depends(get_db),
    owner_check: tuple[TableInDB, UserInDB] = Depends(require_table_owner)
):
    """Add a new column to an existing table. Only owner or admin can add columns."""
    table_in_db, _ = owner_check
    
    # Strip whitespace from column name
    column_name = strip_name(column.name)
    
    # Build ALTER TABLE statement - quote identifiers to handle special names
    null_constraint = "NULL" if column.nullable else "NOT NULL"
    default_clause = f"DEFAULT {column.default}" if column.default else ""
    
    alter_sql = f"""
        ALTER TABLE "{table_in_db.name}" 
        ADD COLUMN "{column_name}" {column.type} {null_constraint} {default_clause}
    """
    
    try:
        await db.execute(alter_sql)
        
        # Update table schema metadata - use key-value format matching initial schema structure
        schema = dict(table_in_db.schema)
        # Remove the old "columns" array format if it exists (cleanup)
        if "columns" in schema and isinstance(schema["columns"], list):
            del schema["columns"]
        
        # Add column in the same format as initial schema: { "col_name": { "type": ..., "nullable": ... } }
        schema[column_name] = {
            "type": column.type,
            "nullable": column.nullable,
        }
        if column.default:
            schema[column_name]["default"] = column.default
        
        await db.execute(
            "UPDATE tables SET schema = %s, updated_at = %s WHERE id = %s",
            (psycopg.types.json.Json(schema), datetime.now(timezone.utc), table_id)
        )
        await db.commit()
        
        return {"status": "column_added", "column": column_name}
    except DuplicateColumn:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Column '{column_name}' already exists")
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.patch(
    "/{table_id:uuid}/columns/{column_name}",
    responses=RESP_ERRORS,
    summary="Update Column"
)
async def update_column(
    table_id: UUID,
    column_name: str,
    column_update: ColumnUpdate,
    db: psycopg.AsyncConnection = Depends(get_db),
    owner_check: tuple[TableInDB, UserInDB] = Depends(require_table_owner)
):
    """Update column properties. Only owner or admin can update columns."""
    table_in_db, _ = owner_check
    
    updates = column_update.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "no_changes"}
    
    # Strip whitespace from column names
    column_name = strip_name(column_name)
    if "new_name" in updates and updates["new_name"]:
        updates["new_name"] = strip_name(updates["new_name"])
    
    original_column_name = column_name
    schema = dict(table_in_db.schema)
    
    try:
        # Rename column if new_name provided
        if "new_name" in updates and updates["new_name"]:
            await db.execute(
                f'ALTER TABLE "{table_in_db.name}" RENAME COLUMN "{column_name}" TO "{updates["new_name"]}"'
            )
            # Update schema - move the column definition to the new key
            if column_name in schema:
                schema[updates["new_name"]] = schema.pop(column_name)
            column_name = updates["new_name"]
        
        # Change type if provided
        if "type" in updates and updates["type"]:
            await db.execute(
                f'ALTER TABLE "{table_in_db.name}" ALTER COLUMN "{column_name}" TYPE {updates["type"]}'
            )
            if column_name in schema:
                schema[column_name]["type"] = updates["type"]
        
        # Change nullable constraint
        if "nullable" in updates:
            if updates["nullable"]:
                await db.execute(f'ALTER TABLE "{table_in_db.name}" ALTER COLUMN "{column_name}" DROP NOT NULL')
            else:
                await db.execute(f'ALTER TABLE "{table_in_db.name}" ALTER COLUMN "{column_name}" SET NOT NULL')
            if column_name in schema:
                schema[column_name]["nullable"] = updates["nullable"]
        
        # Set default
        if "default" in updates:
            if updates["default"]:
                await db.execute(
                    f'ALTER TABLE "{table_in_db.name}" ALTER COLUMN "{column_name}" SET DEFAULT {updates["default"]}'
                )
                if column_name in schema:
                    schema[column_name]["default"] = updates["default"]
            else:
                await db.execute(f'ALTER TABLE "{table_in_db.name}" ALTER COLUMN "{column_name}" DROP DEFAULT')
                if column_name in schema and "default" in schema[column_name]:
                    del schema[column_name]["default"]
        
        await db.execute(
            "UPDATE tables SET schema = %s, updated_at = %s WHERE id = %s",
            (psycopg.types.json.Json(schema), datetime.now(timezone.utc), table_id)
        )
        await db.commit()
        
        return {"status": "column_updated", "column": column_name}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete(
    "/{table_id:uuid}/columns/{column_name}",
    responses=RESP_ERRORS,
    summary="Delete Column"
)
async def delete_column(
    table_id: UUID,
    column_name: str,
    db: psycopg.AsyncConnection = Depends(get_db),
    owner_check: tuple[TableInDB, UserInDB] = Depends(require_table_owner)
):
    """Delete a column from a table. Only owner or admin can delete columns."""
    table_in_db, _ = owner_check
    
    # Strip whitespace from column name
    column_name = strip_name(column_name)
    
    try:
        await db.execute(f'ALTER TABLE "{table_in_db.name}" DROP COLUMN "{column_name}"')
        
        # Update schema metadata - remove the column from schema
        schema = dict(table_in_db.schema)
        if column_name in schema:
            del schema[column_name]
        # Also remove from legacy "columns" array if exists
        if "columns" in schema and isinstance(schema["columns"], list):
            schema["columns"] = [c for c in schema["columns"] if c.get("name") != column_name]
            if not schema["columns"]:
                del schema["columns"]
        
        await db.execute(
            "UPDATE tables SET schema = %s, updated_at = %s WHERE id = %s",
            (psycopg.types.json.Json(schema), datetime.now(timezone.utc), table_id)
        )
        await db.commit()
        
        return {"status": "column_deleted", "column": column_name}
    except UndefinedColumn:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Column '{column_name}' not found")
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# TABLE DATA (ROW) MANAGEMENT ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{table_id:uuid}/data",
    response_model=TableDataResponse,
    dependencies=[Depends(strict_query_params({"page", "page_size", "search", "sort_by", "sort_order"}))],
    responses=RESP_ERRORS,
    summary="Get Table Data"
)
async def get_table_data(
    table_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=1000)] = 100,
    search: Annotated[str | None, Query(max_length=100, pattern=SEARCH_TERM_REGEX, description="Search term for filtering across all text columns")] = None,
    sort_by: Annotated[str | None, Query(max_length=100, description="Column name to sort by")] = None,
    sort_order: Annotated[Literal["asc", "desc"], Query(description="Sort order (ascending or descending)")] = "desc",
    db: psycopg.AsyncConnection = Depends(get_db),
    table: TableInDB = Depends(get_table_from_db),
    current_user: UserInDB | None = Depends(get_optional_current_user)
):
    """
    Get paginated data from a table with optional search and sorting.
    
    - **search**: Filter rows by searching across all text/varchar columns (case-insensitive)
    - **sort_by**: Column name to sort by (must be a valid column in the table)
    - **sort_order**: Sort direction (asc or desc, default: desc)
    
    Access:
    - Public tables: Accessible to anyone
    - Private tables: Owner only
    """
    # Check access
    if not table.public:
        if current_user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        if table.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    offset = (page - 1) * page_size
    
    # Validate search term for safe characters
    search = validate_search_term(search)
    search_pattern = f"%{search}%" if search else None
    
    # Get text columns from schema for search
    schema = table.schema or {}
    text_columns = []
    valid_columns = []
    for col_name, col_def in schema.items():
        valid_columns.append(col_name)
        if isinstance(col_def, dict):
            col_type = col_def.get('type', '').upper()
        else:
            col_type = str(col_def).upper()
        # Include text-like columns for search
        if any(t in col_type for t in ['TEXT', 'VARCHAR', 'CHAR', 'STRING']):
            text_columns.append(col_name)
    
    # Validate sort_by column
    if sort_by:
        sort_by = strip_name(sort_by)
        if sort_by not in valid_columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid sort_by column: '{sort_by}'. Valid columns: {', '.join(valid_columns)}"
            )
    
    try:
        # Build WHERE clause for search
        where_clause = ""
        where_params = []
        if search and text_columns:
            search_conditions = [f'"{col}"::text ILIKE %s' for col in text_columns]
            where_clause = "WHERE " + " OR ".join(search_conditions)
            where_params = [search_pattern] * len(text_columns)
        
        # Build ORDER BY clause
        order_clause = ""
        if sort_by:
            order_direction = "DESC" if sort_order == "desc" else "ASC"
            order_clause = f'ORDER BY "{sort_by}" {order_direction}'
        
        # Get total count (with search filter)
        count_sql = f'SELECT COUNT(*) FROM "{table.name}" {where_clause}'
        count_result = await db.execute(count_sql, tuple(where_params) if where_params else None)
        count_row = await count_result.fetchone()
        total = count_row['count'] if count_row else 0
        
        # Get paginated data (with search and sort)
        data_sql = f'SELECT * FROM "{table.name}" {where_clause} {order_clause} LIMIT %s OFFSET %s'
        data_params = tuple(where_params + [page_size, offset]) if where_params else (page_size, offset)
        result = await db.execute(data_sql, data_params)
        rows = await result.fetchall()
        
        data = [dict(row) for row in rows]
        
        return TableDataResponse(
            data=data,
            total=total,
            page=page,
            page_size=page_size
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/{table_id:uuid}/data",
    responses=RESP_ERRORS,
    summary="Insert Row"
)
async def insert_row(
    table_id: UUID,
    row_data: Dict[str, Any],
    db: psycopg.AsyncConnection = Depends(get_db),
    table: TableInDB = Depends(get_table_from_db),
    current_user: UserInDB | None = Depends(get_optional_current_user)
):
    """
    Insert a new row into the table.
    - Public tables: Anyone can insert (with or without authentication) - useful for blog comments, likes, feedback
    - Private tables: Only owner or admin can insert
    """
    # Check access for private tables
    if not table.public:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required for private tables"
            )
        if table.owner_id != current_user.id and current_user.role != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only insert into tables you own"
            )
    
    if not row_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Row data cannot be empty")
    
    # Strip whitespace from row data keys (column names)
    row_data = strip_dict_keys(row_data)
    
    # Auto-generate UUID for id column if it's a UUID type and not provided
    schema = table.schema or {}
    if 'id' in schema:
        id_type = schema['id'].get('type', '').lower() if isinstance(schema['id'], dict) else str(schema['id']).lower()
        if 'uuid' in id_type and ('id' not in row_data or not row_data.get('id')):
            row_data['id'] = str(uuid.uuid4())
    
    try:
        columns = list(row_data.keys())
        values = list(row_data.values())
        placeholders = ", ".join(["%s"] * len(values))
        columns_str = ", ".join(columns)
        
        insert_sql = f'INSERT INTO "{table.name}" ({columns_str}) VALUES ({placeholders}) RETURNING *'
        result = await db.execute(insert_sql, tuple(values))
        inserted_row = await result.fetchone()
        
        # Update row count
        await db.execute(
            "UPDATE tables SET row_count = row_count + 1, updated_at = %s WHERE id = %s",
            (datetime.now(timezone.utc), table_id)
        )
        await db.commit()
        
        return {"status": "row_inserted", "data": dict(inserted_row)}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.patch(
    "/{table_id:uuid}/data/{row_id}",
    responses=RESP_ERRORS,
    summary="Update Row"
)
async def update_row(
    table_id: UUID,
    row_id: str,
    updates: Dict[str, Any],
    id_column: Annotated[str, Query()] = "id",
    db: psycopg.AsyncConnection = Depends(get_db),
    owner_check: tuple[TableInDB, UserInDB] = Depends(require_table_owner)
):
    """Update a row in the table. Only owner or admin can update."""
    table_in_db, _ = owner_check
    
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Update data cannot be empty")
    
    # Strip whitespace from update keys (column names)
    updates = strip_dict_keys(updates)
    
    try:
        set_clauses = []
        values = []
        for key, value in updates.items():
            set_clauses.append(f"{key} = %s")
            values.append(value)
        
        values.append(row_id)
        update_sql = f'UPDATE "{table_in_db.name}" SET {", ".join(set_clauses)} WHERE {id_column} = %s RETURNING *'
        
        result = await db.execute(update_sql, tuple(values))
        updated_row = await result.fetchone()
        if not updated_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Row not found")
        
        await db.execute(
            "UPDATE tables SET updated_at = %s WHERE id = %s",
            (datetime.now(timezone.utc), table_id)
        )
        await db.commit()
        
        return {"status": "row_updated", "data": dict(updated_row)}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete(
    "/{table_id:uuid}/data/{row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=RESP_ERRORS,
    summary="Delete Row"
)
async def delete_row(
    table_id: UUID,
    row_id: str,
    id_column: Annotated[str, Query()] = "id",
    db: psycopg.AsyncConnection = Depends(get_db),
    owner_check: tuple[TableInDB, UserInDB] = Depends(require_table_owner)
) -> Response:
    """Delete a row from the table. Only owner or admin can delete."""
    table_in_db, _ = owner_check
    
    try:
        delete_sql = f'DELETE FROM "{table_in_db.name}" WHERE {id_column} = %s'
        result = await db.execute(delete_sql, (row_id,))
        
        if result.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Row not found")
        
        # Update row count
        await db.execute(
            "UPDATE tables SET row_count = row_count - 1, updated_at = %s WHERE id = %s",
            (datetime.now(timezone.utc), table_id)
        )
        await db.commit()
        
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
