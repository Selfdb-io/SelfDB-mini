# backup_service.py
import os
import shutil
import tarfile
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from db import settings

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

BACKUP_DIR = Path("/backups")
ENV_BACKUP_PATH = Path("/app/.env.backup")
TEMP_DIR = Path("/tmp/backup_temp")

# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────

class BackupInfo(BaseModel):
    filename: str
    size: int  # in bytes
    created_at: datetime

class BackupResult(BaseModel):
    success: bool
    filename: Optional[str] = None
    message: str

class RestoreResult(BaseModel):
    success: bool
    message: str

# ─────────────────────────────────────────────────────────────────────────────
# Scheduler
# ─────────────────────────────────────────────────────────────────────────────

scheduler: Optional[AsyncIOScheduler] = None

def parse_cron(cron_str: str) -> dict:
    """Parse cron string into APScheduler trigger kwargs."""
    parts = cron_str.split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron string: {cron_str}")
    
    minute, hour, day, month, day_of_week = parts
    return {
        "minute": minute,
        "hour": hour,
        "day": day,
        "month": month,
        "day_of_week": day_of_week
    }

async def scheduled_backup_job():
    """Job to run scheduled backups."""
    print(f"[{datetime.now()}] Running scheduled backup...")
    try:
        result = await create_backup()
        if result.success:
            print(f"[{datetime.now()}] Scheduled backup completed: {result.filename}")
            # Cleanup old backups
            await cleanup_old_backups()
        else:
            print(f"[{datetime.now()}] Scheduled backup failed: {result.message}")
    except Exception as e:
        print(f"[{datetime.now()}] Scheduled backup error: {e}")

async def start_scheduler():
    """Start the backup scheduler."""
    global scheduler
    
    if scheduler is not None:
        return
    
    scheduler = AsyncIOScheduler()
    
    try:
        cron_kwargs = parse_cron(settings.BACKUP_SCHEDULE_CRON)
        trigger = CronTrigger(**cron_kwargs)
        
        scheduler.add_job(
            scheduled_backup_job,
            trigger=trigger,
            id="scheduled_backup",
            name="Scheduled Database Backup",
            replace_existing=True
        )
        
        scheduler.start()
        print(f"Backup scheduler started with cron: {settings.BACKUP_SCHEDULE_CRON}")
    except Exception as e:
        print(f"Failed to start backup scheduler: {e}")

async def stop_scheduler():
    """Stop the backup scheduler."""
    global scheduler
    if scheduler:
        scheduler.shutdown()
        scheduler = None

# ─────────────────────────────────────────────────────────────────────────────
# Backup Operations
# ─────────────────────────────────────────────────────────────────────────────

