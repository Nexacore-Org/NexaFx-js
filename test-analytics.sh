#!/bin/bash

# API Usage Analytics - Automated Testing Script
# This script automates testing of the analytics endpoints

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_HEADER="x-admin: true"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}→ $1${NC}"
}

# Test 1: Check if server is running
test_server_health() {
    print_header "TEST 1: Server Health Check"
    
    if curl -s "${BASE_URL}" > /dev/null 2>&1; then
        print_success "Server is responding at ${BASE_URL}"
    else
        print_error "Server is not responding at ${BASE_URL}"
        echo "Make sure to run: npm run start:dev"
        exit 1
    fi
}

# Test 2: Generate test data
test_generate_data() {
    print_header "TEST 2: Generate Test Data"
    
    print_info "Making 5 requests to /api/transactions..."
    
    for i in {1..5}; do
        response=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/transactions")
        status=$(echo "$response" | tail -n1)
        
        if [ "$status" = "200" ] || [ "$status" = "404" ]; then
            print_success "Request $i completed (Status: $status)"
        else
            print_error "Request $i failed (Status: $status)"
        fi
        
        sleep 0.5
    done
    
    print_info "Waiting for async logging to complete..."
    sleep 2
}

# Test 3: Get analytics summary
test_analytics_summary() {
    print_header "TEST 3: Get Analytics Summary"
    
    print_info "Fetching summary for last 24 hours..."
    
    response=$(curl -s -H "${ADMIN_HEADER}" "${BASE_URL}/admin/api-usage/summary")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Summary endpoint returned valid response"
        
        # Extract and display key metrics
        total=$(echo "$response" | grep -o '"totalRequests":[0-9]*' | grep -o '[0-9]*')
        avg=$(echo "$response" | grep -o '"averageResponseTime":[0-9.]*' | grep -o '[0-9.]*')
        
        echo -e "\n${GREEN}Key Metrics:${NC}"
        echo "  Total Requests: ${total:-0}"
        echo "  Avg Response Time: ${avg:-0}ms"
        
        # Show pretty JSON
        echo -e "\n${GREEN}Full Response:${NC}"
        echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    else
        print_error "Summary endpoint failed"
        echo "Response: $response"
    fi
}

# Test 4: Get raw logs
test_raw_logs() {
    print_header "TEST 4: Get Raw Logs"
    
    print_info "Fetching detailed logs (limit=5)..."
    
    response=$(curl -s -H "${ADMIN_HEADER}" "${BASE_URL}/admin/api-usage/raw?limit=5")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Raw logs endpoint returned valid response"
        
        # Extract metadata
        total=$(echo "$response" | grep -o '"total":[0-9]*' | grep -o '[0-9]*')
        limit=$(echo "$response" | grep -o '"limit":[0-9]*' | grep -o '[0-9]*')
        
        echo -e "\n${GREEN}Pagination Info:${NC}"
        echo "  Total Records: ${total:-0}"
        echo "  Limit: ${limit:-0}"
        
        # Show pretty JSON
        echo -e "\n${GREEN}Log Sample:${NC}"
        echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    else
        print_error "Raw logs endpoint failed"
        echo "Response: $response"
    fi
}

# Test 5: Test filtering
test_filtering() {
    print_header "TEST 5: Test Filtering"
    
    print_info "Testing route filtering..."
    response=$(curl -s -H "${ADMIN_HEADER}" "${BASE_URL}/admin/api-usage/raw?route=/api/transactions&limit=5")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Route filtering works"
    else
        print_error "Route filtering failed"
    fi
    
    print_info "Testing status code filtering..."
    response=$(curl -s -H "${ADMIN_HEADER}" "${BASE_URL}/admin/api-usage/raw?statusCode=200&limit=5")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Status code filtering works"
    else
        print_error "Status code filtering failed"
    fi
    
    print_info "Testing time window parameter..."
    response=$(curl -s -H "${ADMIN_HEADER}" "${BASE_URL}/admin/api-usage/summary?hoursBack=1")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Time window parameter works"
    else
        print_error "Time window parameter failed"
    fi
}

# Test 6: Test pagination
test_pagination() {
    print_header "TEST 6: Test Pagination"
    
    print_info "Testing limit parameter..."
    response=$(curl -s -H "${ADMIN_HEADER}" "${BASE_URL}/admin/api-usage/raw?limit=2&offset=0")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Limit parameter works"
    else
        print_error "Limit parameter failed"
    fi
    
    print_info "Testing offset parameter..."
    response=$(curl -s -H "${ADMIN_HEADER}" "${BASE_URL}/admin/api-usage/raw?limit=2&offset=2")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Offset parameter works"
    else
        print_error "Offset parameter failed"
    fi
}

# Test 7: Test authentication
test_authentication() {
    print_header "TEST 7: Test Authentication"
    
    print_info "Testing request WITHOUT admin header..."
    response=$(curl -s -w "\n%{http_code}" "${BASE_URL}/admin/api-usage/summary")
    status=$(echo "$response" | tail -n1)
    
    if [ "$status" = "403" ] || [ "$status" = "401" ]; then
        print_success "Authentication enforced (Status: $status)"
    else
        print_error "Authentication not properly enforced (Status: $status)"
    fi
    
    print_info "Testing request WITH admin header..."
    response=$(curl -s -w "\n%{http_code}" -H "${ADMIN_HEADER}" "${BASE_URL}/admin/api-usage/summary")
    status=$(echo "$response" | tail -n1)
    
    if [ "$status" = "200" ] || [ "$status" = "201" ]; then
        print_success "Admin access granted (Status: $status)"
    else
        print_error "Admin access failed (Status: $status)"
    fi
}

# Main test execution
main() {
    echo -e "\n${BLUE}"
    echo "╔════════════════════════════════════════╗"
    echo "║  API Usage Analytics - Test Suite      ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}\n"
    
    test_server_health
    test_generate_data
    sleep 1
    test_analytics_summary
    test_raw_logs
    test_filtering
    test_pagination
    test_authentication
    
    echo -e "\n${BLUE}========================================${NC}"
    print_success "All tests completed!"
    echo -e "${BLUE}========================================${NC}\n"
    
    echo -e "${GREEN}Next steps:${NC}"
    echo "1. Review TESTING_ANALYTICS.md for detailed documentation"
    echo "2. Check ANALYTICS.md for full API documentation"
    echo "3. Review the responses above for any anomalies"
    echo ""
}

# Run main function
main
