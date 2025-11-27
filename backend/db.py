import json
import os
from typing import AsyncGenerator
from contextlib import asynccontextmanager
from pydantic_settings import BaseSettings, SettingsConfigDict
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncNullConnectionPool

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
class Settings(BaseSettings):
    # Connect to PgBouncer (port 6432) for connection pooling
    # NullConnectionPool delegates all pooling to PgBouncer - no double pooling!
    # In Docker: uses pgbouncer service name; Local dev: uses localhost
    DATABASE_URL: str  # Required - no fallback
    
    # Backup configuration
    BACKUP_RETENTION_DAYS: int = 7
    BACKUP_SCHEDULE_CRON: str = "0 2 * * *"
    
    # Direct database connection for pg_dump/pg_restore (bypasses pgbouncer)
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "dayone"
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()


# ─────────────────────────────────────────────────────────────────────────────
# Database Connection
# ─────────────────────────────────────────────────────────────────────────────

# Global pool variable - using NullConnectionPool for PgBouncer compatibility
# NullConnectionPool creates connections on-demand and closes them immediately after use
# This delegates all connection pooling to PgBouncer, avoiding double-pooling issues
pool: AsyncNullConnectionPool | None = None


async def init_db() -> None:
    """Initialize the database connection pool.
    
    Using AsyncNullConnectionPool with PgBouncer:
    - No internal pooling - PgBouncer handles all connection management
    - Compatible with PgBouncer's transaction pooling mode
    - max_size limits concurrent connections to prevent overwhelming PgBouncer
    - No prepared statement issues (psycopg3 doesn't use server-side prepared statements by default)
    """
    global pool
    pool = AsyncNullConnectionPool(
        conninfo=settings.DATABASE_URL,
        open=False,  # Don't open on creation, we'll open explicitly
        max_size=100,  # Limit concurrent connections
        # Configure connection defaults
        kwargs={
            "row_factory": dict_row,  # Return rows as dicts for easier access
            "autocommit": False,
        }
    )
    await pool.open()
    
    # Create tables if they don't exist
    async with pool.connection() as conn:
        # Create system_config table for tracking initialization state
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS system_config (
                id INTEGER PRIMARY KEY DEFAULT 1,
                initialized BOOLEAN NOT NULL DEFAULT FALSE,
                installed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                version VARCHAR(50) DEFAULT '1.0.0',
                CONSTRAINT single_row CHECK (id = 1)
            );
        """)
        
        # Insert default system_config if not exists
        await conn.execute("""
            INSERT INTO system_config (id, initialized, version)
            VALUES (1, FALSE, '1.0.0')
            ON CONFLICT (id) DO NOTHING;
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'USER',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Create tables table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS tables (
                id UUID PRIMARY KEY,
                name VARCHAR(63) UNIQUE NOT NULL,
                schema JSONB NOT NULL,
                public BOOLEAN NOT NULL DEFAULT FALSE,
                owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                description VARCHAR(500),
                metadata JSONB DEFAULT '{}'::jsonb,
                row_count INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Create index on owner_id for faster queries
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tables_owner_id ON tables(owner_id);
        """)
        
        await conn.commit()
        
        # Seed admin user
        from security import get_password_hash
        from uuid import uuid4
        
        admin_email = "admin@example.com"
        result = await conn.execute(
            "SELECT * FROM users WHERE email = %s", 
            (admin_email,)
        )
        existing_admin = await result.fetchone()
        
        if not existing_admin:
            hashed_password = await get_password_hash("password")
            await conn.execute("""
                INSERT INTO users (id, email, password, first_name, last_name, role, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (uuid4(), admin_email, hashed_password, "Admin", "User", "ADMIN", True))
            await conn.commit()


async def close_db() -> None:
    """Close the database connection pool."""
    global pool
    if pool:
        await pool.close()


async def get_db() -> AsyncGenerator[psycopg.AsyncConnection, None]:
    """Dependency to get a database connection from the pool."""
    if pool is None:
        raise RuntimeError("Database pool is not initialized")
    
    async with pool.connection() as conn:
        yield conn