async def create_backup() -> BackupResult:
    """
    Create a backup of the database and .env file.
    Returns a tar.gz archive containing:
    - database.sql: PostgreSQL dump
    - .env: Configuration file (if available)
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"dayone_backup_{timestamp}.tar.gz"
    backup_path = BACKUP_DIR / backup_filename
    
    # Ensure directories exist
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    
    temp_backup_dir = TEMP_DIR / f"backup_{timestamp}"
    temp_backup_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # 1. Create database dump using pg_dump
        sql_file = temp_backup_dir / "database.sql"
        
        env = os.environ.copy()
        env["PGPASSWORD"] = settings.POSTGRES_PASSWORD
        
        pg_dump_cmd = [
            "pg_dump",
            "-h", settings.POSTGRES_HOST,
            "-p", str(settings.POSTGRES_PORT),
            "-U", settings.POSTGRES_USER,
            "-d", settings.POSTGRES_DB,
            "-f", str(sql_file),
            "--clean",  # Include DROP statements
            "--if-exists",  # Add IF EXISTS to DROP statements
            "--no-owner",  # Don't output owner info
            "--no-privileges",  # Don't output privilege info
        ]
        
        process = await asyncio.create_subprocess_exec(
            *pg_dump_cmd,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            return BackupResult(
                success=False,
                message=f"pg_dump failed: {error_msg}"
            )
        
        # 2. Copy .env file if available
        if ENV_BACKUP_PATH.exists():
            shutil.copy(ENV_BACKUP_PATH, temp_backup_dir / ".env")
        
        # 3. Create tar.gz archive
        with tarfile.open(backup_path, "w:gz") as tar:
            for file in temp_backup_dir.iterdir():
                tar.add(file, arcname=file.name)
        
        # 4. Get file size
        file_size = backup_path.stat().st_size
        
        return BackupResult(
            success=True,
            filename=backup_filename,
            message=f"Backup created successfully ({file_size / 1024 / 1024:.2f} MB)"
        )
        
    except Exception as e:
        return BackupResult(
            success=False,
            message=f"Backup failed: {str(e)}"
        )
    finally:
        # Cleanup temp directory
        if temp_backup_dir.exists():
            shutil.rmtree(temp_backup_dir)

async def list_backups() -> List[BackupInfo]:
    """List all available backups."""
    backups = []
    
    if not BACKUP_DIR.exists():
        return backups
    
    for file in BACKUP_DIR.glob("dayone_backup_*.tar.gz"):
        try:
            stat = file.stat()
            # Parse timestamp from filename
            # Format: dayone_backup_YYYYMMDD_HHMMSS.tar.gz
            # file.stem gives "dayone_backup_YYYYMMDD_HHMMSS.tar" (removes .gz only)
            # We need to remove both .tar.gz, so use name and strip the suffix
            filename_without_ext = file.name.replace(".tar.gz", "")
            timestamp_str = filename_without_ext.replace("dayone_backup_", "")
            created_at = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
            
            backups.append(BackupInfo(
                filename=file.name,
                size=stat.st_size,
                created_at=created_at
            ))
        except (ValueError, OSError) as e:
            print(f"Error processing backup file {file}: {e}")
            continue
    
    # Sort by creation time, newest first
    backups.sort(key=lambda x: x.created_at, reverse=True)
    return backups

async def get_backup_path(filename: str) -> Optional[Path]:
    """Get the full path to a backup file if it exists."""
    # Validate filename format to prevent path traversal
    if not filename.startswith("dayone_backup_") or not filename.endswith(".tar.gz"):
        return None
    
    if "/" in filename or "\\" in filename or ".." in filename:
        return None
    
    backup_path = BACKUP_DIR / filename
    if backup_path.exists() and backup_path.is_file():
        return backup_path
    
    return None

async def delete_backup(filename: str) -> bool:
    """Delete a backup file."""
    backup_path = await get_backup_path(filename)
    if backup_path:
        backup_path.unlink()
        return True
    return False

async def cleanup_old_backups():
    """Delete backups older than retention period."""
    retention_days = settings.BACKUP_RETENTION_DAYS
    cutoff_date = datetime.now() - timedelta(days=retention_days)
    
    backups = await list_backups()
    deleted_count = 0
    
    for backup in backups:
        if backup.created_at < cutoff_date:
            if await delete_backup(backup.filename):
                deleted_count += 1
                print(f"Deleted old backup: {backup.filename}")
    
    return deleted_count

# ─────────────────────────────────────────────────────────────────────────────
# Restore Operations
# ─────────────────────────────────────────────────────────────────────────────

async def restore_from_backup(backup_data: bytes) -> RestoreResult:
    """
    Restore database from uploaded backup archive.
    This only works when system is not initialized (fresh install).
    """
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_restore_dir = TEMP_DIR / f"restore_{timestamp}"
    temp_archive = TEMP_DIR / f"restore_{timestamp}.tar.gz"
    
    try:
        # 1. Save uploaded data to temp file
        with open(temp_archive, "wb") as f:
            f.write(backup_data)
        
        # 2. Extract archive
        temp_restore_dir.mkdir(parents=True, exist_ok=True)
        
        with tarfile.open(temp_archive, "r:gz") as tar:
            # Security: check for path traversal
            for member in tar.getmembers():
                if member.name.startswith("/") or ".." in member.name:
                    return RestoreResult(
                        success=False,
                        message="Invalid backup archive: contains unsafe paths"
                    )
            tar.extractall(temp_restore_dir)
        
        # 3. Validate contents
        sql_file = temp_restore_dir / "database.sql"
        if not sql_file.exists():
            return RestoreResult(
                success=False,
                message="Invalid backup archive: missing database.sql"
            )
        
        # 4. Restore database using psql
        env = os.environ.copy()
        env["PGPASSWORD"] = settings.POSTGRES_PASSWORD
        
        # First, terminate all other connections to allow schema drop
        terminate_cmd = [
            "psql",
            "-h", settings.POSTGRES_HOST,
            "-p", str(settings.POSTGRES_PORT),
            "-U", settings.POSTGRES_USER,
            "-d", "postgres",  # Connect to postgres db to terminate connections
            "-c", f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{settings.POSTGRES_DB}' AND pid <> pg_backend_pid();"
        ]
        
        try:
            process = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    *terminate_cmd,
                    env=env,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                ),
                timeout=10.0
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=10.0)
        except asyncio.TimeoutError:
            pass  # Continue even if terminate times out
        
        # Now drop and recreate schema
        drop_cmd = [
            "psql",
            "-h", settings.POSTGRES_HOST,
            "-p", str(settings.POSTGRES_PORT),
            "-U", settings.POSTGRES_USER,
            "-d", settings.POSTGRES_DB,
            "-c", "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
        ]
        
        try:
            process = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    *drop_cmd,
                    env=env,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                ),
                timeout=30.0
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30.0)
        except asyncio.TimeoutError:
            return RestoreResult(
                success=False,
                message="Database drop schema timed out. There may be active connections blocking the operation."
            )
        
        # Then restore from SQL file
        restore_cmd = [
            "psql",
            "-h", settings.POSTGRES_HOST,
            "-p", str(settings.POSTGRES_PORT),
            "-U", settings.POSTGRES_USER,
            "-d", settings.POSTGRES_DB,
            "-f", str(sql_file)
        ]
        
        try:
            process = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    *restore_cmd,
                    env=env,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                ),
                timeout=120.0  # 2 minutes for large databases
            )
            
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=120.0)
        except asyncio.TimeoutError:
            return RestoreResult(
                success=False,
                message="Database restore timed out. The backup file may be too large."
            )
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            return RestoreResult(
                success=False,
                message=f"Database restore failed: {error_msg}"
            )
        
        return RestoreResult(
            success=True,
            message="Backup restored successfully. Please login with your restored credentials."
        )
        
    except tarfile.TarError as e:
        return RestoreResult(
            success=False,
            message=f"Failed to extract backup archive: {str(e)}"
        )
    except Exception as e:
        return RestoreResult(
            success=False,
            message=f"Restore failed: {str(e)}"
        )
    finally:
        # Cleanup temp files
        if temp_archive.exists():
            temp_archive.unlink()
        if temp_restore_dir.exists():
            shutil.rmtree(temp_restore_dir)

# ─────────────────────────────────────────────────────────────────────────────
# System Status
# ─────────────────────────────────────────────────────────────────────────────

async def get_system_initialized(conn) -> bool:
    """Check if system has been initialized."""
    try:
        result = await conn.execute(
            "SELECT initialized FROM system_config WHERE id = 1"
        )
        row = await result.fetchone()
        return row["initialized"] if row else False
    except Exception:
        return False

async def set_system_initialized(conn, initialized: bool = True) -> bool:
    """Set system initialization status."""
    try:
        await conn.execute(
            "UPDATE system_config SET initialized = %s WHERE id = 1",
            (initialized,)
        )
        await conn.commit()
        return True
    except Exception as e:
        print(f"Failed to set system initialized: {e}")
        return False
