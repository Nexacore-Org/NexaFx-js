#!/bin/bash

echo "Testing Payload Sanitizer Implementation"
echo "======================================="

BASE_URL="http://localhost:3000"
TEST_ENDPOINT="$BASE_URL/api/test"
ADMIN_TOKEN="admin-token-for-testing"

echo "Testing payload sanitizer on: $TEST_ENDPOINT"
echo ""

# Function to make a request and show response
make_request() {
    local method="$1"
    local url="$2"
    local data="$3"
    local description="$4"
    
    echo "Test: $description"
    echo "Method: $method"
    echo "URL: $url"
    echo "Payload: $data"
    
    response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
                   -X "$method" \
                   -H "Content-Type: application/json" \
                   -H "Authorization: Bearer $ADMIN_TOKEN" \
                   -d "$data" \
                   "$url")
    
    echo "Response: $response"
    echo "----------------------------------------"
    echo ""
}

# Test 1: Normal request (should pass)
echo "=== Test 1: Normal Request ==="
make_request "POST" "$TEST_ENDPOINT" '{"name":"John Doe","email":"john@example.com"}' "Normal request with safe payload"

# Test 2: XSS attack
echo "=== Test 2: XSS Attack ==="
make_request "POST" "$TEST_ENDPOINT" '{"name":"<script>alert(\"XSS\")</script>","email":"john@example.com"}' "XSS attack in name field"

# Test 3: SQL Injection attack
echo "=== Test 3: SQL Injection Attack ==="
make_request "POST" "$TEST_ENDPOINT" '{"id":"1; DROP TABLE users;","email":"john@example.com"}' "SQL injection in id field"

# Test 4: Command Injection attack
echo "=== Test 4: Command Injection Attack ==="
make_request "POST" "$TEST_ENDPOINT" '{"command":"ls | grep password"}' "Command injection in command field"

# Test 5: Path Traversal attack
echo "=== Test 5: Path Traversal Attack ==="
make_request "POST" "$TEST_ENDPOINT" '{"filename":"../../../etc/passwd"}' "Path traversal in filename field"

# Test 6: Get statistics
echo "=== Test 6: Get Statistics ==="
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE_URL/payload-sanitizer/statistics" | jq .

# Test 7: Validate string
echo "=== Test 7: Validate String ==="
curl -s -X POST \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"value":"<script>alert(\"test\")</script>"}' \
     "$BASE_URL/payload-sanitizer/validate" | jq .

echo ""
echo "Payload sanitizer tests completed!"
echo ""
echo "Expected behavior:"
echo "- Test 1 should succeed (200)"
echo "- Tests 2-5 should be blocked (400)"
echo "- Test 6 should show statistics including blocked requests"
echo "- Test 7 should show validation results for the test string"
