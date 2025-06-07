#!/bin/bash

echo "Testing Backup and Restore Implementation"
echo "========================================"

BASE_URL="http://localhost:3000"
BACKUP_URL="$BASE_URL/backup"
ADMIN_TOKEN="admin-session-token"
API_KEY="backup-api-key-default"

echo "Testing backup system on: $BACKUP_URL"
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
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
                       -X "$method" \
                       -H "Content-Type: application/json" \
                       -H "Authorization: Bearer $ADMIN_TOKEN" \
                       -H "X-API-Key: $API_KEY" \
                       -d "$data" \
                       "$url")
    else
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
                       -X "$method" \
                       -H "Authorization: Bearer $ADMIN_TOKEN" \
                       -H "X-API-Key: $API_KEY" \
                       "$url")
    fi
    
    echo "Response: $response"
    echo "----------------------------------------"
    echo ""
}

# Test 1: Create database backup
echo "=== Test 1: Create Database Backup ==="
db_backup_response=$(make_request "POST" "$BACKUP_URL/create" '{
    "type": "database",
    "description": "Test database backup",
    "tags": ["test", "database", "manual"],
    "retention": 7
}' "Create database backup")

# Extract backup ID from response (simplified)
DB_BACKUP_ID="test-backup-id-1"

# Test 2: Create files backup
echo "=== Test 2: Create Files Backup ==="
make_request "POST" "$BACKUP_URL/create" '{
    "type": "files",
    "description": "Test files backup",
    "tags": ["test", "files"],
    "compress": true,
    "encrypt": true
}' "Create files backup"

# Test 3: Create full backup
echo "=== Test 3: Create Full Backup ==="
make_request "POST" "$BACKUP_URL/create" '{
    "type": "full",
    "description": "Test full system backup",
    "tags": ["test", "full", "weekly"],
    "retention": 30
}' "Create full backup"

# Test 4: List all backups
echo "=== Test 4: List All Backups ==="
make_request "GET" "$BACKUP_URL/list" "" "List all backups"

# Test 5: List backups with filters
echo "=== Test 5: List Filtered Backups ==="
make_request "GET" "$BACKUP_URL/list?type=database&tags=test&limit=5" "" "List filtered backups"

# Test 6: Get backup details
echo "=== Test 6: Get Backup Details ==="
make_request "GET" "$BACKUP_URL/$DB_BACKUP_ID" "" "Get specific backup details"

# Test 7: Validate backup
echo "=== Test 7: Validate Backup ==="
make_request "POST" "$BACKUP_URL/validate/$DB_BACKUP_ID" "" "Validate backup integrity"

# Test 8: Get backup statistics
echo "=== Test 8: Get Backup Statistics ==="
make_request "GET" "$BACKUP_URL/statistics/overview" "" "Get backup statistics"

# Test 9: Restore backup
echo "=== Test 9: Restore Backup ==="
make_request "POST" "$BACKUP_URL/restore" '{
    "backupId": "'$DB_BACKUP_ID'",
    "destination": "/tmp/restore-test",
    "overwrite": false,
    "validateChecksum": true
}' "Restore database backup"

# Test 10: Trigger manual database backup
echo "=== Test 10: Trigger Manual Database Backup ==="
make_request "POST" "$BACKUP_URL/schedule/database" "" "Trigger manual database backup"

# Test 11: Trigger manual full backup
echo "=== Test 11: Trigger Manual Full Backup ==="
make_request "POST" "$BACKUP_URL/schedule/full" "" "Trigger manual full backup"

# Test 12: Cleanup expired backups
echo "=== Test 12: Cleanup Expired Backups ==="
make_request "POST" "$BACKUP_URL/cleanup/expired" "" "Cleanup expired backups"

# Test 13: Test without API key (should still work with admin session)
echo "=== Test 13: Test Without API Key ==="
curl -s -w "\nHTTP_CODE:%{http_code}" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     "$BACKUP_URL/list" | head -20

# Test 14: Test with invalid API key
echo "=== Test 14: Test With Invalid API Key ==="
curl -s -w "\nHTTP_CODE:%{http_code}" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "X-API-Key: invalid-key" \
     "$BACKUP_URL/list" | head -20

# Test 15: Delete backup
echo "=== Test 15: Delete Backup ==="
make_request "DELETE" "$BACKUP_URL/$DB_BACKUP_ID" "" "Delete backup"

# Test 16: Health check
echo "=== Test 16: Health Check ==="
make_request "GET" "$BACKUP_URL/health" "" "Health check"

echo ""
echo "Backup and restore tests completed!"
echo ""
echo "Expected behavior:"
echo "- Backup creation should succeed for all types"
echo "- Backups should be listed and filtered correctly"
echo "- Backup validation should pass for valid backups"
echo "- Restore operations should complete successfully"
echo "- Statistics should show backup information"
echo "- Manual triggers should work"
echo "- Cleanup should remove expired backups"
echo "- Admin authentication should be required"
echo "- API key validation should work"
