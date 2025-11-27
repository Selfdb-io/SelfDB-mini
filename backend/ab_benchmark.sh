#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Apache Bench (ab) Load Testing Script for Day-One Backend API
# ═══════════════════════════════════════════════════════════════════════════════
#
# This script performs load testing using Apache Bench (ab) for the FastAPI backend.
# It tests various endpoints including Users and Tables APIs.
#
# Prerequisites:
#   - Apache Bench installed (comes with Apache HTTP Server)
#     macOS: Already installed (httpd is built-in)
#     Linux: sudo apt-get install apache2-utils
#
# Usage:
#   ./ab_benchmark.sh                    # Run with defaults (100 requests, 10 concurrent)
#   ./ab_benchmark.sh -n 1000 -c 50      # 1000 requests, 50 concurrent connections
#   ./ab_benchmark.sh --help             # Show help message
#
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

# NOTE: Use 127.0.0.1 instead of localhost on macOS to avoid
# "apr_socket_connect(): Invalid argument (22)" errors with ab
HOST="${HOST:-http://127.0.0.1:8000}"
API_KEY="Myapi-Key-for-dev"
TOTAL_REQUESTS="${TOTAL_REQUESTS:-100}"
CONCURRENCY="${CONCURRENCY:-10}"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")

# Arrays to store results for summary
declare -a TEST_NAMES
declare -a TEST_RPS
declare -a TEST_LATENCY
declare -a TEST_FAILED

# Test user credentials (will be created during setup)
TEST_EMAIL="abtest-${TIMESTAMP}@example.com"
TEST_PASSWORD="AbTest123!"
ACCESS_TOKEN=""
CREATED_USER_ID=""
CREATED_TABLE_ID=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────

print_header() {
    echo -e "\n${CYAN}══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}══════════════════════════════════════════════════════════════════${NC}\n"
}

