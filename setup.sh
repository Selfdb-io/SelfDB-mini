#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════════════
# Day-One Setup Script
# ═══════════════════════════════════════════════════════════════════════════════
# This script handles:
#   1. Downloading and setting up PgBouncer from official source
#   2. Stopping existing Docker services
#   3. Rebuilding services with no cache
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
PGBOUNCER_VERSION="1.25.0"
PGBOUNCER_URL="https://www.pgbouncer.org/downloads/files/${PGBOUNCER_VERSION}/pgbouncer-${PGBOUNCER_VERSION}.tar.gz"
PGBOUNCER_DIR="pgbouncer-${PGBOUNCER_VERSION}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR="${SCRIPT_DIR}/.pgbouncer-temp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────

print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}\n"
}

print_step() {
    echo -e "${GREEN}▶${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

show_usage() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start       Download PgBouncer, set up, and start Docker services (default)"
    echo "  stop        Stop all Docker services"
    echo "  rebuild     Rebuild all services with no cache"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0              # Same as 'start'"
    echo "  $0 start        # Download PgBouncer and start services"
    echo "  $0 stop         # Stop all services"
    echo "  $0 rebuild      # Rebuild all services without cache"
}

check_dependencies() {
    print_step "Checking dependencies..."
    
    local missing_deps=()
    
    if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
        missing_deps+=("curl or wget")
    fi
    
    if ! command -v tar &> /dev/null; then
        missing_deps+=("tar")
    fi
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        print_error "Missing required dependencies: ${missing_deps[*]}"
        exit 1
    fi
    
    print_success "All dependencies found"
}

# ─────────────────────────────────────────────────────────────────────────────
# Main Functions
# ─────────────────────────────────────────────────────────────────────────────

download_pgbouncer() {
    print_header "Downloading PgBouncer ${PGBOUNCER_VERSION}"
    
    # Create temp directory
    mkdir -p "${TEMP_DIR}"
    cd "${TEMP_DIR}"
    
    print_step "Downloading from ${PGBOUNCER_URL}..."
    
    if command -v curl &> /dev/null; then
        curl -fSL "${PGBOUNCER_URL}" -o "pgbouncer.tar.gz"
    elif command -v wget &> /dev/null; then
        wget -q "${PGBOUNCER_URL}" -O "pgbouncer.tar.gz"
    fi
    
    print_success "Download complete"
    
    print_step "Extracting archive..."
    tar -xzf "pgbouncer.tar.gz"
    print_success "Extraction complete"
    
    cd "${SCRIPT_DIR}"
}

setup_pgbouncer() {
    print_header "Setting Up PgBouncer"
    
    # Backup existing Docker files if they exist
    local dockerfile_backup=""
    local entrypoint_backup=""
    
    if [ -f "${SCRIPT_DIR}/${PGBOUNCER_DIR}/Dockerfile" ]; then
        print_step "Backing up existing Dockerfile..."
        dockerfile_backup=$(cat "${SCRIPT_DIR}/${PGBOUNCER_DIR}/Dockerfile")
    fi
    
    if [ -f "${SCRIPT_DIR}/${PGBOUNCER_DIR}/docker-entrypoint.sh" ]; then
        print_step "Backing up existing docker-entrypoint.sh..."
        entrypoint_backup=$(cat "${SCRIPT_DIR}/${PGBOUNCER_DIR}/docker-entrypoint.sh")
    fi
    
    # Remove existing pgbouncer directory
    if [ -d "${SCRIPT_DIR}/${PGBOUNCER_DIR}" ]; then
        print_step "Removing existing pgbouncer directory..."
        rm -rf "${SCRIPT_DIR}/${PGBOUNCER_DIR}"
        print_success "Old directory removed"
    fi
    
    # Move downloaded pgbouncer to project directory
    print_step "Installing new PgBouncer source..."
    mv "${TEMP_DIR}/${PGBOUNCER_DIR}" "${SCRIPT_DIR}/${PGBOUNCER_DIR}"
    print_success "PgBouncer source installed"
    
    # Copy Docker files
    print_step "Setting up Docker files..."
    
    if [ -n "${dockerfile_backup}" ]; then
        echo "${dockerfile_backup}" > "${SCRIPT_DIR}/${PGBOUNCER_DIR}/Dockerfile"
        print_success "Dockerfile restored"
    else
        # Create default Dockerfile
        create_dockerfile
        print_success "Dockerfile created"
    fi
    
    if [ -n "${entrypoint_backup}" ]; then
        echo "${entrypoint_backup}" > "${SCRIPT_DIR}/${PGBOUNCER_DIR}/docker-entrypoint.sh"
        chmod +x "${SCRIPT_DIR}/${PGBOUNCER_DIR}/docker-entrypoint.sh"
        print_success "docker-entrypoint.sh restored"
    else
        # Create default entrypoint
        create_entrypoint
        print_success "docker-entrypoint.sh created"
    fi
    
    # Cleanup temp directory
    print_step "Cleaning up temporary files..."
    rm -rf "${TEMP_DIR}"
    print_success "Cleanup complete"
}

