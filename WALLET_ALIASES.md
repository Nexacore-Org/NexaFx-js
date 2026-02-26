# Wallet Aliases Feature

This feature allows users to assign human-readable names to wallet addresses for easier identification and management.

## Overview

Users can create, read, update, and delete aliases for their wallet addresses. These aliases are then displayed alongside wallet addresses in transaction responses, making it easier to identify wallets at a glance.

## API Endpoints

### Create Wallet Alias
```http
POST /wallet-aliases
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "alias": "My Savings Wallet",
  "metadata": {
    "type": "savings",
    "description": "Main savings account"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "user-uuid",
    "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "alias": "My Savings Wallet",
    "metadata": {
      "type": "savings",
      "description": "Main savings account"
    },
    "createdAt": "2025-01-26T10:00:00Z",
    "updatedAt": "2025-01-26T10:00:00Z"
  }
}
```

### List Wallet Aliases
```http
GET /wallet-aliases
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "user-uuid",
      "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
      "alias": "My Savings Wallet",
      "metadata": {
        "type": "savings",
        "description": "Main savings account"
      },
      "createdAt": "2025-01-26T10:00:00Z",
      "updatedAt": "2025-01-26T10:00:00Z"
    }
  ]
}
```

### Update Wallet Alias
```http
PUT /wallet-aliases/:id
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "alias": "Updated Wallet Name",
  "metadata": {
    "type": "checking",
    "description": "Updated description"
  }
}
```

### Delete Wallet Alias
```http
DELETE /wallet-aliases/:id
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Wallet alias deleted successfully"
}
```

## Enhanced Transaction Responses

When searching transactions, wallet aliases are automatically included in the response:

```http
GET /transactions/search
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "tx-uuid",
      "amount": "100.50",
      "currency": "USD",
      "status": "SUCCESS",
      "metadata": {
        "fromAddress": "0x1234567890abcdef1234567890abcdef12345678",
        "toAddress": "0xabcdef1234567890abcdef1234567890abcdef12"
      },
      "walletAliases": {
        "0x1234567890abcdef1234567890abcdef12345678": "My Savings Wallet",
        "0xabcdef1234567890abcdef1234567890abcdef12": "Business Wallet"
      },
      "createdAt": "2025-01-26T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

## Database Schema

### wallet_aliases table
- `id` (UUID, Primary Key)
- `userId` (UUID, Foreign Key)
- `walletAddress` (VARCHAR(255))
- `alias` (VARCHAR(100))
- `metadata` (JSONB, optional)
- `createdAt` (TIMESTAMPTZ)
- `updatedAt` (TIMESTAMPTZ)

### Indexes
- `idx_wallet_alias_user_id` on `userId`
- `idx_wallet_alias_wallet_address` on `walletAddress`
- `idx_wallet_alias_user_wallet` on `(userId, walletAddress)` - UNIQUE

## Features

✅ **User-specific aliases**: Each user can only see and manage their own wallet aliases
✅ **Unique constraint**: One alias per user per wallet address
✅ **Flexible metadata**: Store additional information about wallets in JSONB format
✅ **Automatic enrichment**: Transaction responses automatically include relevant wallet aliases
✅ **RESTful API**: Standard CRUD operations following REST conventions
✅ **JWT Authentication**: All endpoints protected with JWT authentication
✅ **Input validation**: Request validation using class-validator decorators
✅ **Error handling**: Proper HTTP status codes and error messages

## Security

- All endpoints require JWT authentication
- Users can only access their own wallet aliases
- Input validation prevents malicious data
- Unique constraints prevent duplicate aliases per user/wallet combination

## Testing

Use the provided test script to verify functionality:

```bash
# Update the AUTH_TOKEN in test-wallet-aliases.js
node test-wallet-aliases.js
```

## Migration

Run the database migration to create the wallet_aliases table:

```bash
npm run migration:run
```

The migration file is located at: `src/database/migrations/20250126000000-create-wallet-aliases.ts`