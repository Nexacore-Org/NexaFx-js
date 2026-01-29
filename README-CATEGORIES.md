# Transaction Categorization Feature

## Overview
This feature adds transaction categorization capabilities to the NexaFx-js application, enabling analytics and user insights through organized transaction data.

## Implemented Components

### 1. Database Schema
- **Transaction Categories Table**: Stores category definitions with keywords and merchant tags
- **Category ID Column**: Added to transactions table as nullable foreign key

### 2. Entities
- `TransactionCategoryEntity` - Defines category structure
- Updated `TransactionEntity` with categoryId relationship

### 3. Endpoints

#### GET `/transactions/categories`
Retrieve all transaction categories

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Bills",
      "description": "Utility bills and recurring payments",
      "keywords": ["electricity", "water", "internet"],
      "merchantTags": null,
      "createdAt": "2026-01-28T00:00:00.000Z",
      "updatedAt": "2026-01-28T00:00:00.000Z"
    }
  ]
}
```

#### POST `/transactions/categories`
Create a new transaction category

**Request Body:**
```json
{
  "name": "Shopping",
  "description": "Retail purchases",
  "keywords": ["amazon", "walmart", "store"],
  "merchantTags": ["retail", "ecommerce"]
}
```

#### PATCH `/transactions/:id/category`
Assign a category to a transaction

**Request Body:**
```json
{
  "categoryId": "uuid-of-category"
}
```

### 4. Search Enhancement
The existing `/transactions/search` endpoint now supports filtering by category:

```
GET /transactions/search?categoryId=uuid&status=SUCCESS
```

## Migration
Run the database migration to create tables and columns:

```bash
npm run build
# Then run your TypeORM migration command
```

Migration file: `src/database/migrations/xxxxxx-create-transaction-categories.ts`

## Future Enhancements
- Rule-based automatic categorization using keywords and merchant tags
- Category assignment history tracking
- Analytics dashboards using categorized data
- Machine learning-based categorization suggestions

## Testing
Use the provided test script:
```bash
node test-categories.js
```

Replace `YOUR_TRANSACTION_ID_HERE` with an actual transaction ID from your database.
