#!/usr/bin/env node

/**
 * API Analytics Endpoint Test Script
 *
 * This script demonstrates how to use the API analytics endpoints
 * without requiring a running database.
 */

console.log('🧪 API Usage Analytics - Endpoint Testing Guide\n');
console.log('='.repeat(60));

// Test 1: Make regular API requests
console.log('\n📝 STEP 1: Generate API Usage Data');
console.log('-'.repeat(60));
console.log(`
When the application is running, make requests to any endpoints:

  curl http://localhost:3000/api/transactions
  curl http://localhost:3000/api/webhooks
  curl http://localhost:3000/api/enrichment
  
Each request will be automatically logged to the analytics database.
`);

// Test 2: Check summary analytics
console.log('\n📊 STEP 2: Get Analytics Summary');
console.log('-'.repeat(60));
console.log(`
Retrieve aggregated metrics for the last 24 hours:

  curl -H "x-admin: true" \\
    http://localhost:3000/admin/api-usage/summary

Expected response:
{
  "success": true,
  "data": {
    "totalRequests": 1523,
    "averageResponseTime": 145.32,
    "requestsByRoute": [
      {
        "route": "/api/transactions",
        "method": "GET",
        "count": 487,
        "avgDuration": 234
      },
      {
        "route": "/api/transactions/search",
        "method": "GET",
        "count": 412,
        "avgDuration": 567
      }
    ],
    "requestsByStatusCode": [
      {
        "statusCode": 200,
        "count": 1489
      },
      {
        "statusCode": 400,
        "count": 34
      }
    ],
    "topUsers": [
      {
        "userId": "user-123",
        "requestCount": 89
      },
      {
        "userId": "user-456",
        "requestCount": 67
      }
    ]
  }
}
`);

// Test 3: Get detailed logs
console.log('\n📋 STEP 3: Get Detailed Request Logs');
console.log('-'.repeat(60));
console.log(`
Retrieve individual request logs with optional filtering:

  curl -H "x-admin: true" \\
    "http://localhost:3000/admin/api-usage/raw?limit=10&offset=0"

  curl -H "x-admin: true" \\
    "http://localhost:3000/admin/api-usage/raw?route=/api/transactions&statusCode=200"

Expected response:
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "route": "/api/transactions",
      "method": "GET",
      "userId": "user-123",
      "durationMs": 123,
      "statusCode": 200,
      "userAgent": "curl/7.68.0",
      "ipAddress": "127.0.0.1",
      "createdAt": "2026-01-25T15:30:00.000Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "route": "/api/transactions/search",
      "method": "POST",
      "userId": "user-456",
      "durationMs": 567,
      "statusCode": 200,
      "userAgent": "Mozilla/5.0...",
      "ipAddress": "192.168.1.1",
      "createdAt": "2026-01-25T15:29:45.000Z"
    }
  ],
  "meta": {
    "total": 1523,
    "limit": 10,
    "offset": 0
  }
}
`);

// Test 4: Advanced filtering
console.log('\n🔍 STEP 4: Advanced Log Filtering');
console.log('-'.repeat(60));
console.log(`
Query parameters for detailed logs endpoint:

  ?limit=100          - Number of records (default: 100)
  ?offset=0           - Pagination offset (default: 0)
  ?route=/api/...     - Filter by specific endpoint
  ?method=GET         - Filter by HTTP method (GET, POST, PUT, DELETE, PATCH)
  ?statusCode=500     - Filter by status code (e.g., 500 for errors)
  ?hoursBack=48       - Time window in hours (default: 24)

Examples:

  # Get only failed requests (500 errors)
  curl -H "x-admin: true" \\
    "http://localhost:3000/admin/api-usage/raw?statusCode=500"

  # Get slow transactions endpoint requests
  curl -H "x-admin: true" \\
    "http://localhost:3000/admin/api-usage/raw?route=/api/transactions&hoursBack=48"

  # Get POST requests from past 7 days
  curl -H "x-admin: true" \\
    "http://localhost:3000/admin/api-usage/raw?method=POST&hoursBack=168"

  # Paginate through 50 records at a time
  curl -H "x-admin: true" \\
    "http://localhost:3000/admin/api-usage/raw?limit=50&offset=0"
`);

// Test 5: Summary with different time windows
console.log('\n⏰ STEP 5: Summary Analytics - Time Windows');
console.log('-'.repeat(60));
console.log(`
You can specify different time windows for summary analytics:

  # Last 1 hour
  curl -H "x-admin: true" \\
    "http://localhost:3000/admin/api-usage/summary?hoursBack=1"

  # Last 24 hours (default)
  curl -H "x-admin: true" \\
    "http://localhost:3000/admin/api-usage/summary?hoursBack=24"

  # Last 7 days
  curl -H "x-admin: true" \\
    "http://localhost:3000/admin/api-usage/summary?hoursBack=168"

  # Last 30 days
  curl -H "x-admin: true" \\
    "http://localhost:3000/admin/api-usage/summary?hoursBack=720"
`);

// Test 6: Authentication note
console.log('\n🔐 STEP 6: Authentication');
console.log('-'.repeat(60));
console.log(`
All analytics endpoints require admin access.

Current test implementation: "x-admin: true" header

In production, replace with:
  - JWT token with admin claims
  - API key with admin permissions
  - Custom authentication scheme

All requests are protected by AdminGuard.
`);

// Test 7: Real-world use cases
console.log('\n💡 STEP 7: Real-World Use Cases');
console.log('-'.repeat(60));
console.log(`
1. Identify Slow Endpoints
   → Check 'requestsByRoute' in summary
   → Look for routes with high 'avgDuration'

2. Monitor Error Rates
   → Check 'requestsByStatusCode' in summary
   → Query raw logs filtering by statusCode >= 400

3. Track User Activity
   → Check 'topUsers' in summary
   → Query raw logs filtering by specific userId

4. Debug Performance Issues
   → Filter by route and statusCode
   → Look at durationMs and timestamps
   → Correlate with infrastructure metrics

5. Capacity Planning
   → Monitor 'totalRequests' trend over days/weeks
   → Identify peak usage times
   → Plan scaling based on patterns

6. Feature Usage Analysis
   → Track requests to specific feature endpoints
   → Understand adoption rates
   → Identify unused endpoints
`);

// Test 8: Database information
console.log('\n💾 STEP 8: Database Schema');
console.log('-'.repeat(60));
console.log(`
The api_usage_logs table stores:
  - id (UUID)
  - route (VARCHAR 255)
  - method (VARCHAR 10)
  - userId (UUID, nullable)
  - durationMs (INT)
  - statusCode (INT)
  - userAgent (TEXT)
  - ipAddress (VARCHAR 45)
  - createdAt (TIMESTAMP)

Indices are created on:
  - route
  - method
  - userId
  - createdAt
  - (route, method) - composite

Automatic cleanup: Logs older than 30 days are removed daily at 2 AM.
`);

console.log('\n' + '='.repeat(60));
console.log('✅ Analytics system is ready to use!');
console.log('='.repeat(60) + '\n');

process.exit(0);
