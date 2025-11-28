#!/bin/sh
set -e

# Validate required environment variables
if [ -z "$NGINX_PORT" ]; then
    echo "ERROR: NGINX_PORT environment variable is required"
    exit 1
fi

if [ -z "$BACKEND_PORT_CONTAINER" ]; then
    echo "ERROR: BACKEND_PORT_CONTAINER environment variable is required"
    exit 1
fi

# Substitute environment variables in nginx config template
# Only substitute our custom variables, not nginx's built-in $uri, $host, etc.
envsubst '${NGINX_PORT} ${BACKEND_PORT_CONTAINER}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start nginx
exec nginx -g 'daemon off;'
