#!/bin/bash

echo "Testing Security Headers Implementation"
echo "======================================"

# Test endpoint
URL="http://localhost:3000/security/headers/test"

echo "Testing security headers on: $URL"
echo ""

# Get headers
HEADERS=$(curl -s -I "$URL")

echo "Response Headers:"
echo "$HEADERS"
echo ""

# Check specific security headers
echo "Security Headers Analysis:"
echo "=========================="

check_header() {
    local header_name="$1"
    local expected_pattern="$2"
    
    if echo "$HEADERS" | grep -i "$header_name" > /dev/null; then
        echo "✅ $header_name: PRESENT"
        if [ -n "$expected_pattern" ]; then
            if echo "$HEADERS" | grep -i "$header_name" | grep -i "$expected_pattern" > /dev/null; then
                echo "   ✅ Contains expected value: $expected_pattern"
            else
                echo "   ⚠️  May not contain expected value: $expected_pattern"
            fi
        fi
    else
        echo "❌ $header_name: MISSING"
    fi
}

# Check all security headers
check_header "strict-transport-security" "max-age"
check_header "x-frame-options" "deny"
check_header "x-content-type-options" "nosniff"
check_header "x-xss-protection" "1"
check_header "referrer-policy" "strict-origin"
check_header "content-security-policy" "default-src"
check_header "permissions-policy"
check_header "cross-origin-opener-policy"
check_header "cross-origin-resource-policy"

# Check for removed headers
echo ""
echo "Removed Headers Check:"
echo "====================="

if echo "$HEADERS" | grep -i "x-powered-by" > /dev/null; then
    echo "⚠️  X-Powered-By: STILL PRESENT (should be removed)"
else
    echo "✅ X-Powered-By: REMOVED"
fi

if echo "$HEADERS" | grep -i "server:" > /dev/null; then
    echo "⚠️  Server: STILL PRESENT (should be removed)"
else
    echo "✅ Server: REMOVED"
fi

echo ""
echo "Test completed!"
