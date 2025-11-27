#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Day-One Backup Restore Script
# ─────────────────────────────────────────────────────────────────────────────
# 
# Restores the database from a backup file. Use this for headless servers
# or when you prefer CLI over the web UI.
#
# Usage:
#   ./restore_from_backup.sh <backup-filename>
#   ./restore_from_backup.sh                      # Lists available backups
#
# Examples:
#   ./restore_from_backup.sh dayone_backup_20251127_111919.tar.gz
#   ./restore_from_backup.sh latest               # Restore most recent backup
#
# ─────────────────────────────────────────────────────────────────────────────

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory (where docker-compose.yml should be)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backups"

# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────

print_header() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Day-One Backup Restore Tool${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

list_backups() {
    echo -e "${BLUE}Available backups in ./backups/:${NC}"
    echo ""
    
    if [ ! -d "$BACKUP_DIR" ]; then
        print_error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi
    
    # Find and list backups sorted by date (newest first)
    local backups=$(ls -t "$BACKUP_DIR"/dayone_backup_*.tar.gz 2>/dev/null)
    
    if [ -z "$backups" ]; then
        print_warning "No backup files found."
        echo ""
        echo "Create a backup first using the web UI or wait for scheduled backup."
        exit 0
    fi
    
    echo "  #  | Filename                              | Size      | Date"
    echo "-----+---------------------------------------+-----------+-------------------"
    
    local count=1
    while IFS= read -r backup; do
        local filename=$(basename "$backup")
        local size=$(du -h "$backup" | cut -f1)
        # Extract date from filename: dayone_backup_YYYYMMDD_HHMMSS.tar.gz
        local date_part=$(echo "$filename" | sed 's/dayone_backup_\([0-9]*\)_\([0-9]*\)\.tar\.gz/\1 \2/')
        local formatted_date=$(echo "$date_part" | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\) \([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
        
        printf "  %-2s | %-37s | %-9s | %s\n" "$count" "$filename" "$size" "$formatted_date"
        count=$((count + 1))
    done <<< "$backups"
    
    echo ""
    echo "Usage: $0 <backup-filename>"
    echo "       $0 latest    # Restore the most recent backup"
}

get_latest_backup() {
    ls -t "$BACKUP_DIR"/dayone_backup_*.tar.gz 2>/dev/null | head -n1
}

# ─────────────────────────────────────────────────────────────────────────────
# Main Script
# ─────────────────────────────────────────────────────────────────────────────

print_header

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed or not in PATH"
    exit 1
fi

# Change to script directory
cd "$SCRIPT_DIR"

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found in $SCRIPT_DIR"
    exit 1
fi

# If no argument provided, list available backups
if [ -z "$1" ]; then
    list_backups
    exit 0
fi

BACKUP_NAME="$1"

# Handle 'latest' keyword
if [ "$BACKUP_NAME" = "latest" ]; then
    BACKUP_PATH=$(get_latest_backup)
    if [ -z "$BACKUP_PATH" ]; then
        print_error "No backup files found in $BACKUP_DIR"
        exit 1
    fi
    BACKUP_NAME=$(basename "$BACKUP_PATH")
    print_info "Using latest backup: $BACKUP_NAME"
else
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
fi

# Validate backup file exists
if [ ! -f "$BACKUP_PATH" ]; then
    print_error "Backup file not found: $BACKUP_PATH"
    echo ""
    list_backups
    exit 1
fi

# Validate backup filename format
if [[ ! "$BACKUP_NAME" =~ ^dayone_backup_[0-9]{8}_[0-9]{6}\.tar\.gz$ ]]; then
    print_error "Invalid backup filename format: $BACKUP_NAME"
    echo "Expected format: dayone_backup_YYYYMMDD_HHMMSS.tar.gz"
    exit 1
fi

echo "Backup file: $BACKUP_NAME"
echo "Size: $(du -h "$BACKUP_PATH" | cut -f1)"
echo ""

# Warning prompt
print_warning "This will REPLACE ALL DATA in the database!"
print_warning "All current users, tables, and data will be DELETED."
echo ""
read -p "Are you sure you want to restore from this backup? (y/yes to confirm): " confirm

if [[ "$confirm" != "yes" && "$confirm" != "y" ]]; then
    print_info "Restore cancelled."
    exit 0
fi

echo ""
print_info "Starting restore process..."

# Create temp directory for extraction
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract backup
print_info "Extracting backup archive..."
tar -xzf "$BACKUP_PATH" -C "$TEMP_DIR"

# Verify database.sql exists
if [ ! -f "$TEMP_DIR/database.sql" ]; then
    print_error "Invalid backup: database.sql not found in archive"
    exit 1
fi

print_success "Backup extracted successfully"

# Load specific environment variables we need (avoid sourcing entire .env due to special chars)
if [ -f ".env" ]; then
    POSTGRES_USER=$(grep -E '^POSTGRES_USER=' .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    POSTGRES_DB=$(grep -E '^POSTGRES_DB=' .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
fi

# Set defaults if not in .env
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-dayone}"

# Check if containers are running
if ! docker compose ps --status running | grep -q "backend"; then
    print_info "Starting containers..."
    docker compose up -d
    sleep 5
fi

# Wait for database to be ready
print_info "Waiting for database to be ready..."
for i in {1..30}; do
    if docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1; then
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "Database did not become ready in time"
        exit 1
    fi
    sleep 1
done
print_success "Database is ready"

# Terminate existing connections
print_info "Terminating existing database connections..."
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true

# Drop and recreate schema
print_info "Dropping existing schema..."
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" \
    > /dev/null 2>&1

print_success "Schema dropped and recreated"

# Restore database
print_info "Restoring database from backup..."
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$TEMP_DIR/database.sql" > /dev/null 2>&1

print_success "Database restored successfully"

# Check if .env was in backup
if [ -f "$TEMP_DIR/.env" ]; then
    echo ""
    print_warning "Backup contains .env file. Current .env was NOT replaced."
    print_info "If you need the backed-up .env, it's at: $TEMP_DIR/.env"
    read -p "Do you want to view the backed-up .env? (y/n): " show_env
    if [[ "$show_env" == "yes" || "$show_env" == "y" ]]; then
        echo ""
        echo "─── Backed-up .env contents ───"
        cat "$TEMP_DIR/.env"
        echo "────────────────────────────────"
    fi
fi

# Restart backend to clear any cached state
print_info "Restarting backend service..."
docker compose restart backend > /dev/null 2>&1

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Restore completed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "You can now login with your restored user credentials."
echo ""