create_dockerfile() {
    cat > "${SCRIPT_DIR}/${PGBOUNCER_DIR}/Dockerfile" << 'DOCKERFILE'
FROM debian:bookworm-slim AS builder

ARG PGBOUNCER_VERSION=1.25.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        autoconf \
        automake \
        build-essential \
        ca-certificates \
        libevent-dev \
        libpq-dev \
        libssl-dev \
        libtool \
        pkg-config \
        python3 \
        pandoc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY . /src

# Generate configure script from configure.ac
RUN ./autogen.sh

RUN ./configure --prefix=/usr/local \
    && make -j"$(nproc)" \
    && make install DESTDIR=/tmp/install

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libevent-2.1-7 \
        libpq5 \
        libssl3 \
        net-tools \
    && rm -rf /var/lib/apt/lists/*

ENV PGBOUNCER_CONFIG_DIR=/etc/pgbouncer \
    PGBOUNCER_RUN_DIR=/var/run/pgbouncer \
    PGBOUNCER_LOG_DIR=/var/log/pgbouncer \
    PGBOUNCER_DATA_DIR=/var/lib/pgbouncer

RUN useradd --system --home "$PGBOUNCER_DATA_DIR" --shell /usr/sbin/nologin pgbouncer \
    && mkdir -p "$PGBOUNCER_CONFIG_DIR" "$PGBOUNCER_RUN_DIR" "$PGBOUNCER_LOG_DIR" "$PGBOUNCER_DATA_DIR" \
    && chown -R pgbouncer:pgbouncer "$PGBOUNCER_CONFIG_DIR" "$PGBOUNCER_RUN_DIR" "$PGBOUNCER_LOG_DIR" "$PGBOUNCER_DATA_DIR"

COPY --from=builder /tmp/install/ /

COPY --chown=pgbouncer:pgbouncer docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER pgbouncer

# Port is dynamic - set via LISTEN_PORT env var
# No hardcoded EXPOSE - port comes from environment

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

CMD ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
DOCKERFILE
}

create_entrypoint() {
    cat > "${SCRIPT_DIR}/${PGBOUNCER_DIR}/docker-entrypoint.sh" << 'ENTRYPOINT'
#!/usr/bin/env bash

set -euo pipefail

CONFIG_DIR="${PGBOUNCER_CONFIG_DIR:-/etc/pgbouncer}"
CONFIG_FILE="${PGBOUNCER_CONFIG_FILE:-${CONFIG_DIR}/pgbouncer.ini}"
USERLIST_FILE="${PGBOUNCER_USERLIST_FILE:-${CONFIG_DIR}/userlist.txt}"
RUN_DIR="${PGBOUNCER_RUN_DIR:-/var/run/pgbouncer}"
LOG_DIR="${PGBOUNCER_LOG_DIR:-/var/log/pgbouncer}"

REQUIRED_VARS=(DATABASES_HOST DATABASES_PORT DATABASES_USER DATABASES_PASSWORD DATABASES_DBNAME)
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "ERROR: Environment variable ${var} is required but not set." >&2
        exit 1
    fi
done

LISTEN_ADDR="${LISTEN_ADDR:-0.0.0.0}"
LISTEN_PORT="${LISTEN_PORT:-6432}"
AUTH_TYPE="${AUTH_TYPE:-md5}"
POOL_MODE="${POOL_MODE:-session}"
MAX_CLIENT_CONN="${MAX_CLIENT_CONN:-100}"
DEFAULT_POOL_SIZE="${DEFAULT_POOL_SIZE:-20}"
RESERVE_POOL_SIZE="${RESERVE_POOL_SIZE:-0}"
SERVER_LIFETIME="${SERVER_LIFETIME:-3600}"
SERVER_IDLE_TIMEOUT="${SERVER_IDLE_TIMEOUT:-600}"
QUERY_WAIT_TIMEOUT="${QUERY_WAIT_TIMEOUT:-120}"
CLIENT_IDLE_TIMEOUT="${CLIENT_IDLE_TIMEOUT:-0}"
ADMIN_USERS="${ADMIN_USERS:-${DATABASES_USER}}"
STATS_USERS="${STATS_USERS:-${DATABASES_USER}}"
IGNORE_STARTUP_PARAMETERS="${IGNORE_STARTUP_PARAMETERS:-extra_float_digits}"

AUTH_QUERY_DEFAULT='SELECT usename, CASE WHEN valuntil IS NULL OR valuntil > pg_catalog.now() THEN passwd ELSE NULL END FROM pg_catalog.pg_shadow WHERE usename=$1'
AUTH_QUERY="${AUTH_QUERY:-$AUTH_QUERY_DEFAULT}"

mkdir -p "${CONFIG_DIR}" "${RUN_DIR}" "${LOG_DIR}"

DATABASE_ALIAS="${DATABASES_ALIAS:-${DATABASES_DBNAME}}"
DATABASE_LINE="${DATABASE_ALIAS} = host=${DATABASES_HOST} port=${DATABASES_PORT} user=${DATABASES_USER}"

if [ -n "${DATABASES_PASSWORD:-}" ]; then
    DATABASE_LINE="${DATABASE_LINE} password=${DATABASES_PASSWORD}"
fi

DATABASE_LINE="${DATABASE_LINE} dbname=${DATABASES_DBNAME}"

{
    printf '[databases]\n'
    printf '%s\n' "${DATABASE_LINE}"

    printf '\n[pgbouncer]\n'
    printf 'logfile = /dev/stdout\n'
    printf 'pidfile = %s/pgbouncer.pid\n' "${RUN_DIR}"
    printf 'listen_addr = %s\n' "${LISTEN_ADDR}"
    printf 'listen_port = %s\n' "${LISTEN_PORT}"
    printf 'auth_type = %s\n' "${AUTH_TYPE}"
    printf 'auth_file = %s\n' "${USERLIST_FILE}"
    printf 'auth_query = %s\n' "${AUTH_QUERY}"
    printf 'admin_users = %s\n' "${ADMIN_USERS}"
    printf 'stats_users = %s\n' "${STATS_USERS}"
    printf 'pool_mode = %s\n' "${POOL_MODE}"
    printf 'max_client_conn = %s\n' "${MAX_CLIENT_CONN}"
    printf 'default_pool_size = %s\n' "${DEFAULT_POOL_SIZE}"
    printf 'reserve_pool_size = %s\n' "${RESERVE_POOL_SIZE}"
    printf 'server_lifetime = %s\n' "${SERVER_LIFETIME}"
    printf 'server_idle_timeout = %s\n' "${SERVER_IDLE_TIMEOUT}"
    printf 'query_wait_timeout = %s\n' "${QUERY_WAIT_TIMEOUT}"
    printf 'client_idle_timeout = %s\n' "${CLIENT_IDLE_TIMEOUT}"
    printf 'ignore_startup_parameters = %s\n' "${IGNORE_STARTUP_PARAMETERS}"
} > "${CONFIG_FILE}"

chmod 600 "${CONFIG_FILE}"

printf '"%s" "%s"\n' "${DATABASES_USER}" "${DATABASES_PASSWORD}" > "${USERLIST_FILE}"
chmod 600 "${USERLIST_FILE}"

exec "$@"
ENTRYPOINT
    chmod +x "${SCRIPT_DIR}/${PGBOUNCER_DIR}/docker-entrypoint.sh"
}

start_services() {
    print_header "Starting Docker Services"
    
    cd "${SCRIPT_DIR}"
    
    print_step "Starting services with docker compose..."
    docker compose up -d
    
    print_success "Services started successfully!"
    echo ""
    print_step "You can check the status with: docker compose ps"
    print_step "View logs with: docker compose logs -f"
}

stop_services() {
    print_header "Stopping Docker Services"
    
    cd "${SCRIPT_DIR}"
    
    print_step "Stopping all services..."
    docker compose down
    
    print_success "All services stopped"
}

rebuild_services() {
    print_header "Rebuilding Docker Services (No Cache)"
    
    cd "${SCRIPT_DIR}"
    
    print_step "Stopping existing services..."
    docker compose down
    
    print_step "Rebuilding all services with no cache..."
    docker compose build --no-cache
    
    print_step "Starting services..."
    docker compose up -d
    
    print_success "Services rebuilt and started successfully!"
    echo ""
    print_step "You can check the status with: docker compose ps"
    print_step "View logs with: docker compose logs -f"
}

# ─────────────────────────────────────────────────────────────────────────────
# Main Script
# ─────────────────────────────────────────────────────────────────────────────

main() {
    local command="${1:-start}"
    
    print_header "Day-One Setup Script"
    
    case "${command}" in
        start)
            check_dependencies
            download_pgbouncer
            setup_pgbouncer
            start_services
            ;;
        stop)
            stop_services
            ;;
        rebuild)
            check_dependencies
            download_pgbouncer
            setup_pgbouncer
            rebuild_services
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            print_error "Unknown command: ${command}"
            echo ""
            show_usage
            exit 1
            ;;
    esac
    
    echo ""
    print_success "Done!"
}

main "$@"
