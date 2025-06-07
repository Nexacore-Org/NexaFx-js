#!/bin/bash

echo "Testing Rate Limiting Implementation"
echo "==================================="

BASE_URL="http://localhost:3000"
TEST_ENDPOINT="$BASE_URL/auth/login"

echo "Testing rate limiting on: $TEST_ENDPOINT"
echo ""

# Function to make a request and show response
make_request() {
    local url="$1"
    local data="$2"
    local description="$3"
    
    echo "Test: $description"
    echo "URL: $url"
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}\nRESPONSE_TIME:%{time_total}" \
                       -H "Content-Type: application/json" \
                       -d "$data" \
                       "$url")
    else
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}\nRESPONSE_TIME:%{time_total}" \
                       -H "X-Forwarded-For: 192.168.1.100" \
                       "$url")
    fi
    
    echo "Response: $response"
    echo "----------------------------------------"
    echo ""
}

# Test 1: Normal requests within limit
echo "=== Test 1: Normal Requests ==="
for i in {1..3}; do
    make_request "$TEST_ENDPOINT" '{"username":"test","password":"wrong"}' "Request $i (should succeed)"
    sleep 1
done

# Test 2: Rapid requests to trigger rate limiting
echo "=== Test 2: Rapid Requests (Rate Limiting) ==="
for i in {1..8}; do
    make_request "$TEST_ENDPOINT" '{"username":"test","password":"wrong"}' "Rapid request $i"
done

# Test 3: Check rate limit status
echo "=== Test 3: Rate Limit Statistics ==="
make_request "$BASE_URL/rate-limit/statistics" "" "Get statistics"

# Test 4: Test IP status
echo "=== Test 4: IP Status Check ==="
make_request "$BASE_URL/rate-limit/status/192.168.1.100" "" "Check IP status"

# Test 5: Test whitelist functionality
echo "=== Test 5: Whitelist Test ==="
echo "Adding IP to whitelist..."
curl -s -X POST "$BASE_URL/rate-limit/whitelist/192.168.1.200" \
     -H "Content-Type: application/json" \
     -d '{"duration": 60000}'

echo "Testing requests from whitelisted IP..."
for i in {1..5}; do
    make_request "$TEST_ENDPOINT" '{"username":"test","password":"wrong"}' "Whitelisted request $i"
done

# Test 6: Test blacklist functionality
echo "=== Test 6: Blacklist Test ==="
echo "Adding IP to blacklist..."
curl -s -X POST "$BASE_URL/rate-limit/blacklist/192.168.1.300" \
     -H "Content-Type: application/json" \
     -d '{"duration": 60000}'

echo "Testing request from blacklisted IP..."
curl -s -H "X-Forwarded-For: 192.168.1.300" "$TEST_ENDPOINT"

echo ""
echo "Rate limiting tests completed!"
echo ""
echo "Expected behavior:"
echo "- First 3 requests should succeed (200)"
echo "- Rapid requests should start getting blocked (429)"
echo "- Whitelisted IP should bypass rate limits"
echo "- Blacklisted IP should be immediately blocked (403)"