print_subheader() {
    echo -e "\n${BLUE}──────────────────────────────────────────────────────────────────${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}──────────────────────────────────────────────────────────────────${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

show_help() {
    echo "Apache Bench Load Testing for Day-One Backend API"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -n, --requests NUM     Total number of requests (default: 100)"
    echo "  -c, --concurrency NUM  Number of concurrent requests (default: 10)"
    echo "  -h, --host URL         API host URL (default: http://localhost:8000)"
    echo "  --quick                Quick test (50 requests, 5 concurrent)"
    echo "  --stress               Stress test (1000 requests, 100 concurrent)"
    echo "  --help                 Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Default: 100 requests, 10 concurrent"
    echo "  $0 -n 500 -c 25              # 500 requests, 25 concurrent"
    echo "  $0 --stress                  # Heavy load test"
    echo "  $0 -h http://api.example.com # Test against different host"
    exit 0
}

check_dependencies() {
    print_subheader "Checking Dependencies"
    
    if ! command -v ab &> /dev/null; then
        print_error "Apache Bench (ab) is not installed!"
        echo ""
        echo "Install with:"
        echo "  macOS:   brew install httpd (or use built-in)"
        echo "  Ubuntu:  sudo apt-get install apache2-utils"
        echo "  CentOS:  sudo yum install httpd-tools"
        exit 1
    fi
    print_success "Apache Bench (ab) found: $(which ab)"
    
    if ! command -v curl &> /dev/null; then
        print_error "curl is not installed!"
        exit 1
    fi
    print_success "curl found: $(which curl)"
    
    if ! command -v jq &> /dev/null; then
        print_info "jq not found - JSON parsing will be limited"
        JQ_AVAILABLE=false
    else
        print_success "jq found: $(which jq)"
        JQ_AVAILABLE=true
    fi
}

check_api_health() {
    print_subheader "Checking API Health"
    
    # Try to hit the tables endpoint (should work with just API key)
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "X-API-Key: ${API_KEY}" \
        "${HOST}/tables/?skip=0&limit=1" 2>/dev/null || echo "000")
    
    if [ "$response" == "200" ]; then
        print_success "API is responding at ${HOST}"
    else
        print_error "API is not responding (HTTP $response). Make sure the server is running."
        echo "  Expected: HTTP 200"
        echo "  Got: HTTP $response"
        exit 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Setup Functions
# ─────────────────────────────────────────────────────────────────────────────

setup_test_user() {
    print_subheader "Setting Up Test User"
    
    # Create user
    create_response=$(curl -s -X POST "${HOST}/users/" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: ${API_KEY}" \
        -d "{
            \"email\": \"${TEST_EMAIL}\",
            \"password\": \"${TEST_PASSWORD}\",
            \"firstName\": \"Apache\",
            \"lastName\": \"Bench\"
        }" 2>/dev/null)
    
    if $JQ_AVAILABLE; then
        CREATED_USER_ID=$(echo "$create_response" | jq -r '.id // empty')
    else
        # Fallback: simple grep for UUID pattern
        CREATED_USER_ID=$(echo "$create_response" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
    fi
    
    if [ -n "$CREATED_USER_ID" ]; then
        print_success "Created test user: ${TEST_EMAIL} (ID: ${CREATED_USER_ID})"
    else
        print_error "Failed to create test user"
        echo "Response: $create_response"
    fi
    
    # Login to get access token
    login_response=$(curl -s -X POST "${HOST}/users/token" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: ${API_KEY}" \
        -d "{
            \"email\": \"${TEST_EMAIL}\",
            \"password\": \"${TEST_PASSWORD}\"
        }" 2>/dev/null)
    
    if $JQ_AVAILABLE; then
        ACCESS_TOKEN=$(echo "$login_response" | jq -r '.access_token // empty')
    else
        # Fallback: grep for token pattern
        ACCESS_TOKEN=$(echo "$login_response" | grep -oE '"access_token":"[^"]+' | cut -d'"' -f4)
    fi
    
    if [ -n "$ACCESS_TOKEN" ]; then
        print_success "Obtained access token"
    else
        print_error "Failed to login"
        echo "Response: $login_response"
    fi
}

setup_test_table() {
    print_subheader "Setting Up Test Table"
    
    TABLE_NAME="abtable_$(date +%s)"
    
    create_response=$(curl -s -X POST "${HOST}/tables/" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: ${API_KEY}" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -d "{
            \"name\": \"${TABLE_NAME}\",
            \"schema\": {
                \"name\": {\"type\": \"TEXT\", \"nullable\": false},
                \"value\": {\"type\": \"INTEGER\", \"nullable\": true}
            },
            \"public\": true,
            \"description\": \"Apache Bench test table\"
        }" 2>/dev/null)
    
    if $JQ_AVAILABLE; then
        CREATED_TABLE_ID=$(echo "$create_response" | jq -r '.id // empty')
    else
        CREATED_TABLE_ID=$(echo "$create_response" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
    fi
    
    if [ -n "$CREATED_TABLE_ID" ]; then
        print_success "Created test table: ${TABLE_NAME} (ID: ${CREATED_TABLE_ID})"
    else
        print_error "Failed to create test table"
        echo "Response: $create_response"
    fi
}

create_output_dir() {
    # No longer needed - results shown in terminal only
    :
}

# ─────────────────────────────────────────────────────────────────────────────
# Benchmark Functions
# ─────────────────────────────────────────────────────────────────────────────

run_ab_test() {
    local name="$1"
    local method="$2"
    local url="$3"
    local extra_headers="$4"
    local post_data="$5"
    
    echo -e "${YELLOW}Testing: ${name}${NC}"
    echo "  Method: $method"
    echo "  URL: $url"
    echo "  Requests: $TOTAL_REQUESTS, Concurrency: $CONCURRENCY"
    
    # Build ab command
    local ab_cmd="ab -n $TOTAL_REQUESTS -c $CONCURRENCY"
    ab_cmd+=" -H 'X-API-Key: ${API_KEY}'"
    ab_cmd+=" -H 'Content-Type: application/json'"
    
    # Add extra headers if provided
    if [ -n "$extra_headers" ]; then
        ab_cmd+=" $extra_headers"
    fi
    
    local output=""
    
    # Handle POST/PATCH/DELETE methods
    if [ "$method" == "POST" ] || [ "$method" == "PATCH" ]; then
        # Create temp file for POST data
        local temp_file=$(mktemp)
        echo "$post_data" > "$temp_file"
        
        if [ "$method" == "POST" ]; then
            ab_cmd+=" -p '$temp_file' -T 'application/json'"
        else
            ab_cmd+=" -u '$temp_file' -T 'application/json'"
        fi
        ab_cmd+=" '${url}'"
        
        output=$(eval $ab_cmd 2>&1)
        rm -f "$temp_file"
    else
        ab_cmd+=" '${url}'"
        output=$(eval $ab_cmd 2>&1)
    fi
    
    # Extract metrics from output
    local rps=$(echo "$output" | grep "Requests per second:" | awk '{print $4}')
    local latency=$(echo "$output" | grep "Time per request:" | head -1 | awk '{print $4 " " $5}')
    local failed=$(echo "$output" | grep "Failed requests:" | awk '{print $3}')
    
    # Store results for summary
    TEST_NAMES+=("$name")
    TEST_RPS+=("$rps")
    TEST_LATENCY+=("$latency")
    TEST_FAILED+=("${failed:-0}")
    
    # Show brief result
    if [ "${failed:-0}" == "0" ]; then
        print_success "$name: ${rps} req/sec, ${latency}"
    else
        print_error "$name: ${rps} req/sec, ${latency}, ${failed} failed"
    fi
    echo ""
}

run_get_benchmark() {
    local name="$1"
    local endpoint="$2"
    local auth_required="$3"
    
    local extra_headers=""
    if [ "$auth_required" == "true" ] && [ -n "$ACCESS_TOKEN" ]; then
        extra_headers="-H 'Authorization: Bearer ${ACCESS_TOKEN}'"
    fi
    
    run_ab_test "$name" "GET" "${HOST}${endpoint}" "$extra_headers" ""
}

run_post_benchmark() {
    local name="$1"
    local endpoint="$2"
    local data="$3"
    local auth_required="$4"
    
    local extra_headers=""
    if [ "$auth_required" == "true" ] && [ -n "$ACCESS_TOKEN" ]; then
        extra_headers="-H 'Authorization: Bearer ${ACCESS_TOKEN}'"
    fi
    
    run_ab_test "$name" "POST" "${HOST}${endpoint}" "$extra_headers" "$data"
}

# ─────────────────────────────────────────────────────────────────────────────
# Test Suites
# ─────────────────────────────────────────────────────────────────────────────

run_public_endpoints() {
    print_header "Testing Public Endpoints (No Auth Required)"
    
    # List tables (public)
    run_get_benchmark "list_tables_public" "/tables/?skip=0&limit=10" "false"
}

run_auth_endpoints() {
    print_header "Testing Authentication Endpoints"
    
    if [ -z "$ACCESS_TOKEN" ]; then
        print_error "No access token available - skipping auth tests"
        return
    fi
    
    # Get current user
    run_get_benchmark "get_current_user" "/users/me" "true"
    
    # List users (authenticated)
    run_get_benchmark "list_users" "/users/?skip=0&limit=10" "true"
    
    # List tables (authenticated)
    run_get_benchmark "list_tables_auth" "/tables/?skip=0&limit=10" "true"
}

run_table_endpoints() {
    print_header "Testing Table Endpoints"
    
    if [ -z "$ACCESS_TOKEN" ] || [ -z "$CREATED_TABLE_ID" ]; then
        print_error "Missing access token or table ID - skipping table tests"
        return
    fi
    
    # Get specific table
    run_get_benchmark "get_table" "/tables/${CREATED_TABLE_ID}" "true"
    
    # Get table data
    run_get_benchmark "get_table_data" "/tables/${CREATED_TABLE_ID}/data?page=1&page_size=10" "true"
}

run_write_endpoints() {
    print_header "Testing Write Endpoints (POST)"
    
    if [ -z "$ACCESS_TOKEN" ]; then
        print_error "No access token available - skipping write tests"
        return
    fi
    
    # Insert row into table
    if [ -n "$CREATED_TABLE_ID" ]; then
        local row_data='{"name": "ab_test_item", "value": 42}'
        run_post_benchmark "insert_row" "/tables/${CREATED_TABLE_ID}/data" "$row_data" "true"
    fi
    
    # Note: Creating new tables/users with ab is tricky because each request
    # would need unique data. We'll do a single concurrent batch test instead.
}

run_user_registration_test() {
    print_header "Testing User Registration (Unique Users)"
    
    # This is a special test - we create a temporary JSON file with user data
    # Note: All users will have the same email, so most will fail with 409 Conflict
    # This is intentional to test error handling under load
    
    local unique_email="abload-${TIMESTAMP}@example.com"
    local user_data="{\"email\": \"${unique_email}\", \"password\": \"TestLoad123!\", \"firstName\": \"Load\", \"lastName\": \"Test\"}"
    
    run_post_benchmark "user_registration" "/users/" "$user_data" "false"
    
    print_info "Note: Most requests will fail with 409 (duplicate email) - this tests error handling"
}

# ─────────────────────────────────────────────────────────────────────────────
# Summary Report
# ─────────────────────────────────────────────────────────────────────────────

generate_summary() {
    print_header "Benchmark Summary"
    
    # Display summary table in terminal
    echo ""
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│                           APACHE BENCH RESULTS SUMMARY                                 │${NC}"
    echo -e "${CYAN}├─────────────────────────────────────────────────────────────────────────────────────────┤${NC}"
    printf "${CYAN}│${NC} %-25s ${CYAN}│${NC} %10s ${CYAN}│${NC} %14s ${CYAN}│${NC} %8s ${CYAN}│${NC} %10s ${CYAN}│${NC}\n" \
        "ENDPOINT" "REQ/SEC" "LATENCY" "FAILED" "STATUS"
    echo -e "${CYAN}├─────────────────────────────────────────────────────────────────────────────────────────┤${NC}"
    
    local fastest_rps=0
    local fastest_name=""
    local slowest_rps=999999
    local slowest_name=""
    local total_rps=0
    local count=${#TEST_NAMES[@]}
    
    for i in "${!TEST_NAMES[@]}"; do
        local name="${TEST_NAMES[$i]}"
        local rps="${TEST_RPS[$i]}"
        local latency="${TEST_LATENCY[$i]}"
        local failed="${TEST_FAILED[$i]}"
        
        # Determine status
        if [ "${failed:-0}" == "0" ]; then
            status="${GREEN}✓ PASS${NC}"
        else
            status="${RED}✗ FAIL${NC}"
        fi
        
        # Truncate name if too long
        local display_name="$name"
        if [ ${#display_name} -gt 23 ]; then
            display_name="${display_name:0:20}..."
        fi
        
        printf "${CYAN}│${NC} %-25s ${CYAN}│${NC} %10s ${CYAN}│${NC} %14s ${CYAN}│${NC} %8s ${CYAN}│${NC} %b ${CYAN}│${NC}\n" \
            "$display_name" "$rps" "$latency" "$failed" "$status"
        
        # Track fastest/slowest
        local rps_int=$(echo "$rps" | cut -d'.' -f1)
        if [ -n "$rps_int" ] && [ "$rps_int" != "0" ]; then
            total_rps=$((total_rps + rps_int))
            if [ "$rps_int" -gt "$fastest_rps" ]; then
                fastest_rps=$rps_int
                fastest_name=$name
            fi
            if [ "$rps_int" -lt "$slowest_rps" ]; then
                slowest_rps=$rps_int
                slowest_name=$name
            fi
        fi
    done
    
    echo -e "${CYAN}└─────────────────────────────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    
    # Performance highlights
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│                              PERFORMANCE HIGHLIGHTS                                    │${NC}"
    echo -e "${CYAN}├─────────────────────────────────────────────────────────────────────────────────────────┤${NC}"
    
    if [ $count -gt 0 ]; then
        local avg_rps=$((total_rps / count))
        printf "${CYAN}│${NC}  ${GREEN}🚀 Fastest:${NC} %-25s (%d req/sec)                                 ${CYAN}│${NC}\n" "$fastest_name" "$fastest_rps"
        printf "${CYAN}│${NC}  ${YELLOW}🐢 Slowest:${NC} %-25s (%d req/sec)                                 ${CYAN}│${NC}\n" "$slowest_name" "$slowest_rps"
        printf "${CYAN}│${NC}  ${BLUE}📊 Average:${NC} %d req/sec across %d endpoints                                      ${CYAN}│${NC}\n" "$avg_rps" "$count"
    fi
    
    echo -e "${CYAN}└─────────────────────────────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    
    # Test configuration
    echo -e "${BLUE}Test Configuration:${NC}"
    echo "  Host: ${HOST}"
    echo "  Requests per test: ${TOTAL_REQUESTS}"
    echo "  Concurrency: ${CONCURRENCY}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup Info
# ─────────────────────────────────────────────────────────────────────────────

cleanup() {
    print_subheader "Test Resources Created"
    
    echo "  User: ${TEST_EMAIL}"
    [ -n "$CREATED_USER_ID" ] && echo "  User ID: ${CREATED_USER_ID}"
    [ -n "$CREATED_TABLE_ID" ] && echo "  Table ID: ${CREATED_TABLE_ID}"
    echo ""
    print_info "These remain in the database. Delete via API if needed."
}

# ─────────────────────────────────────────────────────────────────────────────
# Parse Arguments
# ─────────────────────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--requests)
            TOTAL_REQUESTS="$2"
            shift 2
            ;;
        -c|--concurrency)
            CONCURRENCY="$2"
            shift 2
            ;;
        -h|--host)
            HOST="$2"
            shift 2
            ;;
        --quick)
            TOTAL_REQUESTS=50
            CONCURRENCY=5
            shift
            ;;
        --stress)
            TOTAL_REQUESTS=1000
            CONCURRENCY=100
            shift
            ;;
        --help)
            show_help
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            ;;
    esac
done

# ─────────────────────────────────────────────────────────────────────────────
# Main Execution
# ─────────────────────────────────────────────────────────────────────────────

main() {
    print_header "Apache Bench Load Testing for Day-One Backend"
    
    echo "Configuration:"
    echo "  Host: ${HOST}"
    echo "  Requests: ${TOTAL_REQUESTS}"
    echo "  Concurrency: ${CONCURRENCY}"
    echo ""
    
    # Pre-flight checks
    check_dependencies
    check_api_health
    create_output_dir
    
    # Setup test resources
    setup_test_user
    setup_test_table
    
    # Run benchmark suites
    run_public_endpoints
    run_auth_endpoints
    run_table_endpoints
    run_write_endpoints
    run_user_registration_test
    
    # Generate summary
    generate_summary
    
    # Cleanup info
    cleanup
    
    print_header "Testing Complete!"
    echo -e "${GREEN}All benchmarks finished successfully!${NC}"
    echo ""
}

main "$@"
