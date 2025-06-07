#!/bin/bash

echo "Testing Session Management Implementation"
echo "======================================="

BASE_URL="http://localhost:3000"
AUTH_URL="$BASE_URL/auth"
SESSION_URL="$BASE_URL/sessions"

echo "Testing session management on: $SESSION_URL"
echo ""

# Function to make a request and show response
make_request() {
    local method="$1"
    local url="$2"
    local data="$3"
    local headers="$4"
    local description="$5"
    
    echo "Test: $description"
    echo "Method: $method"
    echo "URL: $url"
    
    if [ -n "$headers" ]; then
        header_args="-H $headers"
    else
        header_args=""
    fi
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
                       -X "$method" \
                       -H "Content-Type: application/json" \
                       $header_args \
                       -d "$data" \
                       "$url")
    else
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
                       -X "$method" \
                       $header_args \
                       "$url")
    fi
    
    echo "Response: $response"
    echo "----------------------------------------"
    echo ""
}

# Test 1: Create a session by logging in
echo "=== Test 1: Create Session (Login) ==="
login_response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
                     -X POST \
                     -H "Content-Type: application/json" \
                     -d '{"username":"admin","password":"password"}' \
                     "$AUTH_URL/login")

echo "Login Response: $login_response"

# Extract session token (assuming it's returned in the response)
# In a real implementation, this would be extracted from the response
SESSION_TOKEN="dummy-session-token-for-testing"
echo "Session Token: $SESSION_TOKEN"
echo ""

# Test 2: Get current session
echo "=== Test 2: Get Current Session ==="
make_request "GET" "$SESSION_URL/current" "" "Authorization: Bearer $SESSION_TOKEN" "Get current session info"

# Test 3: Get user's sessions
echo "=== Test 3: Get User Sessions ==="
make_request "GET" "$SESSION_URL/my" "" "Authorization: Bearer $SESSION_TOKEN" "Get all my sessions"

# Test 4: Refresh session
echo "=== Test 4: Refresh Session ==="
make_request "POST" "$SESSION_URL/refresh" "" "Authorization: Bearer $SESSION_TOKEN" "Refresh current session"

# Test 5: Extend session
echo "=== Test 5: Extend Session ==="
make_request "POST" "$SESSION_URL/extend" '{"additionalTime": 3600000}' "Authorization: Bearer $SESSION_TOKEN" "Extend session by 1 hour"

# Test 6: Update session metadata
echo "=== Test 6: Update Session Metadata ==="
make_request "POST" "$SESSION_URL/metadata" '{"lastAction": "test", "preferences": {"theme": "dark"}}' "Authorization: Bearer $SESSION_TOKEN" "Update session metadata"

# Test 7: Get session statistics (admin only)
echo "=== Test 7: Get Session Statistics ==="
make_request "GET" "$SESSION_URL/statistics?hours=24" "" "Authorization: Bearer $SESSION_TOKEN" "Get session statistics"

# Test 8: Get active sessions count (admin only)
echo "=== Test 8: Get Active Sessions Count ==="
make_request "GET" "$SESSION_URL/active/count" "" "Authorization: Bearer $SESSION_TOKEN" "Get active sessions count"

# Test 9: Cleanup expired sessions (admin only)
echo "=== Test 9: Cleanup Expired Sessions ==="
make_request "POST" "$SESSION_URL/cleanup" "" "Authorization: Bearer $SESSION_TOKEN" "Cleanup expired sessions"

# Test 10: Invalidate all other sessions
echo "=== Test 10: Invalidate All Other Sessions ==="
make_request "DELETE" "$SESSION_URL/my/all" "" "Authorization: Bearer $SESSION_TOKEN" "Invalidate all other sessions"

# Test 11: Logout (invalidate current session)
echo "=== Test 11: Logout (Invalidate Current Session) ==="
make_request "DELETE" "$SESSION_URL/current" "" "Authorization: Bearer $SESSION_TOKEN" "Logout - invalidate current session"

# Test 12: Try to access protected endpoint after logout
echo "=== Test 12: Access After Logout ==="
make_request "GET" "$SESSION_URL/current" "" "Authorization: Bearer $SESSION_TOKEN" "Try to access after logout (should fail)"

echo ""
echo "Session management tests completed!"
echo ""
echo "Expected behavior:"
echo "- Login should create a new session"
echo "- Session operations should work with valid token"
echo "- Session should be refreshed and extended successfully"
echo "- Statistics should be available for admin users"
echo "- Logout should invalidate the session"
echo "- Access after logout should be denied"
