#!/bin/bash
# filepath: /Users/rodgersmagabo/Desktop/day-one/backend/run_schemathesis.sh

# Run schemathesis API tests against the local server
uv run schemathesis run http://localhost:8000/openapi.json \
  --header "X-API-Key: Myapi-Key-for-dev"