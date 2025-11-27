# ═══════════════════════════════════════════════════════════════════════════════
# Day-One Backend Dockerfile
# FastAPI application with uv package manager
# ═══════════════════════════════════════════════════════════════════════════════

# Use Python 3.12 slim image with uv pre-installed
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Install system dependencies including PostgreSQL 18 client for pg_dump/psql
# Add PostgreSQL APT repository for version 18
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    gnupg2 \
    lsb-release \
    && echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first for better caching
COPY pyproject.toml uv.lock* ./

# Install dependencies (without the project itself)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project

# Copy the rest of the application
COPY . .

# Install the project
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen

# Expose port
EXPOSE 8000

# Run the FastAPI application
# Use 0.0.0.0 to bind to all interfaces in container
CMD ["uv", "run", "fastapi", "run", "--host", "0.0.0.0", "--port", "8000"]
