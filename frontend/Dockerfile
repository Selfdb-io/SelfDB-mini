# syntax=docker/dockerfile:1
# ═══════════════════════════════════════════════════════════════════════════════
# Day-One Frontend Dockerfile
# React + Vite application with multi-stage build
# ═══════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* pnpm-lock.yaml* ./

# Install dependencies
RUN if [ -f pnpm-lock.yaml ]; then \
        npm install -g pnpm && pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
        npm ci; \
    else \
        npm install; \
    fi

# Copy source code
COPY . .

# Build args for app metadata
ARG VITE_APP_NAME
ARG VITE_APP_VERSION

# Build the application using BuildKit secret mount
# The secret is mounted as environment variable during build only
# and is not stored in image layers or metadata
RUN --mount=type=secret,id=VITE_API_KEY,env=VITE_API_KEY \
    VITE_APP_NAME="$VITE_APP_NAME" \
    VITE_APP_VERSION="$VITE_APP_VERSION" \
    npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:alpine AS production

# Install curl for healthcheck and gettext for envsubst
RUN apk add --no-cache curl gettext

# Copy nginx config template (will be processed at runtime)
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Port is dynamic - set via NGINX_PORT env var
# EXPOSE is documentation only, actual port comes from environment

# Start nginx via entrypoint (processes template first)
ENTRYPOINT ["/docker-entrypoint.sh"]
